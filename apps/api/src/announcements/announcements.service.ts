import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ContentStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AuthUser } from '../common/decorators/current-user.decorator';
import type { CreateAnnouncementDto, UpdateAnnouncementDto } from './dto/announcements.dto';

/**
 * Course announcements. Same publish gating as course content:
 * students see PUBLISHED, or SCHEDULED whose time has come — filtered
 * in the query. Publishing fans a notification out to the roster.
 */
@Injectable()
export class AnnouncementsService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private notifications: NotificationsService,
  ) {}

  private get liveOnly(): Prisma.AnnouncementWhereInput {
    return {
      OR: [
        { status: ContentStatus.PUBLISHED },
        { status: ContentStatus.SCHEDULED, publishAt: { lte: new Date() } },
      ],
    };
  }

  private async assertCanAuthor(user: AuthUser, courseId: string) {
    const course = await this.prisma.course.findUnique({
      where: { id: courseId }, select: { id: true, code: true, teacherId: true },
    });
    if (!course) throw new NotFoundException('Course not found');
    if (user.role !== 'ADMIN' && course.teacherId !== user.id) {
      throw new ForbiddenException('You do not teach this course');
    }
    return course;
  }

  async listForCourse(user: AuthUser, courseId: string) {
    if (user.role === 'STUDENT') {
      const enrolled = await this.prisma.enrollment.count({ where: { courseId, studentId: user.id } });
      if (!enrolled) throw new ForbiddenException('You are not enrolled in this course');
      return this.prisma.announcement.findMany({
        where: { courseId, ...this.liveOnly },
        orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
        include: { author: { select: { id: true, name: true } } },
      });
    }
    await this.assertCanAuthor(user, courseId);
    return this.prisma.announcement.findMany({
      where: { courseId },
      orderBy: { createdAt: 'desc' },
      include: { author: { select: { id: true, name: true } } },
    });
  }

  /** Latest live announcements across the student's courses. */
  async myFeed(user: AuthUser, take = 10) {
    return this.prisma.announcement.findMany({
      where: {
        course: { enrollments: { some: { studentId: user.id } } },
        ...this.liveOnly,
      },
      orderBy: { createdAt: 'desc' },
      take: Math.min(take, 50),
      include: {
        author: { select: { id: true, name: true } },
        course: { select: { id: true, code: true, name: true } },
      },
    });
  }

  async create(user: AuthUser, courseId: string, dto: CreateAnnouncementDto) {
    const course = await this.assertCanAuthor(user, courseId);
    const announcement = await this.prisma.announcement.create({
      data: {
        courseId,
        authorId: user.id,
        title: dto.title,
        body: dto.body,
        priority: dto.priority ?? 'NORMAL',
        status: dto.status ?? 'PUBLISHED',
        publishAt: dto.publishAt ? new Date(dto.publishAt) : null,
      },
    });
    if (announcement.status === 'PUBLISHED') {
      await this.notifications.notifyCourse(courseId, {
        type: 'announcement',
        title: `${course.code}: ${announcement.title}`,
        body: announcement.body.slice(0, 140),
        link: `/student/courses/${courseId}`,
      });
    }
    await this.audit.record(user, {
      action: 'announcement.create', targetType: 'announcement', targetId: announcement.id,
      summary: `Posted “${announcement.title}” in ${course.code}`,
    });
    return announcement;
  }

  async update(user: AuthUser, id: string, dto: UpdateAnnouncementDto) {
    const existing = await this.prisma.announcement.findUnique({
      where: { id }, include: { course: { select: { id: true, code: true, teacherId: true } } },
    });
    if (!existing) throw new NotFoundException('Announcement not found');
    if (user.role !== 'ADMIN' && existing.course.teacherId !== user.id) {
      throw new ForbiddenException('You do not teach this course');
    }
    const wasLive = existing.status === 'PUBLISHED';
    const updated = await this.prisma.announcement.update({
      where: { id },
      data: {
        ...(dto.title !== undefined && { title: dto.title }),
        ...(dto.body !== undefined && { body: dto.body }),
        ...(dto.priority !== undefined && { priority: dto.priority }),
        ...(dto.status !== undefined && { status: dto.status }),
        ...(dto.publishAt !== undefined && { publishAt: new Date(dto.publishAt) }),
      },
    });
    if (!wasLive && updated.status === 'PUBLISHED') {
      await this.notifications.notifyCourse(existing.courseId, {
        type: 'announcement',
        title: `${existing.course.code}: ${updated.title}`,
        body: updated.body.slice(0, 140),
        link: `/student/courses/${existing.courseId}`,
      });
    }
    return updated;
  }

  async remove(user: AuthUser, id: string) {
    const existing = await this.prisma.announcement.findUnique({
      where: { id }, include: { course: { select: { code: true, teacherId: true } } },
    });
    if (!existing) throw new NotFoundException('Announcement not found');
    if (user.role !== 'ADMIN' && existing.course.teacherId !== user.id) {
      throw new ForbiddenException('You do not teach this course');
    }
    await this.prisma.announcement.delete({ where: { id } });
    await this.audit.record(user, {
      action: 'announcement.delete', targetType: 'announcement', targetId: id,
      summary: `Deleted “${existing.title}” from ${existing.course.code}`,
    });
    return { ok: true };
  }
}
