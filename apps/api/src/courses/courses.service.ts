import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../common/decorators/current-user.decorator';

@Injectable()
export class CoursesService {
  constructor(private prisma: PrismaService) {}

  /** Scoped by role — a student only ever sees courses they are in. */
  findForUser(user: AuthUser) {
    const where =
      user.role === 'STUDENT' ? { enrollments: { some: { studentId: user.id } } }
      : user.role === 'TEACHER' ? { teacherId: user.id }
      : {};
    return this.prisma.course.findMany({
      where,
      orderBy: { code: 'asc' },
      include: {
        teacher: { select: { id: true, name: true } },
        _count: { select: { enrollments: true, sessions: true } },
      },
    });
  }

  create(data: { code: string; name: string; department?: string; teacherId?: string }) {
    return this.prisma.course.create({ data });
  }

  async update(id: string, data: { name?: string; department?: string; teacherId?: string }) {
    return this.prisma.course.update({ where: { id }, data });
  }

  remove(id: string) { return this.prisma.course.delete({ where: { id }, select: { id: true } }); }

  async enroll(courseId: string, studentEmail: string) {
    const student = await this.prisma.user.findUnique({ where: { email: studentEmail } });
    if (!student) throw new NotFoundException('No account with that email');
    if (student.role !== 'STUDENT') throw new ForbiddenException('That account is not a student');
    return this.prisma.enrollment.create({
      data: { courseId, studentId: student.id },
      include: { student: { select: { id: true, name: true, email: true } } },
    });
  }

  unenroll(courseId: string, studentId: string) {
    return this.prisma.enrollment.delete({
      where: { courseId_studentId: { courseId, studentId } },
      select: { id: true },
    });
  }

  roster(courseId: string) {
    return this.prisma.enrollment.findMany({
      where: { courseId },
      include: { student: { select: { id: true, name: true, email: true, year: true } } },
      orderBy: { createdAt: 'asc' },
    });
  }
}
