import {
  BadRequestException, ForbiddenException, Injectable,
  NotFoundException, Logger,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Prisma, SessionStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../common/decorators/current-user.decorator';
import { NotificationsService } from '../notifications/notifications.service';
import { generateRoomCode } from './room-code';

/** A session whose teacher has not pinged for this long is auto-closed. */
const TEACHER_SILENCE_TIMEOUT_MS = 30 * 60_000;

@Injectable()
export class SessionsService {
  private readonly logger = new Logger(SessionsService.name);

  constructor(private prisma: PrismaService, private notifications: NotificationsService) {}

  // ── Creation ────────────────────────────────────────────────
  async create(user: AuthUser, courseId: string, title?: string) {
    const course = await this.prisma.course.findUnique({ where: { id: courseId } });
    if (!course) throw new NotFoundException('Course not found');
    if (user.role === 'TEACHER' && course.teacherId !== user.id) {
      throw new ForbiddenException('You do not teach this course');
    }

    // Retry on the unique-constraint violation rather than trusting
    // probability. Five attempts is far beyond what 32^6 needs.
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        return await this.prisma.classSession.create({
          data: {
            roomCode: generateRoomCode(),
            title: title ?? course.name,
            courseId,
            teacherId: user.id,
            status: SessionStatus.LIVE,
            startedAt: new Date(),
            lastTeacherPingAt: new Date(),
          },
          include: { course: { select: { code: true, name: true } } },
        })
        .then(async (session) => {
          // Durable + push notice to the roster: class is live, here's the code.
          await this.notifications.notifyCourse(courseId, {
            type: 'session.live',
            title: `${session.course.code} is live now`,
            body: `Join with code ${session.roomCode}`,
            link: '/student/live',
          }, user.id);
          return session;
        });
      } catch (e) {
        const isCodeCollision =
          e instanceof Prisma.PrismaClientKnownRequestError &&
          e.code === 'P2002' &&
          (e.meta?.target as string[])?.includes('roomCode');
        if (!isCodeCollision) throw e;
        this.logger.warn(`Room code collision, retrying (${attempt + 1}/5)`);
      }
    }
    throw new BadRequestException('Could not allocate a room code, please try again');
  }

  // ── Joining ─────────────────────────────────────────────────
  async joinByCode(user: AuthUser, roomCode: string) {
    const session = await this.prisma.classSession.findUnique({
      where: { roomCode },
      include: { course: { select: { id: true, code: true, name: true } } },
    });

    // Specific, actionable errors — "Invalid code" tells the student nothing.
    if (!session) throw new NotFoundException('No session found with that code');
    if (session.status === SessionStatus.CLOSED) {
      throw new BadRequestException('That session has already ended');
    }
    if (session.status === SessionStatus.SCHEDULED) {
      throw new BadRequestException("That session hasn't started yet");
    }

    const enrolled = await this.prisma.enrollment.findUnique({
      where: { courseId_studentId: { courseId: session.courseId, studentId: user.id } },
    });
    if (!enrolled && user.role === 'STUDENT') {
      throw new ForbiddenException(`You are not enrolled in ${session.course.code}`);
    }

    // Resume the existing attendance row instead of inserting a second
    // one. A refresh mid-lecture used to produce duplicate records.
    await this.prisma.attendance.upsert({
      where: { sessionId_studentId: { sessionId: session.id, studentId: user.id } },
      create: { sessionId: session.id, studentId: user.id },
      update: { leftAt: null },
    });

    return { session, snapshot: await this.snapshot(session.id) };
  }

  /**
   * State for a client that arrives mid-session: the open question with
   * the time actually remaining, never a replay of questions it missed.
   */
  async snapshot(sessionId: string) {
    const open = await this.prisma.question.findFirst({
      where: { sessionId, state: 'OPEN' },
      // `key` is deliberately not selected.
      select: {
        id: true, order: true, prompt: true, type: true,
        options: true, marks: true, closesAt: true,
      },
    });

    const [attendeeCount, answeredCount] = await Promise.all([
      this.prisma.attendance.count({ where: { sessionId, leftAt: null } }),
      open ? this.prisma.answer.count({ where: { questionId: open.id } }) : Promise.resolve(0),
    ]);

    return {
      activeQuestion: open
        ? {
            ...open,
            remainingSeconds: open.closesAt
              ? Math.max(0, Math.ceil((open.closesAt.getTime() - Date.now()) / 1000))
              : null,
          }
        : null,
      attendeeCount,
      answeredCount,
    };
  }

  async leave(user: AuthUser, sessionId: string) {
    await this.prisma.attendance.updateMany({
      where: { sessionId, studentId: user.id, leftAt: null },
      data: { leftAt: new Date() },
    });
    return { ok: true };
  }

  // ── Lifecycle ───────────────────────────────────────────────
  async heartbeat(user: AuthUser, sessionId: string) {
    await this.assertOwner(user, sessionId);
    await this.prisma.classSession.update({
      where: { id: sessionId },
      data: { lastTeacherPingAt: new Date() },
    });
    return { ok: true };
  }

  async close(user: AuthUser, sessionId: string) {
    await this.assertOwner(user, sessionId);
    return this.prisma.classSession.update({
      where: { id: sessionId },
      data: { status: SessionStatus.CLOSED, endedAt: new Date() },
    });
  }

  /**
   * The old app left sessions open forever when a teacher shut the tab;
   * students could keep joining a lecture that had ended hours earlier.
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async autoCloseAbandoned() {
    const cutoff = new Date(Date.now() - TEACHER_SILENCE_TIMEOUT_MS);
    const { count } = await this.prisma.classSession.updateMany({
      where: { status: SessionStatus.LIVE, lastTeacherPingAt: { lt: cutoff } },
      data: { status: SessionStatus.CLOSED, endedAt: new Date() },
    });
    if (count) this.logger.log(`Auto-closed ${count} abandoned session(s)`);
  }

  // ── Reads ───────────────────────────────────────────────────
  findMine(user: AuthUser) {
    const where =
      user.role === 'STUDENT'
        ? { course: { enrollments: { some: { studentId: user.id } } } }
        : user.role === 'TEACHER'
        ? { teacherId: user.id }
        : {};
    return this.prisma.classSession.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: {
        course: { select: { code: true, name: true } },
        _count: { select: { attendance: true, questions: true } },
      },
    });
  }

  async roster(user: AuthUser, sessionId: string) {
    await this.assertOwner(user, sessionId, true);
    return this.prisma.attendance.findMany({
      where: { sessionId },
      orderBy: { joinedAt: 'asc' },
      include: { student: { select: { id: true, name: true, email: true } } },
    });
  }

  async assertOwner(user: AuthUser, sessionId: string, allowAdmin = true) {
    const session = await this.prisma.classSession.findUnique({ where: { id: sessionId } });
    if (!session) throw new NotFoundException('Session not found');
    if (user.role === 'ADMIN' && allowAdmin) return session;
    if (session.teacherId !== user.id) {
      throw new ForbiddenException('You do not own this session');
    }
    return session;
  }
}
