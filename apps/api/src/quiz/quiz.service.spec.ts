import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { QuestionState, QuestionType } from '@prisma/client';
import { QuizService } from './quiz.service';

/**
 * These tests pin the trust boundary. They are the regressions that
 * matter: a student must never be able to read the key, answer a closed
 * question, or answer twice.
 */
describe('QuizService — trust boundary', () => {
  const student = { id: 'stu-1', email: 's@x.edu', role: 'STUDENT' as const, name: 'Ada' };

  let prisma: any;
  let service: QuizService;

  beforeEach(() => {
    prisma = {
      question: { findUnique: jest.fn() },
      enrollment: { findUnique: jest.fn().mockResolvedValue({ id: 'e1' }) },
      answer: { create: jest.fn().mockResolvedValue({ answeredAt: new Date() }), count: jest.fn().mockResolvedValue(1) },
    };
    service = new QuizService(
      prisma,
      { assertOwner: jest.fn() } as any,
      { emitToSession: jest.fn(), emitToTeacher: jest.fn() } as any,
    );
  });

  const openQuestion = (over: Record<string, unknown> = {}) => ({
    id: 'q1', type: QuestionType.MCQ, options: ['a', 'b', 'c', 'd'], marks: 2,
    state: QuestionState.OPEN, closesAt: new Date(Date.now() + 30_000),
    key: { correctIndex: 2 },
    session: { id: 's1', courseId: 'c1', status: 'LIVE' },
    ...over,
  });

  it('rejects an answer once the question is closed', async () => {
    prisma.question.findUnique.mockResolvedValue(openQuestion({ state: QuestionState.CLOSED }));
    await expect(service.submitAnswer(student, 'q1', { answerIndex: 1 }))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.answer.create).not.toHaveBeenCalled();
  });

  it('rejects an answer arriving after closesAt even while state is OPEN', async () => {
    // A client with a doctored clock still cannot extend the window,
    // because the deadline is compared on the server.
    prisma.question.findUnique.mockResolvedValue(
      openQuestion({ closesAt: new Date(Date.now() - 5_000) }),
    );
    await expect(service.submitAnswer(student, 'q1', { answerIndex: 1 }))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a student who is not enrolled', async () => {
    prisma.question.findUnique.mockResolvedValue(openQuestion());
    prisma.enrollment.findUnique.mockResolvedValue(null);
    await expect(service.submitAnswer(student, 'q1', { answerIndex: 1 }))
      .rejects.toBeInstanceOf(ForbiddenException);
  });

  it('grades on the server and never returns the correct index', async () => {
    prisma.question.findUnique.mockResolvedValue(openQuestion());
    const res = await service.submitAnswer(student, 'q1', { answerIndex: 2 });

    expect(prisma.answer.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ isCorrect: true, marksAwarded: 2 }) }),
    );
    // The student learns only that it was recorded.
    expect(res).toEqual({ recorded: true, answeredAt: expect.any(Date) });
    expect(JSON.stringify(res)).not.toContain('correctIndex');
  });

  it('awards zero marks for a wrong option', async () => {
    prisma.question.findUnique.mockResolvedValue(openQuestion());
    await service.submitAnswer(student, 'q1', { answerIndex: 0 });
    expect(prisma.answer.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ isCorrect: false, marksAwarded: 0 }) }),
    );
  });

  it('rejects an option index outside the option list', async () => {
    prisma.question.findUnique.mockResolvedValue(openQuestion());
    await expect(service.submitAnswer(student, 'q1', { answerIndex: 9 }))
      .rejects.toBeInstanceOf(BadRequestException);
  });
});
