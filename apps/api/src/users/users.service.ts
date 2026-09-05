import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ApprovalStatus, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../common/decorators/current-user.decorator';

/** Never selects passwordHash. */
const SAFE = {
  id: true, email: true, name: true, role: true, approvalStatus: true,
  department: true, year: true, avatarUrl: true, createdAt: true,
} as const;

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  findAll(role?: Role, status?: ApprovalStatus, take = 100, skip = 0) {
    return this.prisma.user.findMany({
      where: { ...(role && { role }), ...(status && { approvalStatus: status }) },
      select: SAFE,
      orderBy: { createdAt: 'desc' },
      take: Math.min(take, 200),
      skip,
    });
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id }, select: SAFE });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  setApproval(id: string, approvalStatus: ApprovalStatus) {
    return this.prisma.user.update({ where: { id }, data: { approvalStatus }, select: SAFE });
  }

  async updateProfile(user: AuthUser, id: string, data: { name?: string; department?: string; avatarUrl?: string }) {
    // A user edits only their own profile; role and approval are not
    // in the accepted shape at all, so neither can be self-escalated.
    if (user.id !== id && user.role !== 'ADMIN') {
      throw new ForbiddenException('You can only edit your own profile');
    }
    return this.prisma.user.update({ where: { id }, data, select: SAFE });
  }

  remove(id: string) { return this.prisma.user.delete({ where: { id }, select: { id: true } }); }

  async stats() {
    const [students, teachers, pending, courses, liveSessions] = await Promise.all([
      this.prisma.user.count({ where: { role: 'STUDENT' } }),
      this.prisma.user.count({ where: { role: 'TEACHER', approvalStatus: 'APPROVED' } }),
      this.prisma.user.count({ where: { role: 'TEACHER', approvalStatus: 'PENDING' } }),
      this.prisma.course.count(),
      this.prisma.classSession.count({ where: { status: 'LIVE' } }),
    ]);
    return { students, teachers, pending, courses, liveSessions };
  }
}
