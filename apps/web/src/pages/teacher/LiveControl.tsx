import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../../lib/api';
import type { ClassSession, Course, QuestionResults, TeacherQuestion } from '../../lib/types';
import { useLiveSession } from '../../features/session/LiveSessionContext';
import { QaPanel } from '../../features/session/QaPanel';
import {
  Badge, Banner, Button, Card, CardBody, CardHead, ConfirmDialog, EmptyState,
  LinkButton, PageHeader, PanelRow, RoomCode, SelectField, Skeleton, Stat,
  TextField, useToast,
} from '../../components/ui';
import {
  IconBook, IconBroadcast, IconPlay, IconSparkle, IconStop,
} from '../../components/icons';

/* ============================================================
   Live control
   The room code and the question queue are the two things a
   teacher looks at while talking, so they are the two things
   this page gives real estate to.
   ============================================================ */
export default function TeacherLiveControl() {
  const qc = useQueryClient();
  const toast = useToast();
  const { session, adopt, leave, attendees, answered, results, setResults } = useLiveSession();

  const [error, setError] = useState('');
  const [confirmEnd, setConfirmEnd] = useState(false);

  const courses = useQuery({ queryKey: ['courses'], queryFn: () => api.get<Course[]>('/courses') });
  const sessions = useQuery({
    queryKey: ['sessions'],
    queryFn: () => api.get<ClassSession[]>('/sessions'),
    enabled: !session,
  });
  const questions = useQuery({
    queryKey: ['questions', session?.id],
    queryFn: () => api.get<TeacherQuestion[]>(`/sessions/${session!.id}/questions`),
    enabled: !!session,
  });

  const startSession = useMutation({
    mutationFn: (body: { courseId: string; title?: string }) => api.post<ClassSession>('/sessions', body),
    onSuccess: (s) => {
      adopt(s);
      qc.invalidateQueries({ queryKey: ['sessions'] });
      toast.success('You are live', `Room code ${s.roomCode} — share it with the class.`);
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Could not start the session.'),
  });

  const openQuestion = useMutation({
    mutationFn: (id: string) => api.post(`/questions/${id}/open`),
    onSuccess: () => { setResults(null); void questions.refetch(); },
    onError: () => toast.error('Could not open that question'),
  });

  const closeQuestion = useMutation({
    mutationFn: (id: string) => api.post<QuestionResults>(`/questions/${id}/close`),
    onSuccess: (r) => { setResults(r); void questions.refetch(); },
    onError: () => toast.error('Could not close that question'),
  });

  const openLive = sessions.data?.filter((s) => s.status === 'LIVE') ?? [];

  /* ── Before going live ──────────────────────────────── */
  if (!session) {
    return (
      <>
        <PageHeader
          eyebrow="Teaching"
          title="Live control"
          lede="Start a session to get a room code, then open questions one at a time as you teach."
        />

        {error && <Banner tone="error" title="Could not start">{error}</Banner>}

        {openLive.length > 0 && (
          <Card style={{ marginBottom: 'var(--s-6)' }}>
            <CardHead title="Still open" sub="A session you started has not been closed" />
            <div>
              {openLive.map((s) => (
                <PanelRow key={s.id}>
                  <div className="grow" style={{ minWidth: 0 }}>
                    <div className="record-title t-clamp-1">{s.course?.name ?? s.title}</div>
                    <div className="record-meta">Room {s.roomCode} · {s._count?.attendance ?? 0} joined</div>
                  </div>
                  <Badge tone="live">Live</Badge>
                  <Button size="sm" variant="secondary" onClick={() => adopt(s)}>Resume</Button>
                </PanelRow>
              ))}
            </div>
          </Card>
        )}

        <div className="join-grid">
          <Card>
            <CardBody className="join-card">
              <span className="join-mark" aria-hidden="true"><IconBroadcast size={22} /></span>
              {courses.isLoading ? (
                <Skeleton h={120} className="sk-block" />
              ) : !courses.data?.length ? (
                <EmptyState
                  tight
                  icon={<IconBook size={20} />}
                  title="No courses assigned"
                  description="You need to be the assigned teacher on at least one course before you can run a session. An administrator can do this from the Courses screen."
                />
              ) : (
                <form onSubmit={(e: FormEvent<HTMLFormElement>) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  const courseId = String(f.get('courseId'));
                  if (courseId) {
                    startSession.mutate({ courseId, title: String(f.get('title') || '') || undefined });
                  }
                }}>
                  <SelectField label="Course" name="courseId" required defaultValue="">
                    <option value="" disabled>Choose a course…</option>
                    {courses.data.map((c) => (
                      <option key={c.id} value={c.id}>{c.code} — {c.name}</option>
                    ))}
                  </SelectField>
                  <TextField
                    label="Session title" name="title" optional
                    placeholder="Normalisation and functional dependencies"
                    hint="Shown to students when they join. Defaults to the course name."
                  />
                  <Button type="submit" size="lg" block loading={startSession.isPending}>
                    <IconPlay size={15} />Go live
                  </Button>
                </form>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHead title="Before you start" sub="Two minutes of preparation saves the whole class" />
            <CardBody>
              <ol className="numbered-list">
                <li>Draft your questions in the quiz studio and review every answer key.</li>
                <li>Go live — the room code appears large enough to read from the back row.</li>
                <li>Open one question at a time and close it to reveal the distribution.</li>
                <li>Close the session when the class ends so attendance is final.</li>
              </ol>
              <LinkButton to="/teacher/studio" variant="secondary" size="sm" style={{ marginTop: 'var(--s-5)' }}>
                <IconSparkle size={14} />Open quiz studio
              </LinkButton>
            </CardBody>
          </Card>
        </div>
      </>
    );
  }

  /* ── Live ───────────────────────────────────────────── */
  const list = questions.data ?? [];
  const openQ = list.find((q) => q.state === 'OPEN');

  return (
    <>
      <PageHeader
        eyebrow={session.course?.code ?? 'Live session'}
        title={session.course?.name ?? session.title ?? 'Live session'}
        actions={
          <>
            <LinkButton to="/teacher/studio" variant="secondary">
              <IconSparkle size={15} />Add questions
            </LinkButton>
            <Button variant="danger" onClick={() => setConfirmEnd(true)}>
              <IconStop size={15} />End session
            </Button>
          </>
        }
      />

      {/* The room code is the single most-read thing on this screen. */}
      <div className="room-banner">
        <div className="room-banner-code">
          <span className="t-label" style={{ color: 'rgb(180 198 222 / 0.75)' }}>Room code</span>
          <RoomCode code={session.roomCode} size="lg" invert copyable />
        </div>
        <dl className="room-banner-stats">
          <div><dt>In the room</dt><dd className="t-num">{attendees}</dd></div>
          <div><dt>Answered</dt><dd className="t-num">{answered}</dd></div>
          <div><dt>Questions</dt><dd className="t-num">{list.length}</dd></div>
        </dl>
        <Badge tone="live">Live</Badge>
      </div>

      <div className="split section">
        <Card>
          <CardHead
            title="Question queue"
            sub={openQ ? 'One question is open — close it to reveal the answer' : 'Open a question when the room is ready'}
            action={<Badge tone="neutral">{list.filter((q) => q.state === 'CLOSED').length} of {list.length} done</Badge>}
          />
          {questions.isLoading ? (
            <CardBody><Skeleton h={120} className="sk-block" /></CardBody>
          ) : !list.length ? (
            <EmptyState
              icon={<IconSparkle size={20} />}
              title="No questions in this session"
              description="Generate a set in the quiz studio, review each answer key, then broadcast them to this session."
              action={<LinkButton to="/teacher/studio" size="sm">Open quiz studio</LinkButton>}
            />
          ) : (
            <ul className="q-queue">
              {list.map((q) => (
                <li key={q.id} className={`q-item is-${q.state.toLowerCase()}`}>
                  <span className="q-order t-num">{q.order}</span>
                  <div className="grow" style={{ minWidth: 0 }}>
                    <p className="q-prompt">{q.prompt}</p>
                    <div className="q-meta">
                      <Badge tone={q.state === 'OPEN' ? 'live' : q.state === 'CLOSED' ? 'neutral' : 'info'}>
                        {q.state === 'OPEN' ? 'Open' : q.state === 'CLOSED' ? 'Closed' : 'Pending'}
                      </Badge>
                      <span>{q._count?.answers ?? 0} answers</span>
                      <span>{q.marks} {q.marks === 1 ? 'mark' : 'marks'}</span>
                    </div>
                  </div>
                  <div className="q-action">
                    {q.state === 'OPEN' ? (
                      <Button size="sm" variant="secondary" loading={closeQuestion.isPending}
                        onClick={() => closeQuestion.mutate(q.id)}>
                        Close &amp; reveal
                      </Button>
                    ) : q.state === 'PENDING' ? (
                      <Button size="sm" disabled={!!openQ} loading={openQuestion.isPending}
                        onClick={() => openQuestion.mutate(q.id)}>
                        <IconPlay size={13} />Open
                      </Button>
                    ) : (
                      <span className="t-caption t-muted">Done</span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <div className="stack">
          {results && (
            <Card>
              <CardHead
                title="Last result"
                sub={`${results.correctCount} of ${results.totalAnswers} answered correctly`}
              />
              <CardBody>
                <p className="lq-prompt" style={{ fontSize: 'var(--fs-sm)' }}>{results.prompt}</p>
                <ul className="lq-results">
                  {results.distribution.map((d) => (
                    <li key={d.index} className={d.index === results.correctIndex ? 'is-correct' : ''}>
                      <span className="lq-key">{String.fromCharCode(65 + d.index)}</span>
                      <span className="lq-opt-label t-clamp-1">{d.label}</span>
                      <span className="lq-bar">
                        <i style={{ width: `${(d.count / (results.totalAnswers || 1)) * 100}%` }} />
                      </span>
                      <span className="lq-count t-num">{d.count}</span>
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          )}

          <Card>
            <CardHead title="Participation" plain />
            <CardBody>
              <div className="row" style={{ gap: 'var(--s-7)' }}>
                <Stat label="Joined" value={attendees} foot="Students in the room" />
                <Stat
                  label="Response rate"
                  value={attendees ? `${Math.round((answered / attendees) * 100)}%` : '—'}
                  foot="Of the current question"
                />
              </div>
            </CardBody>
          </Card>

          <QaPanel sessionId={session.id} canAnswer />
        </div>
      </div>

      <ConfirmDialog
        open={confirmEnd}
        onClose={() => setConfirmEnd(false)}
        onConfirm={async () => {
          await leave();
          setConfirmEnd(false);
          qc.invalidateQueries({ queryKey: ['sessions'] });
          toast.success('Session closed', 'Attendance and marks are now final.');
        }}
        title="End this session?"
        description="Students will be disconnected and no further answers can be recorded. Attendance and marks already collected are kept."
        confirmLabel="End session"
        destructive
      />
    </>
  );
}
