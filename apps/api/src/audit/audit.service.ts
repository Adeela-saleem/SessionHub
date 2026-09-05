import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../common/decorators/current-user.decorator';
import { pageArgs, toPage, type PageQuery } from '../common/pagination';

export interface AuditEntry {
  action: string;
  targetType: string;
  targetId?: string | null;
  summary: string;
  metadata?: Record<string, unknown>;
}

/**
 * Append-only activity record.
 *
 * Nothing in this service updates or deletes a row — that is what makes
 * the log worth having. `record` deliberately never throws: an audit
 * write failing must not roll back the action it was describing, so a
 * failure is logged and swallowed.
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private prisma: PrismaService) {}

  async record(actor: AuthUser | null, entry: AuditEntry) {
    try {
      await this.prisma.auditLog.create({
        data: {
          actorId: actor?.id ?? null,
          actorEmail: actor?.email ?? 'system',
          action: entry.action,
          targetType: entry.targetType,
          targetId: entry.targetId ?? null,
          summary: entry.summary,
          metadata: (entry.metadata ?? undefined) as never,
        },
      });
    } catch (err) {
      this.logger.error(`Failed to write audit entry ${entry.action}`, err as Error);
    }
  }

  async list(query: PageQuery & { action?: string; targetType?: string }) {
    const { size, take, ...cursor } = pageArgs(query);
    const rows = await this.prisma.auditLog.findMany({
      where: {
        ...(query.action && { action: query.action }),
        ...(query.targetType && { targetType: query.targetType }),
      },
      orderBy: { createdAt: 'desc' },
      take,
      ...cursor,
      include: { actor: { select: { id: true, name: true, role: true } } },
    });
    return toPage(rows, size);
  }
}
