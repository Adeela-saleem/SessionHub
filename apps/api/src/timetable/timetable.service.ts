import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/decorators/current-user.decorator';
import { overlaps, toMinutes, type TimeSpan } from './overlap';
import type { CreateSlotDto, UpdateSlotDto } from './dto/timetable.dto';

export interface SlotConflict {
  kind: 'ROOM' | 'TEACHER' | 'STUDENTS';
  with: { courseCode: string; startTime: string; endTime: string; room: string | null };
  detail: string;
}

/**
 * Weekly timetable. Saving a slot always succeeds if it is well-formed;
 * clashes come back as structured warnings (room double-booked, teacher
 * in two places, students shared with an overlapping course) so the
 * scheduler decides with the facts in front of them — the system
 * doesn't silently allow or silently block.
 */
@Injectable()
export class TimetableService {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  private async assertCanAuthor(user: AuthUser, courseId: string) {
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
      select: { id: true, code: true, teacherId: true },
    });
    if (!course) throw new NotFoundException('Course not found');
    if (user.role !== 'ADMIN' && course.teacherId !== user.id) {
      throw new ForbiddenException('You do not teach this course');
    }
    return course;
  }

  /** The viewer's weekly grid: enrolled (student) or taught (teacher). */
  async myTimetable(user: AuthUser) {
    const where =
      user.role === 'STUDENT'
        ? { course: { enrollments: { some: { studentId: user.id } } } }
        : user.role === 'TEACHER'
          ? { course: { teacherId: user.id } }
          : {};
    const slots = await this.prisma.scheduleSlot.findMany({
      where,
      include: {
        course: { select: { id: true, code: true, name: true, teacher: { select: { name: true } } } },
      },
      orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
    });
    return slots;
  }

  listForCourse(courseId: string) {
    return this.prisma.scheduleSlot.findMany({
      where: { courseId },
      orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
    });
  }

  /** All clashes the proposed span would create, excluding `ignoreSlotId`. */
  private async findConflicts(
    courseId: string,
    span: TimeSpan & { room?: string | null },
    ignoreSlotId?: string,
  ): Promise<SlotConflict[]> {
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
      select: { teacherId: true, enrollments: { select: { studentId: true } } },
    });
    if (!course) return [];
    const myStudents = new Set(course.enrollments.map((e) => e.studentId));

    // One query for the day's slots; classification happens in memory.
    const daySlots = await this.prisma.scheduleSlot.findMany({
      where: { dayOfWeek: span.dayOfWeek, ...(ignoreSlotId ? { id: { not: ignoreSlotId } } : {}) },
      include: {
        course: {
          select: {
            id: true, code: true, teacherId: true,
            enrollments: { select: { studentId: true } },
          },
        },
      },
    });

    const conflicts: SlotConflict[] = [];
    for (const other of daySlots) {
      if (!overlaps(span, other)) continue;
      const at = { courseCode: other.course.code, startTime: other.startTime, endTime: other.endTime, room: other.room };

      if (span.room && other.room && span.room.trim().toLowerCase() === other.room.trim().toLowerCase()) {
        conflicts.push({ kind: 'ROOM', with: at, detail: `Room ${other.room} is booked by ${other.course.code} ${other.startTime}–${other.endTime}` });
      }
      if (course.teacherId && other.course.teacherId === course.teacherId && other.course.id !== courseId) {
        conflicts.push({ kind: 'TEACHER', with: at, detail: `The teacher is already in ${other.course.code} ${other.startTime}–${other.endTime}` });
      }
      if (other.course.id !== courseId) {
        const shared = other.course.enrollments.filter((e) => myStudents.has(e.studentId)).length;
        if (shared > 0) {
          conflicts.push({ kind: 'STUDENTS', with: at, detail: `${shared} enrolled student${shared === 1 ? '' : 's'} also take${shared === 1 ? 's' : ''} ${other.course.code} ${other.startTime}–${other.endTime}` });
        }
      }
    }
    return conflicts;
  }

  private assertSpanSane(startTime: string, endTime: string) {
    if (!(toMinutes(startTime) < toMinutes(endTime))) {
      throw new BadRequestException('The class must end after it starts');
    }
  }

  async createSlot(user: AuthUser, courseId: string, dto: CreateSlotDto) {
    const course = await this.assertCanAuthor(user, courseId);
    this.assertSpanSane(dto.startTime, dto.endTime);
    const conflicts = await this.findConflicts(courseId, dto);
    const slot = await this.prisma.scheduleSlot.create({
      data: { courseId, dayOfWeek: dto.dayOfWeek, startTime: dto.startTime, endTime: dto.endTime, room: dto.room ?? null },
    });
    await this.audit.record(user, {
      action: 'timetable.slot.create', targetType: 'scheduleSlot', targetId: slot.id,
      summary: `Scheduled ${course.code} on day ${dto.dayOfWeek} ${dto.startTime}–${dto.endTime}`,
      ...(conflicts.length ? { metadata: { conflicts: conflicts.map((c) => c.detail) } } : {}),
    });
    return { slot, conflicts };
  }

  async updateSlot(user: AuthUser, id: string, dto: UpdateSlotDto) {
    const existing = await this.prisma.scheduleSlot.findUnique({
      where: { id }, include: { course: { select: { id: true, code: true, teacherId: true } } },
    });
    if (!existing) throw new NotFoundException('Slot not found');
    if (user.role !== 'ADMIN' && existing.course.teacherId !== user.id) {
      throw new ForbiddenException('You do not teach this course');
    }
    const next = {
      dayOfWeek: dto.dayOfWeek ?? existing.dayOfWeek,
      startTime: dto.startTime ?? existing.startTime,
      endTime: dto.endTime ?? existing.endTime,
      room: dto.room !== undefined ? dto.room : existing.room,
    };
    this.assertSpanSane(next.startTime, next.endTime);
    const conflicts = await this.findConflicts(existing.course.id, next, id);
    const slot = await this.prisma.scheduleSlot.update({ where: { id }, data: next });
    return { slot, conflicts };
  }

  async removeSlot(user: AuthUser, id: string) {
    const existing = await this.prisma.scheduleSlot.findUnique({
      where: { id }, include: { course: { select: { code: true, teacherId: true } } },
    });
    if (!existing) throw new NotFoundException('Slot not found');
    if (user.role !== 'ADMIN' && existing.course.teacherId !== user.id) {
      throw new ForbiddenException('You do not teach this course');
    }
    await this.prisma.scheduleSlot.delete({ where: { id } });
    await this.audit.record(user, {
      action: 'timetable.slot.delete', targetType: 'scheduleSlot', targetId: id,
      summary: `Removed a ${existing.course.code} slot from the timetable`,
    });
    return { ok: true };
  }
}
