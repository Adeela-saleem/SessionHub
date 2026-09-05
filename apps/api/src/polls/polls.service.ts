import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../common/decorators/current-user.decorator';
import { SessionsService } from '../sessions/sessions.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';

@Injectable()
export class PollsService {
  constructor(
    private prisma: PrismaService,
    private sessions: SessionsService,
    private realtime: RealtimeGateway,
  ) {}

  async create(user: AuthUser, sessionId: string, prompt: string, options: string[]) {
    await this.sessions.assertOwner(user, sessionId);
    const poll = await this.prisma.poll.create({ data: { sessionId, prompt, options } });
    this.realtime.emitToSession(sessionId, 'poll:opened', poll);
    return poll;
  }

  /**
   * One row per vote. The old model incremented a counter in the poll
   * document from the browser, which meant students could write tallies.
   */
  async vote(user: AuthUser, pollId: string, optionIndex: number) {
    const poll = await this.prisma.poll.findUnique({ where: { id: pollId } });
    if (!poll) throw new NotFoundException('Poll not found');
    if (!poll.isOpen) throw new BadRequestException('That poll is closed');
    if (optionIndex >= poll.options.length) throw new BadRequestException('No such option');

    // Unique (pollId, studentId) makes a re-vote a 409, not a double count.
    await this.prisma.pollVote.create({
      data: { pollId, studentId: user.id, optionIndex },
    });

    const results = await this.results(pollId);
    this.realtime.emitToSession(poll.sessionId, 'poll:updated', results);
    return { recorded: true };
  }

  async results(pollId: string) {
    const poll = await this.prisma.poll.findUnique({
      where: { id: pollId },
      include: { votes: { select: { optionIndex: true } } },
    });
    if (!poll) throw new NotFoundException('Poll not found');
    return {
      pollId: poll.id,
      prompt: poll.prompt,
      isOpen: poll.isOpen,
      totalVotes: poll.votes.length,
      distribution: poll.options.map((label, index) => ({
        index, label,
        count: poll.votes.filter((v) => v.optionIndex === index).length,
      })),
    };
  }

  async close(user: AuthUser, pollId: string) {
    const poll = await this.prisma.poll.findUnique({ where: { id: pollId } });
    if (!poll) throw new NotFoundException('Poll not found');
    await this.sessions.assertOwner(user, poll.sessionId);
    await this.prisma.poll.update({ where: { id: pollId }, data: { isOpen: false } });
    const results = await this.results(pollId);
    this.realtime.emitToSession(poll.sessionId, 'poll:closed', results);
    return results;
  }

  listForSession(sessionId: string) {
    return this.prisma.poll.findMany({
      where: { sessionId }, orderBy: { createdAt: 'desc' },
      include: { _count: { select: { votes: true } } },
    });
  }
}
