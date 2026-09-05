import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ContentStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/decorators/current-user.decorator';
import type {
  CreateLessonDto, CreateModuleDto, CreateResourceDto,
  ProgressDto, UpdateLessonDto, UpdateModuleDto,
} from './dto/content.dto';

/**
 * Course content: Course → Module → Lesson → Resource.
 *
 * Two access rules run through everything here:
 *  • Authoring requires ownership of the course (or ADMIN).
 *  • A student only ever sees content that is live *now* — published,
 *    or scheduled with a publishAt that has passed. That filter is
 *    applied in the query, not in the response mapping, so unpublished
 *    rows never reach the process that serialises the reply.
 */
@Injectable()
export class ContentService {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  /** Content a student is allowed to see, expressed as a where-clause. */
  private get liveOnly(): Prisma.ModuleWhereInput {
    const now = new Date();
    return {
      OR: [
        { status: ContentStatus.PUBLISHED },
        { status: ContentStatus.SCHEDULED, publishAt: { lte: now } },
      ],
    };
  }

  private async assertCanAuthor(user: AuthUser, courseId: string) {
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
      select: { id: true, code: true, teacherId: true },
    });
    if (!course) throw new NotFoundException('Course not found');
    if (user.role === 'ADMIN') return course;
    if (course.teacherId !== user.id) {
      throw new ForbiddenException('You do not teach this course');
    }
    return course;
  }

  private async assertCanRead(user: AuthUser, courseId: string) {
    if (user.role === 'ADMIN') return;
    if (user.role === 'TEACHER') {
      const owned = await this.prisma.course.count({ where: { id: courseId, teacherId: user.id } });
      if (!owned) throw new ForbiddenException('You do not teach this course');
      return;
    }
    const enrolled = await this.prisma.enrollment.count({
      where: { courseId, studentId: user.id },
    });
    if (!enrolled) throw new ForbiddenException('You are not enrolled in this course');
  }

  /* ── Reads ─────────────────────────────────────────────── */

  /** The whole outline. Students get the live subset and their progress. */
  async outline(user: AuthUser, courseId: string) {
    await this.assertCanRead(user, courseId);
    const isStudent = user.role === 'STUDENT';

    const modules = await this.prisma.module.findMany({
      where: { courseId, ...(isStudent ? this.liveOnly : {}) },
      orderBy: { order: 'asc' },
      include: {
        lessons: {
          where: isStudent ? (this.liveOnly as Prisma.LessonWhereInput) : {},
          orderBy: { order: 'asc' },
          include: {
            resources: { orderBy: { order: 'asc' } },
            ...(isStudent
              ? { progress: { where: { studentId: user.id } } }
              : { _count: { select: { progress: true } } }),
          },
        },
      },
    });

    return modules.map((m) => ({
      ...m,
      lessons: m.lessons.map((l) => {
        const { progress, ...lesson } = l as typeof l & { progress?: unknown[] };
        return isStudent
          ? { ...lesson, progress: (progress?.[0] as unknown) ?? null }
          : lesson;
      }),
    }));
  }

  /** A single lesson, with the student's own progress row. */
  async lesson(user: AuthUser, lessonId: string) {
    const lesson = await this.prisma.lesson.findUnique({
      where: { id: lessonId },
      include: {
        resources: { orderBy: { order: 'asc' } },
        module: { select: { id: true, title: true, courseId: true, status: true, publishAt: true } },
      },
    });
    if (!lesson) throw new NotFoundException('Lesson not found');
    await this.assertCanRead(user, lesson.module.courseId);

    if (user.role === 'STUDENT' && !this.isLive(lesson) ) {
      throw new NotFoundException('Lesson not found');
    }

    const progress =
      user.role === 'STUDENT'
        ? await this.prisma.lessonProgress.findUnique({
            where: { lessonId_studentId: { lessonId, studentId: user.id } },
          })
        : null;

    return { ...lesson, progress };
  }

  private isLive(row: { status: ContentStatus; publishAt: Date | null }) {
    if (row.status === ContentStatus.PUBLISHED) return true;
    return row.status === ContentStatus.SCHEDULED && !!row.publishAt && row.publishAt <= new Date();
  }

  /* ── Modules ───────────────────────────────────────────── */

  async createModule(user: AuthUser, courseId: string, dto: CreateModuleDto) {
    const course = await this.assertCanAuthor(user, courseId);
    const last = await this.prisma.module.findFirst({
      where: { courseId },
      orderBy: { order: 'desc' },
      select: { order: true },
    });
    const created = await this.prisma.module.create({
      data: { courseId, title: dto.title, summary: dto.summary, order: (last?.order ?? -1) + 1 },
    });
    await this.audit.record(user, {
      action: 'module.create', targetType: 'module', targetId: created.id,
      summary: `Added module "${created.title}" to ${course.code}`,
    });
    return created;
  }

  async updateModule(user: AuthUser, moduleId: string, dto: UpdateModuleDto) {
    const found = await this.prisma.module.findUnique({
      where: { id: moduleId },
      select: { id: true, courseId: true, title: true, status: true },
    });
    if (!found) throw new NotFoundException('Module not found');
    await this.assertCanAuthor(user, found.courseId);

    const updated = await this.prisma.module.update({
      where: { id: moduleId },
      data: {
        ...(dto.title !== undefined && { title: dto.title }),
        ...(dto.summary !== undefined && { summary: dto.summary }),
        ...(dto.status !== undefined && { status: dto.status }),
        ...(dto.publishAt !== undefined && { publishAt: dto.publishAt ? new Date(dto.publishAt) : null }),
      },
    });
    if (dto.status && dto.status !== found.status) {
      await this.audit.record(user, {
        action: 'module.status', targetType: 'module', targetId: moduleId,
        summary: `Module "${updated.title}" moved ${found.status} → ${dto.status}`,
        metadata: { from: found.status, to: dto.status },
      });
    }
    return updated;
  }

  async deleteModule(user: AuthUser, moduleId: string) {
    const found = await this.prisma.module.findUnique({
      where: { id: moduleId },
      select: { courseId: true, title: true },
    });
    if (!found) throw new NotFoundException('Module not found');
    await this.assertCanAuthor(user, found.courseId);
    await this.prisma.module.delete({ where: { id: moduleId } });
    await this.audit.record(user, {
      action: 'module.delete', targetType: 'module', targetId: moduleId,
      summary: `Deleted module "${found.title}" and its lessons`,
    });
    return { id: moduleId };
  }

  /**
   * Reorder inside one transaction. `order` has no unique constraint
   * precisely so the intermediate states here are legal.
   */
  async reorderModules(user: AuthUser, courseId: string, ids: string[]) {
    await this.assertCanAuthor(user, courseId);
    const owned = await this.prisma.module.findMany({
      where: { courseId }, select: { id: true },
    });
    const ownedIds = new Set(owned.map((m) => m.id));
    if (ids.some((id) => !ownedIds.has(id))) {
      throw new ForbiddenException('That module is not part of this course');
    }
    await this.prisma.$transaction(
      ids.map((id, order) => this.prisma.module.update({ where: { id }, data: { order } })),
    );
    return { ok: true };
  }

  /* ── Lessons ───────────────────────────────────────────── */

  async createLesson(user: AuthUser, moduleId: string, dto: CreateLessonDto) {
    const mod = await this.prisma.module.findUnique({
      where: { id: moduleId }, select: { id: true, courseId: true, title: true },
    });
    if (!mod) throw new NotFoundException('Module not found');
    await this.assertCanAuthor(user, mod.courseId);

    const last = await this.prisma.lesson.findFirst({
      where: { moduleId }, orderBy: { order: 'desc' }, select: { order: true },
    });
    const created = await this.prisma.lesson.create({
      data: {
        moduleId,
        title: dto.title,
        type: dto.type ?? 'TEXT',
        body: dto.body,
        url: dto.url,
        durationMin: dto.durationMin,
        order: (last?.order ?? -1) + 1,
      },
    });
    await this.audit.record(user, {
      action: 'lesson.create', targetType: 'lesson', targetId: created.id,
      summary: `Added lesson "${created.title}" to module "${mod.title}"`,
    });
    return created;
  }

  async updateLesson(user: AuthUser, lessonId: string, dto: UpdateLessonDto) {
    const found = await this.prisma.lesson.findUnique({
      where: { id: lessonId },
      select: { id: true, title: true, status: true, module: { select: { courseId: true } } },
    });
    if (!found) throw new NotFoundException('Lesson not found');
    await this.assertCanAuthor(user, found.module.courseId);

    const updated = await this.prisma.lesson.update({
      where: { id: lessonId },
      data: {
        ...(dto.title !== undefined && { title: dto.title }),
        ...(dto.type !== undefined && { type: dto.type }),
        ...(dto.body !== undefined && { body: dto.body }),
        ...(dto.url !== undefined && { url: dto.url }),
        ...(dto.durationMin !== undefined && { durationMin: dto.durationMin }),
        ...(dto.status !== undefined && { status: dto.status }),
        ...(dto.publishAt !== undefined && { publishAt: dto.publishAt ? new Date(dto.publishAt) : null }),
      },
    });
    if (dto.status && dto.status !== found.status) {
      await this.audit.record(user, {
        action: 'lesson.status', targetType: 'lesson', targetId: lessonId,
        summary: `Lesson "${updated.title}" moved ${found.status} → ${dto.status}`,
        metadata: { from: found.status, to: dto.status },
      });
    }
    return updated;
  }

  async deleteLesson(user: AuthUser, lessonId: string) {
    const found = await this.prisma.lesson.findUnique({
      where: { id: lessonId },
      select: { title: true, module: { select: { courseId: true } } },
    });
    if (!found) throw new NotFoundException('Lesson not found');
    await this.assertCanAuthor(user, found.module.courseId);
    await this.prisma.lesson.delete({ where: { id: lessonId } });
    await this.audit.record(user, {
      action: 'lesson.delete', targetType: 'lesson', targetId: lessonId,
      summary: `Deleted lesson "${found.title}"`,
    });
    return { id: lessonId };
  }

  async reorderLessons(user: AuthUser, moduleId: string, ids: string[]) {
    const mod = await this.prisma.module.findUnique({
      where: { id: moduleId }, select: { courseId: true },
    });
    if (!mod) throw new NotFoundException('Module not found');
    await this.assertCanAuthor(user, mod.courseId);

    const owned = await this.prisma.lesson.findMany({ where: { moduleId }, select: { id: true } });
    const ownedIds = new Set(owned.map((l) => l.id));
    if (ids.some((id) => !ownedIds.has(id))) {
      throw new ForbiddenException('That lesson is not part of this module');
    }
    await this.prisma.$transaction(
      ids.map((id, order) => this.prisma.lesson.update({ where: { id }, data: { order } })),
    );
    return { ok: true };
  }

  /* ── Resources ─────────────────────────────────────────── */

  async addResource(user: AuthUser, lessonId: string, dto: CreateResourceDto) {
    const lesson = await this.prisma.lesson.findUnique({
      where: { id: lessonId },
      select: { id: true, title: true, module: { select: { courseId: true } } },
    });
    if (!lesson) throw new NotFoundException('Lesson not found');
    await this.assertCanAuthor(user, lesson.module.courseId);

    const last = await this.prisma.resource.findFirst({
      where: { lessonId }, orderBy: { order: 'desc' }, select: { order: true },
    });
    return this.prisma.resource.create({
      data: { ...dto, lessonId, order: (last?.order ?? -1) + 1 },
    });
  }

  async deleteResource(user: AuthUser, resourceId: string) {
    const found = await this.prisma.resource.findUnique({
      where: { id: resourceId },
      select: { lesson: { select: { module: { select: { courseId: true } } } } },
    });
    if (!found) throw new NotFoundException('Resource not found');
    await this.assertCanAuthor(user, found.lesson.module.courseId);
    await this.prisma.resource.delete({ where: { id: resourceId } });
    return { id: resourceId };
  }

  /* ── Progress ──────────────────────────────────────────── */

  /**
   * Upsert so a first view and a resume are the same call. `startedAt`
   * is only written once; `completedAt` only when the status becomes
   * COMPLETED, so a re-visit cannot rewrite history.
   */
  async saveProgress(user: AuthUser, lessonId: string, dto: ProgressDto) {
    const lesson = await this.prisma.lesson.findUnique({
      where: { id: lessonId },
      select: { id: true, status: true, publishAt: true, module: { select: { courseId: true } } },
    });
    if (!lesson) throw new NotFoundException('Lesson not found');
    await this.assertCanRead(user, lesson.module.courseId);
    if (user.role !== 'STUDENT') {
      throw new ForbiddenException('Only students record lesson progress');
    }
    if (!this.isLive(lesson)) throw new NotFoundException('Lesson not found');

    const now = new Date();
    const completing = dto.status === 'COMPLETED';
    return this.prisma.lessonProgress.upsert({
      where: { lessonId_studentId: { lessonId, studentId: user.id } },
      create: {
        lessonId,
        studentId: user.id,
        status: dto.status ?? 'IN_PROGRESS',
        percent: dto.percent ?? 0,
        positionSec: dto.positionSec ?? 0,
        startedAt: now,
        completedAt: completing ? now : null,
      },
      update: {
        ...(dto.status !== undefined && { status: dto.status }),
        ...(dto.percent !== undefined && { percent: dto.percent }),
        ...(dto.positionSec !== undefined && { positionSec: dto.positionSec }),
        ...(completing && { completedAt: now, percent: 100 }),
      },
    });
  }

  /** Everything the student has in flight, newest first. */
  async continueLearning(user: AuthUser, take = 5) {
    return this.prisma.lessonProgress.findMany({
      where: { studentId: user.id, status: 'IN_PROGRESS' },
      orderBy: { updatedAt: 'desc' },
      take,
      include: {
        lesson: {
          select: {
            id: true, title: true, type: true, durationMin: true,
            module: { select: { id: true, title: true, course: { select: { id: true, code: true, name: true } } } },
          },
        },
      },
    });
  }
}
