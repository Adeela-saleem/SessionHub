import { useEffect, useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, ApiError } from '../../lib/api';
import type { ClassSession } from '../../lib/types';
import { useLiveSession } from '../../features/session/LiveSessionContext';
import { LiveQuestion } from '../../features/session/LiveQuestion';
import { QaPanel } from '../../features/session/QaPanel';
import { StudentPollPanel } from '../../features/session/PollPanel';
import { ConnectionStrip } from '../../features/session/ConnectionStrip';
import { LiveBar } from '../../features/session/LiveBar';
import {
  Badge, Banner, Button, ConfirmDialog, EmptyState, Field, Input, PageHeader, SectionHead,
  useToast,
} from '../../components/ui';
import { IconCheck, IconHelp } from '../../components/icons';

/* ============================================================
   Live session — student
   Two states: the join gate, and the room. In the room the
   question is the only thing competing for attention; the poll
   and Q&A sit beneath it, and the room's facts live in the bar.
   ============================================================ */

const REACTION_COOLDOWN_MS = 8000;

/** One-tap, anonymous signal to the teacher. Ephemeral by design. */
function ReactionRow() {
  const { sendReaction } = useLiveSession();
  const [sent, setSent] = useState<'confused' | 'got-it' | null>(null);

  useEffect(() => {
    if (!sent) return;
    const t = window.setTimeout(() => setSent(null), REACTION_COOLDOWN_MS);
    return () => window.clearTimeout(t);
  }, [sent]);

  return (
    <div className="react-row">
      <span className="t-caption t-muted">Tell your teacher, anonymously:</span>
      <Button size="sm" variant="secondary" disabled={!!sent} onClick={() => { sendReaction('confused'); setSent('confused'); }}>
        <IconHelp size={14} />I&rsquo;m confused
      </Button>
      <Button size="sm" variant="secondary" disabled={!!sent} onClick={() => { sendReaction('got-it'); setSent('got-it'); }}>
        <IconCheck size={14} />Got it
      </Button>
      {sent && <span className="react-sent" role="status">Sent</span>}
    </div>
  );
}

export default function StudentLiveSession() {
  const {
    session, question, results, attendees, connected, join, leave, myAnswerFor, recordAnswer,
  } = useLiveSession();
  const toast = useToast();

  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirmLeave, setConfirmLeave] = useState(false);

  const sessions = useQuery({
    queryKey: ['sessions'],
    queryFn: () => api.get<ClassSession[]>('/sessions'),
    enabled: !session,
    refetchInterval: 30_000,
  });
  const liveNow = sessions.data?.filter((s) => s.status === 'LIVE') ?? [];

  async function onJoin(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(''); setBusy(true);
    try {
      await join(code);
      toast.success('You are in', 'Answers you submit are recorded immediately.');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not join that session. Check the code and try again.');
    } finally {
      setBusy(false);
    }
  }

  /* ── The room ───────────────────────────────────────── */
  if (session) {
    const answerKey = results?.questionId ?? question?.id;
    const myAnswer = answerKey ? myAnswerFor(answerKey) ?? null : null;

    return (
      <div className="live">
        <LiveBar
          session={session}
          facts={[{ label: 'In the room', value: attendees }]}
          actions={<Button variant="danger" size="sm" onClick={() => setConfirmLeave(true)}>Leave</Button>}
        />

        <ConnectionStrip connected={connected} />

        <div className="live-focus">
          <section className={`live-stage ${question && !results ? 'is-open' : results ? 'is-result' : ''}`.trim()}>
            <LiveQuestion
              question={question}
              results={results}
              myAnswer={myAnswer}
              onRecord={recordAnswer}
            />
          </section>

          <ReactionRow />

          <StudentPollPanel sessionId={session.id} />

          <div className="section-tight">
            <QaPanel sessionId={session.id} canAsk />
          </div>
        </div>

        <ConfirmDialog
          open={confirmLeave}
          onClose={() => setConfirmLeave(false)}
          onConfirm={async () => { await leave(); setConfirmLeave(false); toast.info('You left the session'); }}
          title="Leave this session?"
          description="Your recorded answers are kept. You can rejoin with the same room code while the session is still live."
          confirmLabel="Leave session"
          destructive
        />
      </div>
    );
  }

  /* ── The gate ───────────────────────────────────────── */
  return (
    <div className="container-form">
      <PageHeader
        title="Join a session"
        lede="Enter the six-character room code shown on your teacher's screen."
      />

      <form onSubmit={onJoin} className="form">
        {error && <Banner tone="error" title="Could not join">{error}</Banner>}
        <Field
          label="Room code"
          htmlFor="room-code"
          hint="Six characters, letters and numbers. Case does not matter."
        >
          <Input
            id="room-code"
            name="roomCode"
            required
            maxLength={6}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            placeholder="DBMS7K"
            className="code-input"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
          />
        </Field>
        <div className="form-actions" style={{ justifyContent: 'flex-start' }}>
          <Button type="submit" size="lg" loading={busy} disabled={code.length < 4}>
            Join session
          </Button>
        </div>
      </form>

      <section className="section">
        <SectionHead title="Live in your courses" />
        {sessions.isLoading ? (
          <span className="sk sk-line" style={{ height: 44, display: 'block' }} />
        ) : !liveNow.length ? (
          <EmptyState
            row bare
            title="Nothing live at the moment"
            description="When one of your teachers starts a session it is listed here. You still need the room code to join."
          />
        ) : (
          <ul className="feed-list">
            {liveNow.map((s) => (
              <li key={s.id} className="feed-row">
                <span className="feed-row-title"><Badge tone="live">Live</Badge>{s.course?.name ?? s.title}</span>
                <span className="feed-row-meta"><span className="t-data">{s.course?.code}</span> · {s._count?.attendance ?? 0} joined</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
