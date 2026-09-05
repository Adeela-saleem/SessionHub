export type Role = 'STUDENT' | 'TEACHER' | 'ADMIN';

export type ApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface User {
  id: string; email: string; name: string; role: Role;
  department?: string | null; avatarUrl?: string | null;
  approvalStatus?: ApprovalStatus;
  year?: number | null;
  createdAt?: string;
}

export interface AuthResponse {
  accessToken: string; refreshToken: string; user: User;
}

export interface Course {
  id: string; code: string; name: string; department?: string | null;
  teacher?: { id: string; name: string } | null;
  _count?: { enrollments: number; sessions: number };
}

export type SessionStatus = 'SCHEDULED' | 'LIVE' | 'CLOSED';

export interface ClassSession {
  id: string; roomCode: string; title?: string | null;
  status: SessionStatus; courseId: string;
  course?: { code: string; name: string };
  _count?: { attendance: number; questions: number };
}

/** What a student receives. There is no correctIndex on this type. */
export interface PublicQuestion {
  id: string; order: number; prompt: string;
  type: 'MCQ' | 'SHORT'; options: string[]; marks: number;
  state?: 'PENDING' | 'OPEN' | 'CLOSED';
  closesAt?: string | null;
  remainingSeconds?: number | null;
}

/** Only ever delivered once a question has closed. */
export interface QuestionResults {
  questionId: string; prompt: string; options: string[];
  correctIndex: number | null; explanation: string | null;
  totalAnswers: number; correctCount: number;
  distribution: { index: number; label: string; count: number }[];
}

export interface SessionSnapshot {
  activeQuestion: PublicQuestion | null;
  attendeeCount: number;
  answeredCount: number;
}


/** Teacher-side question, including the answer key. */
export interface TeacherQuestion {
  id: string; order: number; prompt: string;
  type: 'MCQ' | 'SHORT';
  state: 'PENDING' | 'OPEN' | 'CLOSED';
  options: string[]; marks: number;
  key?: { correctIndex: number | null; explanation?: string | null };
  _count?: { answers: number };
}

/** A draft returned by the quiz generator, before it is published. */
export interface DraftQuestion {
  prompt: string; type?: 'MCQ' | 'SHORT';
  options: string[]; correctIndex: number | null;
  explanation?: string | null; marks: number;
}

export interface QaMessage {
  id: string; body: string;
  answerText?: string | null; answeredAt?: string | null;
  createdAt: string;
  student?: { id: string; name: string } | null;
}

export interface PlatformStats {
  students: number; teachers: number; pending: number;
  courses: number; liveSessions: number;
}

export interface RosterEntry {
  id: string; joinedAt?: string;
  student: { id: string; name: string; email: string; year?: number | null };
}

/* ── Analytics ─────────────────────────────────────────── */
export interface StudentAnalytics {
  kpis: {
    sessionsAttended: number; questionsAnswered: number;
    accuracy: number; attendanceRate: number; marksEarned: number;
  };
  scoreTrend: { date: string; accuracy: number; answered: number; marks: number }[];
  perCourse: { course: string; name: string; attended: number; total: number; rate: number }[];
  answerBreakdown: { name: string; value: number }[];
}

export interface TeacherAnalytics {
  kpis: {
    sessionsRun: number; liveNow: number; questionsAsked: number;
    totalAnswers: number; avgAccuracy: number;
  };
  participationTrend: { date: string; label: string; joined: number; answers: number; accuracy: number }[];
  questionDifficulty: { label: string; prompt: string; answers: number; correctPct: number }[];
  attendanceByCourse: { course: string; students: number }[];
}

export interface AdminAnalytics {
  signupTrend: { date: string; students: number; teachers: number }[];
  sessionTrend: { date: string; sessions: number; attendance: number }[];
  departments: { department: string; students: number; teachers: number; courses: number }[];
  roleSplit: { name: string; value: number }[];
}
