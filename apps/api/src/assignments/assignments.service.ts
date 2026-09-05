import {
  BadRequestException, ForbiddenException, Injectable, NotFoundException,
} from '@nestjs/common';
import { ContentStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { FilesService } from '../files/files.service';
import { AuthUser } from '../common/decorators/current-user.decorator';
import type { CreateAssignmentDto, DraftDto, GradeDto, UpdateAssignmentDto } from './dto/assignments.dto';

const FILE_SELECT = {
  select: { id: true, originalName: true, mimeType: true, sizeBytes: true, createdAt: true },
} as const;

/**
 * Assignment engine.
 *
 * The invariants that matter:
 *  • Students see only live assignments — filtered in the query.
 *  • One Submission row per (assignment, student), enforced by the DB;
 *    a resubmission re-opens that row and bumps `attempt`.
 *  • `submittedAt`, `isLate`, and marks are set server-side. The
 *    client's clock and arithmetic are never trusted.
 *  • Grading and returning are audit-logged, and marks can only move
 *    within [0, maxMarks].
 */
@Injectable()
export class AssignmentsService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private notifications: NotificationsService,
    private files: FilesService,
  ) {}

  /** Assignments a student may see, as a where-clause. */
  private get liveOnly(): Prisma.AssignmentWhereInput {
    return {
      OR: [
        { status: ContentStatus.PUBLISHED },
        { status: ContentStatus.SCHEDULED, publishAt: { lte: new Date() } },
      ],
    };
  }

  private async assertCanAuthor(user: AuthUser, courseId: string) {
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

  private async assertEnrolled(user: AuthUser, courseId: string) {
    const enrolled = await this.prisma.enrollment.count({
      where: { courseId, studentId: user.id },
    });
    if (!enrolled) throw new ForbiddenException('You are not enrolled in this course');
  }

  /* ── Reads ─────────────────────────────────────────────── */

  async listForCourse(user: AuthUser, courseId: string) {
    if (user.role === 'STUDENT') {
      await this.assertEnrolled(user, courseId);
      const rows = await this.prisma.assignment.findMany({
        where: { courseId, ...this.liveOnly },
        orderBy: { dueAt: 'asc' },
        include: {
          files: FILE_SELECT,
          submissions: {
            where: { studentId: user.id },
            select: { id: true, status: true, submittedAt: true, isLate: true, marksAwarded: true, attempt: true },
          },
        },
      });
      return rows.map(({ submissions, ...a }) => ({ ...a, mySubmission: submissions[0] ?? null }));
    }

    await this.assertCanAuthor(user, courseId);
    return this.prisma.assignment.findMany({
      where: { courseId },
      orderBy: { dueAt: 'asc' },
      include: {
        files: FILE_SELECT,
        _count: { select: { submissions: { where: { status: { not: 'DRAFT' } } } } },
      },
    });
  }

  /** Everything due across the student's enrolled courses. */
  async myUpcoming(user: AuthUser) {
    const rows = await this.prisma.assignment.findMany({
      where: {
        course: { enrollments: { some: { studentId: user.id } } },
        ...this.liveOnly,
      },
      orderBy: { dueAt: 'asc' },
      include: {
        course: { select: { id: true, code: true, name: true } },
        submissions: {
          where: { studentId: user.id },
          select: { id: true, status: true, submittedAt: true, isLate: true, marksAwarded: true },
        },
      },
    });
    return rows.map(({ submissions, ...a }) => ({ ...a, mySubmission: submissions[0] ?? null }));
  }

  async detail(user: AuthUser, id: string) {
    const assignment = await this.prisma.assignment.findUnique({
      where: { id },
      include: {
        course: { select: { id: true, code: true, name: true, teacherId: true } },
        category: { select: { id: true, name: true } },
        files: FILE_SELECT,
      },
    });
    if (!assignment) throw new NotFoundException('Assignment not found');

    if (user.role === 'STUDENT') {
      await this.assertEnrolled(user, assignment.courseId);
      const live = assignment.status === 'PUBLISHED'
        || (assignment.status === 'SCHEDULED' && assignment.publishAt && assignment.publishAt <= new Date());
      if (!live) throw new NotFoundException('Assignment not found');
      const mySubmission = await this.prisma.submission.findUnique({
        where: { assignmentId_studentId: { assignmentId: id, studentId: user.id } },
        include: { files: FILE_SELECT },
      });
      return { ...assignment, mySubmission };
    }

    if (user.role !== 'ADMIN' && assignment.course.teacherId !== user.id) {
      throw new ForbiddenException('You do not teach this course');
    }
    const counts = await this.prisma.submission.groupBy({
      by: ['status'],
      where: { assignmentId: id },
      _count: true,
    });
    return { ...assignment, submissionCounts: counts.map((c) => ({ status: c.status, count: c._count })) };
  }

  /* ── Authoring ─────────────────────────────────────────── */

  async create(user: AuthUser, courseId: string, dto: CreateAssignmentDto) {
    const course = await this.assertCanAuthor(user, courseId);
    if (dto.categoryId) await this.assertCategoryInCourse(dto.categoryId, courseId);
    const assignment = await this.prisma.assignment.create({
      data: {
        courseId,
        title: dto.title,
        instructions: dto.instructions,
        maxMarks: dto.maxMarks ?? 100,
        dueAt: new Date(dto.dueAt),
        availableFrom: dto.availableFrom ? new Date(dto.availableFrom) : null,
        categoryId: dto.categoryId ?? null,
        allowLate: dto.allowLate ?? true,
        latePenaltyPct: dto.latePenaltyPct ?? 0,
        resubmissions: dto.resubmissions ?? false,
      },
    });
    await this.audit.record(user, {
      action: 'assignment.create', targetType: 'assignment', targetId: assignment.id,
      summary: `Created assignment “${assignment.title}” in ${course.code}`,
    });
    return assignment;
  }

  private async assertCategoryInCourse(categoryId: string, courseId: string) {
    const ok = await this.prisma.gradeCategory.count({ where: { id: categoryId, courseId } });
    if (!ok) throw new BadRequestException('Grade category belongs to a different course');
  }

  async update(user: AuthUser, id: string, dto: UpdateAssignmentDto) {
    const existing = await this.prisma.assignment.findUnique({
      where: { id },
      include: { course: { select: { id: true, code: true, teacherId: true } } },
    });
    if (!existing) throw new NotFoundException('Assignment not found');
    if (user.role !== 'ADMIN' && existing.course.teacherId !== user.id) {
      throw new ForbiddenException('You do not teach this course');
    }
    if (dto.categoryId) await this.assertCategoryInCourse(dto.categoryId, existing.courseId);

    const wasLive = existing.status === 'PUBLISHED';
    const assignment = await this.prisma.assignment.update({
      where: { id },
      data: {
        ...(dto.title !== undefined && { title: dto.title }),
        ...(dto.instructions !== undefined && { instructions: dto.instructions }),
        ...(dto.maxMarks !== undefined && { maxMarks: dto.maxMarks }),
        ...(dto.dueAt !== undefined && { dueAt: new Date(dto.dueAt) }),
        ...(dto.availableFrom !== undefined && { availableFrom: new Date(dto.availableFrom) }),
        ...(dto.categoryId !== undefined && { categoryId: dto.categoryId }),
        ...(dto.allowLate !== undefined && { allowLate: dto.allowLate }),
        ...(dto.latePenaltyPct !== undefined && { latePenaltyPct: dto.latePenaltyPct }),
        ...(dto.resubmissions !== undefined && { resubmissions: dto.resubmissions }),
        ...(dto.status !== undefined && { status: dto.status }),
        ...(dto.publishAt !== undefined && { publishAt: new Date(dto.publishAt) }),
      },
    });

    if (!wasLive && assignment.status === 'PUBLISHED') {
      await this.notifications.notifyCourse(existing.courseId, {
        type: 'assignment.published',
        title: `New assignment in ${existing.course.code}`,
        body: `${assignment.title} — due ${assignment.dueAt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`,
        link: `/student/assignments/${assignment.id}`,
      });
      await this.audit.record(user, {
        action: 'assignment.publish', targetType: 'assignment', targetId: id,
        summary: `Published assignment “${assignment.title}” in ${existing.course.code}`,
      });
    }
    return assignment;
  }

  async remove(user: AuthUser, id: string) {
    const existing = await this.prisma.assignment.findUnique({
      where: { id },
      include: { course: { select: { code: true, teacherId: true } } },
    });
    if (!existing) throw new NotFoundException('Assignment not found');
    if (user.role !== 'ADMIN' && existing.course.teacherId !== user.id) {
      throw new ForbiddenException('You do not teach this course');
    }
    await this.prisma.assignment.delete({ where: { id } });
    await this.audit.record(user, {
      action: 'assignment.delete', targetType: 'assignment', targetId: id,
      summary: `Deleted assignment “${existing.title}” in ${existing.course.code}`,
    });
    return { ok: true };
  }

  async attachFile(user: AuthUser, id: string, file: Express.Multer.File) {
    const assignment = await this.prisma.assignment.findUnique({
      where: { id }, select: { courseId: true },
    });
    if (!assignment) throw new NotFoundException('Assignment not found');
    await this.assertCanAuthor(user, assignment.courseId);
    return this.files.store(user, file, { purpose: 'ASSIGNMENT_ATTACHMENT', assignmentId: id });
  }

  /* ── Student flow ──────────────────────────────────────── */

  /** The live assignment, or 404 — students never learn drafts exist. */
  private async liveForStudent(user: AuthUser, assignmentId: string) {
    const assignment = await this.prisma.assignment.findFirst({
      where: { id: assignmentId, ...this.liveOnly },
      include: { course: { select: { id: true, code: true } } },
    });
    if (!assignment) throw new NotFoundException('Assignment not found');
    await this.assertEnrolled(user, assignment.courseId);
    return assignment;
  }

  private assertEditable(status: string) {
    if (status === 'SUBMITTED' || status === 'GRADED') {
      throw new BadRequestException('This submission has already been handed in');
    }
  }

  async saveDraft(user: AuthUser, assignmentId: string, dto: DraftDto) {
    const assignment = await this.liveForStudent(user, assignmentId);
    if (assignment.availableFrom && assignment.availableFrom > new Date()) {
      throw new BadRequestException('Submissions have not opened yet');
    }
    const existing = await this.prisma.submission.findUnique({
      where: { assignmentId_studentId: { assignmentId, studentId: user.id } },
      select: { status: true },
    });
    if (existing) this.assertEditable(existing.status);

    return this.prisma.submission.upsert({
      where: { assignmentId_studentId: { assignmentId, studentId: user.id } },
      create: { assignmentId, studentId: user.id, text: dto.text ?? null },
      update: { text: dto.text ?? null },
      include: { files: FILE_SELECT },
    });
  }

  async attachSubmissionFile(user: AuthUser, assignmentId: string, file: Express.Multer.File) {
    const assignment = await this.liveForStudent(user, assignmentId);
    if (assignment.availableFrom && assignment.availableFrom > new Date()) {
      throw new BadRequestException('Submissions have not opened yet');
    }
    const submission = await this.prisma.submission.upsert({
      where: { assignmentId_studentId: { assignmentId, studentId: user.id } },
      create: { assignmentId, studentId: user.id },
      update: {},
      select: { id: true, status: true },
    });
    this.assertEditable(submission.status);
    return this.files.store(user, file, { purpose: 'SUBMISSION_FILE', submissionId: submission.id });
  }

  async submit(user: AuthUser, assignmentId: string) {
    const assignment = await this.liveForStudent(user, assignmentId);
    const submission = await this.prisma.submission.findUnique({
      where: { assignmentId_studentId: { assignmentId, studentId: user.id } },
      include: { _count: { select: { files: true } } },
    });
    if (!submission || (!submission.text?.trim() && submission._count.files === 0)) {
      throw new BadRequestException('Add some work before submitting');
    }
    if (submission.status === 'SUBMITTED' || submission.status === 'GRADED') {
      if (!assignment.resubmissions && submission.status === 'SUBMITTED') {
        throw new BadRequestException('You have already submitted this assignment');
      }
      if (submission.status === 'GRADED') {
        throw new BadRequestException('This submission has already been graded');
      }
    }

    // Server clock decides lateness. The deadline is enforced here, not
    // in the disabled state of a button.
    const now = new Date();
    const isLate = now > assignment.dueAt;
    if (isLate && !assignment.allowLate) {
      throw new BadRequestException('The deadline has passed and late submissions are off');
    }

    const resubmitting = submission.status === 'RETURNED' || submission.status === 'SUBMITTED';
    const updated = await this.prisma.submission.update({
      where: { id: submission.id },
      data: {
        status: 'SUBMITTED',
        submittedAt: now,
        isLate,
        ...(resubmitting ? { attempt: { increment: 1 } } : {}),
      },
      include: { files: FILE_SELECT },
    });
    return updated;
  }

  /* ── Grading ───────────────────────────────────────────── */

  async listSubmissions(user: AuthUser, assignmentId: string) {
    const assignment = await this.prisma.assignment.findUnique({
      where: { id: assignmentId },
      select: { courseId: true, title: true, maxMarks: true },
    });
    if (!assignment) throw new NotFoundException('Assignment not found');
    await this.assertCanAuthor(user, assignment.courseId);

    // Every enrolled student, with their submission (or none) — the
    // roster view, not just the pile that handed in.
    const enrollments = await this.prisma.enrollment.findMany({
      where: { courseId: assignment.courseId },
      include: { student: { select: { id: true, name: true, email: true } } },
      orderBy: { student: { name: 'asc' } },
    });
    const submissions = await this.prisma.submission.findMany({
      where: { assignmentId },
      include: { files: FILE_SELECT },
    });
    const byStudent = new Map(submissions.map((s) => [s.studentId, s]));
    return enrollments.map((e) => ({
      student: e.student,
      submission: byStudent.get(e.studentId) ?? null,
    }));
  }

  async grade(user: AuthUser, submissionId: string, dto: GradeDto) {
    const submission = await this.prisma.submission.findUnique({
      where: { id: submissionId },
      include: {
        assignment: { select: { id: true, title: true, maxMarks: true, courseId: true, course: { select: { code: true, teacherId: true } } } },
        student: { select: { id: true, name: true } },
      },
    });
    if (!submission) throw new NotFoundException('Submission not found');
    if (user.role !== 'ADMIN' && submission.assignment.course.teacherId !== user.id) {
      throw new ForbiddenException('You do not teach this course');
    }
    if (submission.status === 'DRAFT') {
      throw new BadRequestException('This student has not submitted yet');
    }
    if (dto.marksAwarded > submission.assignment.maxMarks) {
      throw new BadRequestException(`Marks cannot exceed ${submission.assignment.maxMarks}`);
    }

    const updated = await this.prisma.submission.update({
      where: { id: submissionId },
      data: {
        marksAwarded: dto.marksAwarded,
        feedback: dto.feedback ?? null,
        status: 'GRADED',
        gradedById: user.id,
        gradedAt: new Date(),
      },
    });
    await this.audit.record(user, {
      action: 'submission.grade', targetType: 'submission', targetId: submissionId,
      summary: `Graded ${submission.student.name}: ${dto.marksAwarded}/${submission.assignment.maxMarks} on “${submission.assignment.title}”`,
      metadata: { previousMarks: submission.marksAwarded, marks: dto.marksAwarded },
    });
    return updated;
  }

  /** Releases the grade to the student (GRADED is teacher-only state). */
  async returnToStudent(user: AuthUser, submissionId: string) {
    const submission = await this.prisma.submission.findUnique({
      where: { id: submissionId },
      include: {
        assignment: { select: { id: true, title: true, maxMarks: true, course: { select: { code: true, teacherId: true } } } },
      },
    });
    if (!submission) throw new NotFoundException('Submission not found');
    if (user.role !== 'ADMIN' && submission.assignment.course.teacherId !== user.id) {
      throw new ForbiddenException('You do not teach this course');
    }
    if (submission.status !== 'GRADED') {
      throw new BadRequestException('Grade the submission before returning it');
    }

    const updated = await this.prisma.submission.update({
      where: { id: submissionId },
      data: { status: 'RETURNED', returnedAt: new Date() },
    });
    await this.notifications.notify([submission.studentId], {
      type: 'submission.returned',
      title: `${submission.assignment.course.code}: “${submission.assignment.title}” graded`,
      body: `You scored ${submission.marksAwarded}/${submission.assignment.maxMarks}.`,
      link: `/student/assignments/${submission.assignment.id}`,
    });
    await this.audit.record(user, {
      action: 'submission.return', targetType: 'submission', targetId: submissionId,
      summary: `Returned “${submission.assignment.title}” to the student`,
    });
    return updated;
  }
}
