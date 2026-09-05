import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { pageArgs, toPage, type PageQuery } from '../common/pagination';

export interface Notice {
  type: string;
  title: string;
  body?: string;
  link?: string;
}

/**
 * Per-user notifications, fanned out at write time: a course
 * announcement becomes one row per enrolled student, so the unread
 * badge is a single indexed COUNT and marking read touches only the
 * reader's own rows.
 *
 * Delivery is dual: the row (durable, survives being offline) and a
 * best-effort socket push to `user:{id}` for anyone currently online.
 */
@Injectable()
export class NotificationsService {
  constructor(private prisma: PrismaService, private realtime: RealtimeGateway) {}

  async notify(userIds: string[], notice: Notice) {
    const ids = [...new Set(userIds)];
    if (!ids.length) return;
    await this.prisma.notification.createMany({
      data: ids.map((userId) => ({
        userId,
        type: notice.type,
        title: notice.title,
        body: notice.body ?? null,
        link: notice.link ?? null,
      })),
    });
    for (const id of ids) this.realtime.emitToUser(id, 'notify', notice);
  }

  /** Every enrolled student of a course, minus optional exclusions. */
  async notifyCourse(courseId: string, notice: Notice, excludeUserId?: string) {
    const rows = await this.prisma.enrollment.findMany({
      where: { courseId },
      select: { studentId: true },
    });
    const ids = rows.map((r) => r.studentId).filter((id) => id !== excludeUserId);
    await this.notify(ids, notice);
  }

  async list(userId: string, query: PageQuery) {
    const { size, ...paging } = pageArgs(query);
    const rows = await this.prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      ...paging,
    });
    return toPage(rows, size);
  }

  unreadCount(userId: string) {
    return this.prisma.notification
      .count({ where: { userId, readAt: null } })
      .then((count) => ({ count }));
  }

  /** Scoped to the caller — a user can only ever mark their own rows. */
  async markRead(userId: string, id: string) {
    await this.prisma.notification.updateMany({
      where: { id, userId, readAt: null },
      data: { readAt: new Date() },
    });
    return { ok: true };
  }

  async markAllRead(userId: string) {
    await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
    return { ok: true };
  }
}
