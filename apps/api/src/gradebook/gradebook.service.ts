import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { GradeCategoryKind } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/decorators/current-user.decorator';
import { combineWeighted, letterFor, ratioPct, type CategoryScore } from './grade-calc';
import type { CreateCategoryDto, UpdateCategoryDto } from './dto/gradebook.dto';

export interface StudentRef { id: string; name: string; email: string }

/**
 * Weighted gradebook, computed on read from the primary records
 * (submissions, live-quiz answers, attendance) rather than stored —
 * a re-grade or a late attendance override is reflected immediately
 * and there is no cached figure to corrupt.
 *
 * Teacher rows count GRADED and RETURNED work. A student's own view
 * counts only RETURNED — a grade the teacher hasn't released yet
 * doesn't exist as far as the student is concerned.
 */
@Injectable()
export class GradebookService {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  private async courseForAuthor(user: AuthUser, courseId: string) {
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
      select: { id: true, code: true, name: true, teacherId: true },
    });
    if (!course) throw new NotFoundException('Course not found');
    if (user.role !== 'ADMIN' && course.teacherId !== user.id) {
      throw new ForbiddenException('You do not teach this course');
    }
    return course;
  }

  /* ── Categories ────────────────────────────────────────── */

  async listCategories(user: AuthUser, courseId: string) {
    if (user.role === 'STUDENT') {
      const enrolled = await this.prisma.enrollment.count({ where: { courseId, studentId: user.id } });
      if (!enrolled) throw new ForbiddenException('You are not enrolled in this course');
    } else {
      await this.courseForAuthor(user, courseId);
    }
    return this.prisma.gradeCategory.findMany({
      where: { courseId },
      orderBy: { order: 'asc' },
      include: { _count: { select: { assignments: true } } },
    });
  }

  async createCategory(user: AuthUser, courseId: string, dto: CreateCategoryDto) {
    const course = await this.courseForAuthor(user, courseId);
    const category = await this.prisma.gradeCategory.create({
      data: {
        courseId,
        name: dto.name,
        kind: dto.kind ?? 'ASSIGNMENTS',
        weightPct: dto.weightPct,
        order: dto.order ?? 0,
      },
    });
    await this.audit.record(user, {
      action: 'gradebook.category.create', targetType: 'gradeCategory', targetId: category.id,
      summary: `Added grade category “${dto.name}” (${dto.weightPct}%) to ${course.code}`,
    });
    return category;
  }

  async updateCategory(user: AuthUser, id: string, dto: UpdateCategoryDto) {
    const existing = await this.prisma.gradeCategory.findUnique({
      where: { id }, select: { courseId: true, name: true },
    });
    if (!existing) throw new NotFoundException('Category not found');
    await this.courseForAuthor(user, existing.courseId);
    return this.prisma.gradeCategory.update({ where: { id }, data: { ...dto } });
  }

  async removeCategory(user: AuthUser, id: string) {
    const existing = await this.prisma.gradeCategory.findUnique({
      where: { id }, select: { courseId: true, name: true },
    });
    if (!existing) throw new NotFoundException('Category not found');
    const course = await this.courseForAuthor(user, existing.courseId);
    await this.prisma.gradeCategory.delete({ where: { id } });
    await this.audit.record(user, {
      action: 'gradebook.category.delete', targetType: 'gradeCategory', targetId: id,
      summary: `Removed grade category “${existing.name}” from ${course.code}`,
    });
    return { ok: true };
  }

  /* ── Computation ───────────────────────────────────────── */

  /**
   * Gathers everything once per course, then computes per student.
   * `releasedOnly` restricts assignment marks to RETURNED submissions
   * (the student view); the teacher gradebook also counts GRADED.
   */
  private async computeCourse(courseId: string, students: StudentRef[], releasedOnly: boolean) {
    const [categories, assignments, submissions, questions, answers, sessions, attendance] =
      await Promise.all([
        this.prisma.gradeCategory.findMany({ where: { courseId }, orderBy: { order: 'asc' } }),
        this.prisma.assignment.findMany({
          where: { courseId, status: { in: ['PUBLISHED', 'SCHEDULED'] } },
          select: { id: true, title: true, maxMarks: true, dueAt: true, categoryId: true },
          orderBy: { dueAt: 'asc' },
        }),
        this.prisma.submission.findMany({
          where: {
            assignment: { courseId },
            status: releasedOnly ? 'RETURNED' : { in: ['GRADED', 'RETURNED'] },
            marksAwarded: { not: null },
            studentId: { in: students.map((s) => s.id) },
          },
          select: { assignmentId: true, studentId: true, marksAwarded: true, isLate: true, status: true },
        }),
        this.prisma.question.findMany({
          where: { session: { courseId }, state: 'CLOSED' },
          select: { id: true, marks: true },
        }),
        this.prisma.answer.findMany({
          where: { question: { session: { courseId }, state: 'CLOSED' }, studentId: { in: students.map((s) => s.id) } },
          select: { studentId: true, marksAwarded: true },
        }),
        this.prisma.classSession.findMany({
          where: { courseId, status: 'CLOSED' },
          select: { id: true },
        }),
        this.prisma.attendance.findMany({
          where: { session: { courseId, status: 'CLOSED' }, studentId: { in: students.map((s) => s.id) } },
          select: { studentId: true },
        }),
      ]);

    const quizPossible = questions.reduce((sum, q) => sum + q.marks, 0);
    const sessionsHeld = sessions.length;

    const subsByStudent = new Map<string, typeof submissions>();
    for (const s of submissions) {
      const list = subsByStudent.get(s.studentId) ?? [];
      list.push(s); subsByStudent.set(s.studentId, list);
    }
    const quizByStudent = new Map<string, number>();
    for (const a of answers) {
      quizByStudent.set(a.studentId, (quizByStudent.get(a.studentId) ?? 0) + a.marksAwarded);
    }
    const attByStudent = new Map<string, number>();
    for (const a of attendance) {
      attByStudent.set(a.studentId, (attByStudent.get(a.studentId) ?? 0) + 1);
    }

    const assignmentsByCategory = new Map<string | null, typeof assignments>();
    for (const a of assignments) {
      const list = assignmentsByCategory.get(a.categoryId) ?? [];
      list.push(a); assignmentsByCategory.set(a.categoryId, list);
    }

    // A course with no declared categories still gets a grade: one
    // implicit all-assignments bucket at 100%.
    const effectiveCategories = categories.length
      ? categories
      : [{ id: null as string | null, name: 'Assignments', kind: 'ASSIGNMENTS' as GradeCategoryKind, weightPct: 100, order: 0 }];

    const rows = students.map((student) => {
      const mySubs = subsByStudent.get(student.id) ?? [];
      const marksByAssignment = new Map(mySubs.map((s) => [s.assignmentId, s]));

      const perCategory = effectiveCategories.map((cat) => {
        let pct: number | null = null;
        if (cat.kind === 'ASSIGNMENTS') {
          const pool = categories.length
            ? assignmentsByCategory.get(cat.id as string) ?? []
            : assignments;
          let earned = 0; let possible = 0;
          for (const a of pool) {
            const sub = marksByAssignment.get(a.id);
            if (sub?.marksAwarded != null) { earned += sub.marksAwarded; possible += a.maxMarks; }
          }
          pct = ratioPct(earned, possible);
        } else if (cat.kind === 'LIVE_QUIZZES') {
          pct = ratioPct(quizByStudent.get(student.id) ?? 0, quizPossible);
        } else if (cat.kind === 'ATTENDANCE') {
          pct = ratioPct(attByStudent.get(student.id) ?? 0, sessionsHeld);
        }
        return { categoryId: cat.id, name: cat.name, kind: cat.kind, weightPct: cat.weightPct, pct };
      });

      const total = combineWeighted(perCategory as CategoryScore[]);
      return {
        student,
        perCategory,
        assignments: assignments.map((a) => {
          const sub = marksByAssignment.get(a.id);
          return { assignmentId: a.id, marks: sub?.marksAwarded ?? null, isLate: sub?.isLate ?? false };
        }),
        total,
        letter: letterFor(total),
      };
    });

    return {
      categories: effectiveCategories,
      assignments,
      quizPossible,
      sessionsHeld,
      rows,
    };
  }

  /** The full course gradebook — teacher and admin only. */
  async courseGradebook(user: AuthUser, courseId: string) {
    const course = await this.courseForAuthor(user, courseId);
    const enrollments = await this.prisma.enrollment.findMany({
      where: { courseId },
      include: { student: { select: { id: true, name: true, email: true } } },
      orderBy: { student: { name: 'asc' } },
    });
    const computed = await this.computeCourse(courseId, enrollments.map((e) => e.student), false);
    return { course: { id: course.id, code: course.code, name: course.name }, ...computed };
  }

  /** A student's own grades for one course — released marks only. */
  async myCourseGrades(user: AuthUser, courseId: string) {
    const enrolled = await this.prisma.enrollment.count({ where: { courseId, studentId: user.id } });
    if (!enrolled) throw new ForbiddenException('You are not enrolled in this course');
    const course = await this.prisma.course.findUnique({
      where: { id: courseId }, select: { id: true, code: true, name: true },
    });
    if (!course) throw new NotFoundException('Course not found');
    const me = await this.prisma.user.findUnique({
      where: { id: user.id }, select: { id: true, name: true, email: true },
    });
    const computed = await this.computeCourse(courseId, [me!], true);
    return { course, categories: computed.categories, assignments: computed.assignments, row: computed.rows[0] };
  }

  /** Every enrolled course, summarised — the student's grades page. */
  async myGrades(user: AuthUser) {
    const enrollments = await this.prisma.enrollment.findMany({
      where: { studentId: user.id },
      include: { course: { select: { id: true, code: true, name: true } } },
    });
    const me = { id: user.id, name: user.name, email: user.email };
    const out = [];
    for (const e of enrollments) {
      const computed = await this.computeCourse(e.courseId, [me], true);
      const row = computed.rows[0]!;
      out.push({
        course: e.course,
        total: row.total,
        letter: row.letter,
        perCategory: row.perCategory,
      });
    }
    return out;
  }
}
