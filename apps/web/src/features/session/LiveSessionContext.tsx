import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode,
} from 'react';
import { api } from '../../lib/api';
import { getSocket } from '../../lib/socket';
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

export type ReactionKind = 'confused' | 'got-it';

interface LiveValue {
  session: ClassSession | null;
  question: PublicQuestion | null;
  results: QuestionResults | null;
  attendees: number;
  answered: number;
  /** Whether the realtime socket is currently up. */
  connected: boolean;
  /** Ephemeral "confused / got it" tallies since the last question opened. */
  reactions: { confused: number; gotIt: number };
  sendReaction: (kind: ReactionKind) => void;
  /**
   * What this student submitted, by question id. Kept here — not in the
   * question component — because the question is nulled on close, and the
   * reveal still needs to say which option was theirs.
   */
  myAnswerFor: (questionId: string) => number | string | undefined;
  recordAnswer: (questionId: string, value: number | string) => void;
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
  const [connected, setConnected] = useState(true);
  const [reactions, setReactions] = useState({ confused: 0, gotIt: 0 });

  // A ref, not state: submissions are written once and only read again on
  // the next render (when results arrive), so re-rendering on write buys
  // nothing. Never cleared on question close — that was the bug that made
  // "Your answer" unreachable.
  const myAnswers = useRef(new Map<string, number | string>());

  useSessionSocket(session?.id ?? null, {
    'question:opened': (q: PublicQuestion) => {
      setResults(null); setAnswered(0); setQuestion(q);
      setReactions({ confused: 0, gotIt: 0 });
    },
    'question:closed': (r: QuestionResults) => { setResults(r); setQuestion(null); },
    'roster:updated': (p: { attendeeCount: number }) => setAttendees(p.attendeeCount),
    'answer:received': (p: { answeredCount: number }) => setAnswered(p.answeredCount),
    'reaction:received': (p: { kind: ReactionKind }) =>
      setReactions((r) => (p.kind === 'confused'
        ? { ...r, confused: r.confused + 1 }
        : { ...r, gotIt: r.gotIt + 1 })),
  });

  // Surface the socket's health while in a session, so the pages can say
  // "reconnecting" instead of silently going stale.
  useEffect(() => {
    if (!session) return;
    const socket = getSocket();
    setConnected(socket.connected);
    const up = () => setConnected(true);
    const down = () => setConnected(false);
    socket.on('connect', up);
    socket.on('disconnect', down);
    return () => { socket.off('connect', up); socket.off('disconnect', down); };
  }, [session?.id]);

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
    myAnswers.current.clear();
    setSession(res.session);
    // Joining late: the server hands back only the question that is
    // open right now, with the time actually left on it.
    setQuestion(res.snapshot.activeQuestion);
    setAttendees(res.snapshot.attendeeCount);
    setAnswered(res.snapshot.answeredCount ?? 0);
    setResults(null);
    setReactions({ confused: 0, gotIt: 0 });
  }, []);

  const leave = useCallback(async () => {
    if (session) {
      await api.post(`/sessions/${session.id}/${role === 'TEACHER' ? 'close' : 'leave'}`)
        .catch(() => undefined);
    }
    myAnswers.current.clear();
    setSession(null); setQuestion(null); setResults(null);
    setAttendees(0); setAnswered(0);
    setReactions({ confused: 0, gotIt: 0 });
  }, [session, role]);

  const adopt = useCallback((s: ClassSession | null) => {
    myAnswers.current.clear();
    setSession(s);
    setQuestion(null); setResults(null);
    setAttendees(s?._count?.attendance ?? 0); setAnswered(0);
    setReactions({ confused: 0, gotIt: 0 });
  }, []);

  const myAnswerFor = useCallback((questionId: string) => myAnswers.current.get(questionId), []);
  const recordAnswer = useCallback((questionId: string, value: number | string) => {
    myAnswers.current.set(questionId, value);
  }, []);

  const sessionId = session?.id ?? null;
  const sendReaction = useCallback((kind: ReactionKind) => {
    if (!sessionId) return;
    getSocket().emit('session:react', { sessionId, kind });
  }, [sessionId]);

  const value = useMemo(
    () => ({
      session, question, results, attendees, answered, connected, reactions,
      sendReaction, myAnswerFor, recordAnswer, join, leave, adopt, setResults,
    }),
    [session, question, results, attendees, answered, connected, reactions,
      sendReaction, myAnswerFor, recordAnswer, join, leave, adopt],
  );

  return <LiveCtx.Provider value={value}>{children}</LiveCtx.Provider>;
}

export function useLiveSession() {
  const ctx = useContext(LiveCtx);
  if (!ctx) throw new Error('useLiveSession must be used inside <LiveSessionProvider>');
  return ctx;
}
