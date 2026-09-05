import {
  BadRequestException, ForbiddenException, Injectable,
  NotFoundException,
} from '@nestjs/common';
import { QuestionState, QuestionType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../common/decorators/current-user.decorator';
import { SessionsService } from '../sessions/sessions.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { QuestionDraftDto, SubmitAnswerDto } from './dto/quiz.dto';

/**
 * Fields a student is allowed to see. `key` is a separate relation and
 * is never included here, so a student payload cannot leak the answer
 * even if this select is extended carelessly.
 */
const PUBLIC_QUESTION_SELECT = {
  id: true, order: true, prompt: true, type: true,
  options: true, marks: true, state: true, closesAt: true,
} as const;

/** Answers landing within this window of closesAt are still accepted. */
const NETWORK_GRACE_MS = 750;

@Injectable()
export class QuizService {
  constructor(
    private prisma: PrismaService,
    private sessions: SessionsService,
    private realtime: RealtimeGateway,
  ) {}

  // ── Authoring ───────────────────────────────────────────────
  async createQuestions(user: AuthUser, sessionId: string, drafts: QuestionDraftDto[]) {
    await this.sessions.assertOwner(user, sessionId);

    for (const d of drafts) {
      if (d.type === QuestionType.MCQ) {
        if (d.options.length < 2) {
          throw new BadRequestException('A multiple-choice question needs at least two options');
        }
        if (d.correctIndex === undefined || d.correctIndex >= d.options.length) {
          throw new BadRequestException('correctIndex must point at one of the options');
        }
      }
    }

    const last = await this.prisma.question.findFirst({
      where: { sessionId }, orderBy: { order: 'desc' }, select: { order: true },
    });
    let order = (last?.order ?? 0) + 1;

    // One transaction: a question and its key are created together or
    // not at all, so a question can never exist without an answer key.
    return this.prisma.$transaction(
      drafts.map((d) =>
        this.prisma.question.create({
          data: {
            sessionId,
            order: order++,
            prompt: d.prompt,
            type: d.type,
            options: d.type === QuestionType.MCQ ? d.options : [],
            marks: d.marks,
            durationSeconds: d.durationSeconds,
            key: {
              create: {
                correctIndex: d.type === QuestionType.MCQ ? d.correctIndex! : null,
                explanation: d.explanation,
              },
            },
          },
          select: PUBLIC_QUESTION_SELECT,
        }),
      ),
    );
  }

  listForTeacher(user: AuthUser, sessionId: string) {
    return this.sessions.assertOwner(user, sessionId).then(() =>
      this.prisma.question.findMany({
        where: { sessionId },
        orderBy: { order: 'asc' },
        include: { key: true, _count: { select: { answers: true } } },
      }),
    );
  }

  // ── Lifecycle ───────────────────────────────────────────────
  async open(user: AuthUser, questionId: string) {
    const question = await this.loadOwned(user, questionId);
    if (question.state === QuestionState.CLOSED) {
      throw new BadRequestException('That question has already been closed');
    }

    // Only one question is open at a time — otherwise "the current
    // question" is ambiguous for everyone in the room.
    await this.prisma.question.updateMany({
      where: { sessionId: question.sessionId, state: QuestionState.OPEN },
      data: { state: QuestionState.CLOSED, closedAt: new Date() },
    });

    const openedAt = new Date();
    const closesAt = question.durationSeconds
      ? new Date(openedAt.getTime() + question.durationSeconds * 1000)
      : null;

    const updated = await this.prisma.question.update({
      where: { id: questionId },
      data: { state: QuestionState.OPEN, openedAt, closesAt, closedAt: null },
      select: PUBLIC_QUESTION_SELECT,
    });

    this.realtime.emitToSession(question.sessionId, 'question:opened', {
      ...updated,
      remainingSeconds: question.durationSeconds ?? null,
    });

    // The server closes the question on its own schedule. The countdown
    // in the browser is presentation only; a closed tab does not stall
    // the room, and a tampered clock does not extend the window.
    if (closesAt) {
      setTimeout(
        () => this.close(user, questionId).catch(() => undefined),
        closesAt.getTime() - Date.now(),
      ).unref?.();
    }

    return updated;
  }

  async close(user: AuthUser, questionId: string) {
    const question = await this.loadOwned(user, questionId);
    if (question.state === QuestionState.CLOSED) return this.results(user, questionId);

    await this.prisma.question.update({
      where: { id: questionId },
      data: { state: QuestionState.CLOSED, closedAt: new Date() },
    });

    const results = await this.results(user, questionId);
    // On close — and only on close — the key becomes public.
    this.realtime.emitToSession(question.sessionId, 'question:closed', results);
    return results;
  }

  // ── The trust boundary ──────────────────────────────────────
  async submitAnswer(user: AuthUser, questionId: string, dto: SubmitAnswerDto) {
    const question = await this.prisma.question.findUnique({
      where: { id: questionId },
      include: { key: true, session: { select: { id: true, courseId: true, status: true } } },
    });
    if (!question) throw new NotFoundException('Question not found');

    // 1. The question must be open, per the server's own record.
    if (question.state !== QuestionState.OPEN) {
      throw new BadRequestException('That question is closed');
    }
    if (question.session.status !== 'LIVE') {
      throw new BadRequestException('That session has ended');
    }

    // 2. Server-authoritative deadline.
    if (question.closesAt && Date.now() > question.closesAt.getTime() + NETWORK_GRACE_MS) {
      throw new BadRequestException('Time is up for that question');
    }

    // 3. Enrolment, re-checked here rather than trusted from the join.
    const enrolled = await this.prisma.enrollment.findUnique({
      where: { courseId_studentId: { courseId: question.session.courseId, studentId: user.id } },
    });
    if (!enrolled) throw new ForbiddenException('You are not enrolled in this course');

    // 4. Grade on the server against a key the client has never seen.
    let isCorrect: boolean | null = null;
    let marksAwarded = 0;
    if (question.type === QuestionType.MCQ) {
      if (dto.answerIndex === undefined) throw new BadRequestException('Choose an option');
      if (dto.answerIndex >= question.options.length) {
        throw new BadRequestException('That option does not exist');
      }
      isCorrect = dto.answerIndex === question.key?.correctIndex;
      marksAwarded = isCorrect ? question.marks : 0;
    } else if (!dto.answerText?.trim()) {
      throw new BadRequestException('Write an answer before submitting');
    }

    // 5. The unique (questionId, studentId) index rejects a second
    //    submission at the database. PrismaExceptionFilter maps the
    //    violation to 409 CONFLICT.
    const answer = await this.prisma.answer.create({
      data: {
        questionId,
        studentId: user.id,
        answerIndex: question.type === QuestionType.MCQ ? dto.answerIndex : null,
        answerText: question.type === QuestionType.SHORT ? dto.answerText?.trim() : null,
        isCorrect,
        marksAwarded,
      },
    });

    // The teacher's distribution updates live; the student is told only
    // that the answer was recorded, never whether it was right.
    const answeredCount = await this.prisma.answer.count({ where: { questionId } });
    this.realtime.emitToTeacher(question.session.id, 'answer:received', {
      questionId, answeredCount, studentId: user.id,
    });

    return { recorded: true, answeredAt: answer.answeredAt };
  }

  // ── Results ─────────────────────────────────────────────────
  async results(user: AuthUser, questionId: string) {
    const question = await this.prisma.question.findUnique({
      where: { id: questionId },
      include: { key: true, answers: { select: { answerIndex: true, isCorrect: true } } },
    });
    if (!question) throw new NotFoundException('Question not found');

    const isTeacher = user.role === 'TEACHER' || user.role === 'ADMIN';
    if (!isTeacher && question.state !== QuestionState.CLOSED) {
      throw new ForbiddenException('Results are available once the question closes');
    }

    const distribution = question.options.map((label, index) => ({
      index,
      label,
      count: question.answers.filter((a) => a.answerIndex === index).length,
    }));

    return {
      questionId: question.id,
      prompt: question.prompt,
      options: question.options,
      correctIndex: question.key?.correctIndex ?? null,
      explanation: question.key?.explanation ?? null,
      totalAnswers: question.answers.length,
      correctCount: question.answers.filter((a) => a.isCorrect).length,
      distribution,
    };
  }

  private async loadOwned(user: AuthUser, questionId: string) {
    const question = await this.prisma.question.findUnique({ where: { id: questionId } });
    if (!question) throw new NotFoundException('Question not found');
    await this.sessions.assertOwner(user, question.sessionId);
    return question;
  }
}
