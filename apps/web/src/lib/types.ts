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
  startedAt?: string | null;
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


/* ── Course content ────────────────────────────────────── */
export type ContentStatus = 'DRAFT' | 'PUBLISHED' | 'SCHEDULED' | 'ARCHIVED';
export type LessonType = 'TEXT' | 'VIDEO' | 'RESOURCE' | 'EMBED' | 'LIVE';
export type ProgressStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED';

export interface Resource {
  id: string; title: string; url: string;
  mimeType?: string | null; sizeBytes?: number | null; order: number;
}

export interface LessonProgress {
  id: string; lessonId: string; status: ProgressStatus;
  percent: number; positionSec: number;
  startedAt?: string | null; completedAt?: string | null;
}

export interface Lesson {
  id: string; moduleId: string; title: string;
  type: LessonType; body?: string | null; url?: string | null;
  durationMin?: number | null; order: number;
  status: ContentStatus; publishAt?: string | null;
  resources: Resource[];
  /** Present for students only. */
  progress?: LessonProgress | null;
  _count?: { progress: number };
}

export interface CourseModule {
  id: string; courseId: string; title: string; summary?: string | null;
  order: number; status: ContentStatus; publishAt?: string | null;
  lessons: Lesson[];
}

/** A lesson fetched on its own carries its module and course context. */
export interface LessonDetail extends Lesson {
  module: { id: string; title: string; courseId: string };
  progress: LessonProgress | null;
}

export interface ContinueItem {
  id: string; positionSec: number; percent: number; updatedAt: string;
  lesson: {
    id: string; title: string; type: LessonType; durationMin?: number | null;
    module: { id: string; title: string; course: { id: string; code: string; name: string } };
  };
}

/* ── Audit ─────────────────────────────────────────────── */
export interface AuditEntry {
  id: string; action: string; targetType: string; targetId?: string | null;
  summary: string; actorEmail: string; createdAt: string;
  actor?: { id: string; name: string; role: Role } | null;
}

export interface Page<T> { items: T[]; nextCursor: string | null; hasMore: boolean }


/* ── Exam paper ────────────────────────────────────────── */
/** TERMINAL is the theory sheet; LAB is the practical sheet. Mirrors the API. */
export type PaperType = 'TERMINAL' | 'LAB';

export interface PaperPart { label: string; marks: number }
/** `clo` holds the CLO number(s) on a terminal paper and the LLO number(s) on a lab paper. */
export interface PaperQuestionConfig { num: number; clo: string; btl: string; parts: PaperPart[] }

export interface PaperFields {
  paperType: PaperType;
  university: string; department: string; instructor: string;
  subjectName: string; courseCode: string; program: string;
  semester: string; section: string; examType: string; examDate: string;
  duration: string; totalMarks: string;
  /** Lab only, e.g. "Performance: 7, Lab Quiz: 5, Viva: 3". */
  marksBreakdown: string;
  /** Lab only — the letter printed in the top-right box. */
  paperVersion: string;
  topics: string; clos: string; instructions: string;
}

export interface PaperDataTable { caption?: string; columns: string[]; rows: string[][] }

export interface GeneratedPaperQuestion {
  questionNumber: number;
  title?: string;
  scenario: string;
  dataTable?: PaperDataTable | null;
  estimatedTimeMinutes: number;
  subparts: { label: string; text: string }[];
}

export interface GeneratedPaper {
  fields: PaperFields;
  questionConfig: PaperQuestionConfig[];
  questions: GeneratedPaperQuestion[];
}

export interface SavedPaper { id: string; title: string; createdAt: string }

/** A quiz draft kept in the teacher's library. The list omits questions. */
export interface SavedQuiz {
  id: string; title: string; topic?: string | null;
  questionCount: number; createdAt: string; updatedAt: string;
}
export interface SavedQuizDetail extends Omit<SavedQuiz, 'questionCount'> {
  questions: DraftQuestion[];
}

/* ── Assignments ───────────────────────────────────────── */
export type SubmissionStatus = 'DRAFT' | 'SUBMITTED' | 'GRADED' | 'RETURNED';

export interface StoredFileMeta {
  id: string; originalName: string; mimeType: string; sizeBytes: number; createdAt: string;
}

export interface SubmissionSummary {
  id: string; status: SubmissionStatus; submittedAt?: string | null;
  isLate: boolean; marksAwarded?: number | null; attempt: number;
}

export interface Submission extends SubmissionSummary {
  text?: string | null; feedback?: string | null;
  gradedAt?: string | null; returnedAt?: string | null;
  files: StoredFileMeta[];
}

export interface Assignment {
  id: string; courseId: string; title: string; instructions: string;
  maxMarks: number; dueAt: string; availableFrom?: string | null;
  status: ContentStatus; publishAt?: string | null;
  allowLate: boolean; latePenaltyPct: number; resubmissions: boolean;
  categoryId?: string | null;
  category?: { id: string; name: string } | null;
  course?: { id: string; code: string; name: string };
  files: StoredFileMeta[];
  /** Student views. */
  mySubmission?: Submission | SubmissionSummary | null;
  /** Teacher list view. */
  _count?: { submissions: number };
}

export interface SubmissionRow {
  student: { id: string; name: string; email: string };
  submission: Submission | null;
}

/* ── Gradebook ─────────────────────────────────────────── */
export type GradeCategoryKind = 'ASSIGNMENTS' | 'LIVE_QUIZZES' | 'ATTENDANCE';

export interface GradeCategory {
  id: string; courseId?: string; name: string; kind: GradeCategoryKind;
  weightPct: number; order: number;
  _count?: { assignments: number };
}

export interface CategoryScoreView {
  categoryId: string | null; name: string; kind: GradeCategoryKind;
  weightPct: number; pct: number | null;
}

export interface GradebookRow {
  student: { id: string; name: string; email: string };
  perCategory: CategoryScoreView[];
  assignments: { assignmentId: string; marks: number | null; isLate: boolean }[];
  total: number | null;
  letter: string | null;
}

export interface GradebookData {
  course: { id: string; code: string; name: string };
  categories: GradeCategory[];
  assignments: { id: string; title: string; maxMarks: number; dueAt: string; categoryId: string | null }[];
  quizPossible: number;
  sessionsHeld: number;
  rows: GradebookRow[];
}

export interface CourseGradeSummary {
  course: { id: string; code: string; name: string };
  total: number | null;
  letter: string | null;
  perCategory: CategoryScoreView[];
}

/* ── Announcements & notifications ─────────────────────── */
export interface Announcement {
  id: string; courseId: string; title: string; body: string;
  priority: 'NORMAL' | 'IMPORTANT'; status: ContentStatus;
  publishAt?: string | null; createdAt: string;
  author?: { id: string; name: string } | null;
  course?: { id: string; code: string; name: string };
}

export interface AppNotification {
  id: string; type: string; title: string; body?: string | null;
  link?: string | null; readAt?: string | null; createdAt: string;
}

/* ── Timetable ─────────────────────────────────────────── */
export interface Slot {
  id: string; courseId: string; dayOfWeek: number;
  startTime: string; endTime: string; room?: string | null;
  course?: { id: string; code: string; name: string; teacher?: { name: string } | null };
}

export interface SlotConflict {
  kind: 'ROOM' | 'TEACHER' | 'STUDENTS';
  detail: string;
}

