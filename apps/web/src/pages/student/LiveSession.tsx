import { useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, ApiError } from '../../lib/api';
import type { ClassSession } from '../../lib/types';
import { useLiveSession } from '../../features/session/LiveSessionContext';
import { LiveQuestion } from '../../features/session/LiveQuestion';
import { QaPanel } from '../../features/session/QaPanel';
import {
  Badge, Banner, Button, Card, CardBody, CardHead, ConfirmDialog, EmptyState,
  Field, Input, PageHeader, RoomCode, Stat, useToast,
} from '../../components/ui';
import { IconBroadcast, IconUsers } from '../../components/icons';

/* ============================================================
   Live session
   Two states, deliberately: the join gate, and the room. The
   room keeps the question as the only thing competing for
   attention.
   ============================================================ */
export default function StudentLiveSession() {
  const { session, question, results, attendees, join, leave } = useLiveSession();
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
    return (
      <>
        <PageHeader
          eyebrow={session.course?.code ?? 'Live session'}
          title={session.course?.name ?? session.title ?? 'Live session'}
          actions={<Button variant="danger" onClick={() => setConfirmLeave(true)}>Leave session</Button>}
        />

        <div className="live-grid">
          <Card className="live-stage">
            <CardHead
              title="Current question"
              action={<Badge tone="live">Live</Badge>}
            />
            <CardBody>
              <LiveQuestion question={question} results={results} />
            </CardBody>
          </Card>

          <aside className="stack">
            <Card>
              <CardHead title="Room" plain />
              <CardBody>
                <RoomCode code={session.roomCode} size="sm" copyable />
                <div className="live-side-stats">
                  <Stat label="In the room" value={attendees} foot="Students connected" />
                </div>
              </CardBody>
            </Card>

            <QaPanel sessionId={session.id} canAsk />

            <Card>
              <CardHead title="How this works" plain />
              <CardBody>
                <ol className="numbered-list">
                  <li>Your teacher opens a question — it appears here instantly.</li>
                  <li>Choose an answer and submit before the timer runs out.</li>
                  <li>When the question closes you will see the correct answer and how the room voted.</li>
                </ol>
              </CardBody>
            </Card>
          </aside>
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
      </>
    );
  }

  /* ── The gate ───────────────────────────────────────── */
  return (
    <>
      <PageHeader
        eyebrow="Live"
        title="Join a session"
        lede="Enter the six-character room code shown on your teacher's screen."
      />

      <div className="join-grid">
        <Card>
          <CardBody className="join-card">
            <span className="join-mark" aria-hidden="true"><IconBroadcast size={22} /></span>
            <form onSubmit={onJoin}>
              {error && <Banner tone="error" title="Could not join">{error}</Banner>}
              <Field
                label="Room code"
                htmlFor="room-code"
                hint="Six characters, letters and numbers. Case does not matter."
                error={undefined}
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
              <Button type="submit" size="lg" block loading={busy} disabled={code.length < 4}>
                Join session
              </Button>
            </form>
          </CardBody>
        </Card>

        <Card>
          <CardHead title="Live in your courses" sub="Sessions running right now that you are enrolled in" />
          {sessions.isLoading ? (
            <CardBody><span className="sk sk-line" style={{ height: 44, display: 'block' }} /></CardBody>
          ) : !liveNow.length ? (
            <EmptyState
              tight
              icon={<IconUsers size={20} />}
              title="Nothing live at the moment"
              description="When one of your teachers starts a session it will be listed here — you will still need the room code to join."
            />
          ) : (
            <div>
              {liveNow.map((s) => (
                <div className="panel-row" key={s.id}>
                  <div className="grow" style={{ minWidth: 0 }}>
                    <div className="record-title t-clamp-1">{s.course?.name ?? s.title}</div>
                    <div className="record-meta">{s.course?.code} · {s._count?.attendance ?? 0} joined</div>
                  </div>
                  <Badge tone="live">Live</Badge>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
