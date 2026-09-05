import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/decorators/current-user.decorator';
import { QuestionDraftDto } from '../quiz/dto/quiz.dto';

/**
 * Saved quiz drafts. Same ownership rule as papers: a teacher sees only
 * their own, an admin can read any. The stored questions carry answer
 * keys, so nothing here is ever served to a student route.
 */
@Injectable()
export class QuizLibraryService {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  private owned(user: AuthUser) {
    return user.role === 'ADMIN' ? {} : { teacherId: user.id };
  }

  async list(user: AuthUser) {
    const rows = await this.prisma.savedQuiz.findMany({
      where: this.owned(user),
      orderBy: { updatedAt: 'desc' },
      select: { id: true, title: true, topic: true, questions: true, createdAt: true, updatedAt: true },
      take: 100,
    });
    // The list needs a count, not the questions themselves.
    return rows.map(({ questions, ...r }) => ({
      ...r, questionCount: Array.isArray(questions) ? questions.length : 0,
    }));
  }

  async get(user: AuthUser, id: string) {
    const quiz = await this.prisma.savedQuiz.findUnique({ where: { id } });
    if (!quiz) throw new NotFoundException('Quiz not found');
    if (user.role !== 'ADMIN' && quiz.teacherId !== user.id) {
      throw new ForbiddenException('That quiz belongs to another teacher');
    }
    return quiz;
  }

  async save(user: AuthUser, title: string, topic: string | undefined, questions: QuestionDraftDto[]) {
    const created = await this.prisma.savedQuiz.create({
      data: { teacherId: user.id, title, topic: topic ?? null, questions: questions as never },
    });
    await this.audit.record(user, {
      action: 'quiz.save', targetType: 'quiz', targetId: created.id,
      summary: `Saved quiz "${title}" (${questions.length} questions)`,
    });
    return this.summary(created);
  }

  async update(user: AuthUser, id: string, patch: { title?: string; questions?: QuestionDraftDto[] }) {
    await this.get(user, id);
    const updated = await this.prisma.savedQuiz.update({
      where: { id },
      data: {
        ...(patch.title !== undefined && { title: patch.title }),
        ...(patch.questions !== undefined && { questions: patch.questions as never }),
      },
    });
    await this.audit.record(user, {
      action: 'quiz.update', targetType: 'quiz', targetId: id,
      summary: `Updated saved quiz "${updated.title}"`,
    });
    return this.summary(updated);
  }

  async remove(user: AuthUser, id: string) {
    const quiz = await this.get(user, id);
    await this.prisma.savedQuiz.delete({ where: { id } });
    await this.audit.record(user, {
      action: 'quiz.delete', targetType: 'quiz', targetId: id,
      summary: `Deleted saved quiz "${quiz.title}"`,
    });
    return { id };
  }

  private summary(q: { id: string; title: string; topic: string | null; questions: unknown; createdAt: Date; updatedAt: Date }) {
    return {
      id: q.id, title: q.title, topic: q.topic,
      questionCount: Array.isArray(q.questions) ? q.questions.length : 0,
      createdAt: q.createdAt, updatedAt: q.updatedAt,
    };
  }
}
