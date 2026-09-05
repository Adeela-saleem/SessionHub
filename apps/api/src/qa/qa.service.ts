import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../common/decorators/current-user.decorator';
import { SessionsService } from '../sessions/sessions.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';

@Injectable()
export class QaService {
  constructor(
    private prisma: PrismaService,
    private sessions: SessionsService,
    private realtime: RealtimeGateway,
  ) {}

  async ask(user: AuthUser, sessionId: string, body: string) {
    const message = await this.prisma.question2.create({
      data: { sessionId, studentId: user.id, body },
      include: { student: { select: { id: true, name: true } } },
    });
    this.realtime.emitToSession(sessionId, 'qa:new', message);
    return message;
  }

  list(sessionId: string) {
    return this.prisma.question2.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'asc' },
      include: { student: { select: { id: true, name: true } } },
    });
  }

  async answer(user: AuthUser, id: string, answerText: string) {
    const existing = await this.prisma.question2.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Question not found');
    await this.sessions.assertOwner(user, existing.sessionId);

    const updated = await this.prisma.question2.update({
      where: { id },
      data: { answerText, answeredAt: new Date() },
      include: { student: { select: { id: true, name: true } } },
    });
    this.realtime.emitToSession(existing.sessionId, 'qa:answered', updated);
    return updated;
  }
}
