import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/decorators/current-user.decorator';

/**
 * Saved exam papers. A teacher only ever sees their own; an admin can
 * read any, which is what makes the audit trail meaningful.
 */
@Injectable()
export class PaperService {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  list(user: AuthUser) {
    return this.prisma.paperFormat.findMany({
      where: user.role === 'ADMIN' ? {} : { teacherId: user.id },
      orderBy: { createdAt: 'desc' },
      select: { id: true, title: true, createdAt: true },
      take: 50,
    });
  }

  async get(user: AuthUser, id: string) {
    const paper = await this.prisma.paperFormat.findUnique({ where: { id } });
    if (!paper) throw new NotFoundException('Paper not found');
    if (user.role !== 'ADMIN' && paper.teacherId !== user.id) {
      throw new ForbiddenException('That paper belongs to another teacher');
    }
    return paper;
  }

  async save(user: AuthUser, title: string, payload: unknown) {
    const created = await this.prisma.paperFormat.create({
      data: { teacherId: user.id, title, payload: payload as never },
    });
    await this.audit.record(user, {
      action: 'paper.save', targetType: 'paper', targetId: created.id,
      summary: `Saved exam paper "${title}"`,
    });
    return { id: created.id, title: created.title, createdAt: created.createdAt };
  }

  async update(user: AuthUser, id: string, patch: { title?: string; payload?: unknown }) {
    await this.get(user, id);
    const updated = await this.prisma.paperFormat.update({
      where: { id },
      data: {
        ...(patch.title !== undefined && { title: patch.title }),
        ...(patch.payload !== undefined && { payload: patch.payload as never }),
      },
    });
    await this.audit.record(user, {
      action: 'paper.update', targetType: 'paper', targetId: id,
      summary: `Updated exam paper "${updated.title}"`,
    });
    return { id: updated.id, title: updated.title, createdAt: updated.createdAt };
  }

  async remove(user: AuthUser, id: string) {
    await this.get(user, id);
    await this.prisma.paperFormat.delete({ where: { id } });
    await this.audit.record(user, {
      action: 'paper.delete', targetType: 'paper', targetId: id,
      summary: 'Deleted a saved exam paper',
    });
    return { id };
  }
}
