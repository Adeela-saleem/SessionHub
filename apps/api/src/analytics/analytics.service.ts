import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../common/decorators/current-user.decorator';

/** A point on a time series. Dates are ISO days so the client can format. */
export interface SeriesPoint { date: string; [k: string]: string | number; }

const DAYS = 14;

@Injectable()
export class AnalyticsService {
  constructor(private prisma: PrismaService) {}

  // ────────────────────────────────────────────────────────────
  // STUDENT — how am I doing?
  // ────────────────────────────────────────────────────────────
  async forStudent(user: AuthUser) {
    const [answers, attendance, enrollments] = await Promise.all([
      this.prisma.answer.findMany({
        where: { studentId: user.id },
        orderBy: { answeredAt: 'asc' },
        include: {
          question: {
            select: {
              marks: true,
              session: { select: { id: true, startedAt: true, course: { select: { code: true, name: true } } } },
            },
          },
        },
      }),
      this.prisma.attendance.findMany({
        where: { studentId: user.id },
        include: { session: { select: { courseId: true, startedAt: true } } },
      }),
      this.prisma.enrollment.findMany({
        where: { studentId: user.id },
        include: { course: { select: { id: true, code: true, name: true, _count: { select: { sessions: true } } } } },
      }),
    ]);

    const graded = answers.filter((a) => a.isCorrect !== null);
    const correct = graded.filter((a) => a.isCorrect).length;

    // Accuracy per session, in chronological order — the trend line.
    const bySession = new Map<string, { date: string; correct: number; total: number; marks: number }>();
    for (const a of answers) {
      const sid = a.question.session.id;
      const date = (a.question.session.startedAt ?? a.answeredAt).toISOString().slice(0, 10);
      const row = bySession.get(sid) ?? { date, correct: 0, total: 0, marks: 0 };
      row.total += 1;
      if (a.isCorrect) row.correct += 1;
      row.marks += a.marksAwarded;
      bySession.set(sid, row);
    }

    const scoreTrend: SeriesPoint[] = [...bySession.values()]
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-10)
      .map((r) => ({
        date: r.date,
        accuracy: r.total ? Math.round((r.correct / r.total) * 100) : 0,
        answered: r.total,
        marks: r.marks,
      }));

    // Per-course attendance: sessions attended vs sessions that ran.
    const attendedByCourse = new Map<string, number>();
    for (const a of attendance) attendedByCourse.set(a.session.courseId, (attendedByCourse.get(a.session.courseId) ?? 0) + 1);

    const perCourse = enrollments.map((e) => {
      const ran = e.course._count.sessions;
      const attended = attendedByCourse.get(e.course.id) ?? 0;
      return {
        course: e.course.code,
        name: e.course.name,
        attended,
        total: ran,
        rate: ran ? Math.round((attended / ran) * 100) : 0,
      };
    });

    const totalRan = perCourse.reduce((s, c) => s + c.total, 0);
    const totalAttended = perCourse.reduce((s, c) => s + c.attended, 0);

    return {
      kpis: {
        sessionsAttended: attendance.length,
        questionsAnswered: answers.length,
        accuracy: graded.length ? Math.round((correct / graded.length) * 100) : 0,
        attendanceRate: totalRan ? Math.round((totalAttended / totalRan) * 100) : 0,
        marksEarned: answers.reduce((s, a) => s + a.marksAwarded, 0),
      },
      scoreTrend,
      perCourse,
      // Correct / incorrect / ungraded — a donut on the client.
      answerBreakdown: [
        { name: 'Correct', value: correct },
        { name: 'Incorrect', value: graded.length - correct },
        { name: 'Awaiting marking', value: answers.length - graded.length },
      ].filter((d) => d.value > 0),
    };
  }

  // ────────────────────────────────────────────────────────────
  // TEACHER — how is the room doing?
  // ────────────────────────────────────────────────────────────
  async forTeacher(user: AuthUser) {
    const sessions = await this.prisma.classSession.findMany({
      where: { teacherId: user.id },
      orderBy: { createdAt: 'asc' },
      include: {
        course: { select: { code: true } },
        _count: { select: { attendance: true } },
        questions: {
          select: {
            id: true, order: true, prompt: true, state: true,
            answers: { select: { isCorrect: true } },
          },
        },
      },
    });

    const participationTrend: SeriesPoint[] = sessions.slice(-10).map((s) => {
      const answers = s.questions.flatMap((q) => q.answers);
      const graded = answers.filter((a) => a.isCorrect !== null);
      return {
        date: (s.startedAt ?? s.createdAt).toISOString().slice(0, 10),
        label: s.course.code,
        joined: s._count.attendance,
        answers: answers.length,
        accuracy: graded.length
          ? Math.round((graded.filter((a) => a.isCorrect).length / graded.length) * 100) : 0,
      };
    });

    // Per-question correctness — shows which topics the room struggled on.
    const questionDifficulty = sessions
      .flatMap((s) => s.questions.map((q) => ({ ...q, code: s.course.code })))
      .filter((q) => q.answers.length > 0)
      .slice(-12)
      .map((q) => {
        const graded = q.answers.filter((a) => a.isCorrect !== null);
        return {
          label: `Q${q.order}`,
          prompt: q.prompt.length > 60 ? q.prompt.slice(0, 57) + '…' : q.prompt,
          answers: q.answers.length,
          correctPct: graded.length
            ? Math.round((graded.filter((a) => a.isCorrect).length / graded.length) * 100) : 0,
        };
      });

    const allAnswers = sessions.flatMap((s) => s.questions.flatMap((q) => q.answers));
    const gradedAll = allAnswers.filter((a) => a.isCorrect !== null);

    const byCourse = new Map<string, number>();
    for (const s of sessions) byCourse.set(s.course.code, (byCourse.get(s.course.code) ?? 0) + s._count.attendance);

    return {
      kpis: {
        sessionsRun: sessions.length,
        liveNow: sessions.filter((s) => s.status === 'LIVE').length,
        questionsAsked: sessions.reduce((n, s) => n + s.questions.length, 0),
        totalAnswers: allAnswers.length,
        avgAccuracy: gradedAll.length
          ? Math.round((gradedAll.filter((a) => a.isCorrect).length / gradedAll.length) * 100) : 0,
      },
      participationTrend,
      questionDifficulty,
      attendanceByCourse: [...byCourse.entries()].map(([course, students]) => ({ course, students })),
    };
  }

  // ────────────────────────────────────────────────────────────
  // ADMIN — how is the institution doing?
  // ────────────────────────────────────────────────────────────
  async forAdmin() {
    const since = new Date(Date.now() - DAYS * 86_400_000);

    const [users, sessions, courses] = await Promise.all([
      this.prisma.user.findMany({ select: { role: true, department: true, createdAt: true } }),
      this.prisma.classSession.findMany({
        where: { createdAt: { gte: since } },
        select: { createdAt: true, status: true, _count: { select: { attendance: true, questions: true } } },
      }),
      this.prisma.course.findMany({
        select: { department: true, _count: { select: { enrollments: true, sessions: true } } },
      }),
    ]);

    // Dense day buckets — a gap in the data should read as zero, not as a
    // missing point that the line chart would interpolate across.
    const days: string[] = [];
    for (let i = DAYS - 1; i >= 0; i--) {
      days.push(new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10));
    }

    const signupTrend: SeriesPoint[] = days.map((date) => ({
      date,
      students: users.filter((u) => u.role === 'STUDENT' && u.createdAt.toISOString().slice(0, 10) === date).length,
      teachers: users.filter((u) => u.role === 'TEACHER' && u.createdAt.toISOString().slice(0, 10) === date).length,
    }));

    const sessionTrend: SeriesPoint[] = days.map((date) => {
      const onDay = sessions.filter((s) => s.createdAt.toISOString().slice(0, 10) === date);
      return {
        date,
        sessions: onDay.length,
        attendance: onDay.reduce((n, s) => n + s._count.attendance, 0),
      };
    });

    const depts = new Map<string, { department: string; students: number; teachers: number; courses: number }>();
    const bump = (d: string | null, k: 'students' | 'teachers' | 'courses') => {
      const key = d?.trim() || 'Unassigned';
      const row = depts.get(key) ?? { department: key, students: 0, teachers: 0, courses: 0 };
      row[k] += 1;
      depts.set(key, row);
    };
    for (const u of users) {
      if (u.role === 'STUDENT') bump(u.department, 'students');
      if (u.role === 'TEACHER') bump(u.department, 'teachers');
    }
    for (const c of courses) bump(c.department, 'courses');

    return {
      signupTrend,
      sessionTrend,
      departments: [...depts.values()].sort((a, b) => b.students - a.students),
      roleSplit: [
        { name: 'Students', value: users.filter((u) => u.role === 'STUDENT').length },
        { name: 'Teachers', value: users.filter((u) => u.role === 'TEACHER').length },
        { name: 'Admins', value: users.filter((u) => u.role === 'ADMIN').length },
      ].filter((d) => d.value > 0),
    };
  }
}
