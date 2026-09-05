import {
  createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode,
} from 'react';
import { api } from '../../lib/api';
import type {
  ClassSession, PublicQuestion, QuestionResults, SessionSnapshot,
} from '../../lib/types';
import { useSessionSocket } from './useSessionSocket';

/* ============================================================
   A live session outlives the page you happened to be on when
   you joined it. Holding that state at the role-layout level
   means a student can check their courses mid-lecture and come
   back to the same question, and the shell can show a live
   marker from anywhere.
   ============================================================ */

interface LiveValue {
  session: ClassSession | null;
  question: PublicQuestion | null;
  results: QuestionResults | null;
  attendees: number;
  answered: number;
  join: (roomCode: string) => Promise<void>;
  leave: () => Promise<void>;
  /** Teacher side: adopt a session started or resumed elsewhere. */
  adopt: (session: ClassSession | null) => void;
  setResults: (r: QuestionResults | null) => void;
}

const LiveCtx = createContext<LiveValue | null>(null);

export function LiveSessionProvider({ role, children }: { role: 'STUDENT' | 'TEACHER'; children: ReactNode }) {
  const [session, setSession] = useState<ClassSession | null>(null);
  const [question, setQuestion] = useState<PublicQuestion | null>(null);
  const [results, setResults] = useState<QuestionResults | null>(null);
  const [attendees, setAttendees] = useState(0);
  const [answered, setAnswered] = useState(0);

  useSessionSocket(session?.id ?? null, {
    'question:opened': (q: PublicQuestion) => { setResults(null); setAnswered(0); setQuestion(q); },
    'question:closed': (r: QuestionResults) => { setResults(r); setQuestion(null); },
    'roster:updated': (p: { attendeeCount: number }) => setAttendees(p.attendeeCount),
    'answer:received': (p: { answeredCount: number }) => setAnswered(p.answeredCount),
  });

  // The API retires a LIVE session after 30 minutes of teacher silence.
  // This keeps a real lecture from being closed out mid-class.
  useEffect(() => {
    if (role !== 'TEACHER' || !session) return;
    const ping = () => { void api.post(`/sessions/${session.id}/heartbeat`).catch(() => undefined); };
    ping();
    const id = window.setInterval(ping, 60_000);
    return () => window.clearInterval(id);
  }, [role, session?.id]);

  const join = useCallback(async (roomCode: string) => {
    const res = await api.post<{ session: ClassSession; snapshot: SessionSnapshot }>(
      '/sessions/join', { roomCode: roomCode.toUpperCase() },
    );
    setSession(res.session);
    // Joining late: the server hands back only the question that is
    // open right now, with the time actually left on it.
    setQuestion(res.snapshot.activeQuestion);
    setAttendees(res.snapshot.attendeeCount);
    setAnswered(res.snapshot.answeredCount ?? 0);
    setResults(null);
  }, []);

  const leave = useCallback(async () => {
    if (session) {
      await api.post(`/sessions/${session.id}/${role === 'TEACHER' ? 'close' : 'leave'}`)
        .catch(() => undefined);
    }
    setSession(null); setQuestion(null); setResults(null);
    setAttendees(0); setAnswered(0);
  }, [session, role]);

  const adopt = useCallback((s: ClassSession | null) => {
    setSession(s);
    setQuestion(null); setResults(null);
    setAttendees(s?._count?.attendance ?? 0); setAnswered(0);
  }, []);

  const value = useMemo(
    () => ({ session, question, results, attendees, answered, join, leave, adopt, setResults }),
    [session, question, results, attendees, answered, join, leave, adopt],
  );

  return <LiveCtx.Provider value={value}>{children}</LiveCtx.Provider>;
}

export function useLiveSession() {
  const ctx = useContext(LiveCtx);
  if (!ctx) throw new Error('useLiveSession must be used inside <LiveSessionProvider>');
  return ctx;
}
