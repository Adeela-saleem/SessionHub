import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../../lib/api';
import type { ClassSession, Course, QuestionResults, TeacherQuestion } from '../../lib/types';
import { useLiveSession } from '../../features/session/LiveSessionContext';
import { QaPanel } from '../../features/session/QaPanel';
import { TeacherPollPanel } from '../../features/session/PollPanel';
import { ConnectionStrip } from '../../features/session/ConnectionStrip';
import { LiveBar } from '../../features/session/LiveBar';
import {
  Badge, Banner, Button, ConfirmDialog, EmptyState, LinkButton, PageHeader, Progress,
  SectionHead, SelectField, SimpleTable, Skeleton, TextField, useToast,
} from '../../components/ui';
import {
  IconArrowRight, IconChart, IconCheck, IconHelp, IconPlay, IconSparkle, IconStop,
} from '../../components/icons';
import { formatDayDate } from '../../lib/format';

type SessionRecord = ClassSession & { startedAt?: string | null; createdAt?: string };

/* ============================================================
   Live classroom — teacher
   A control room: status across the top, the current question
   on the stage, the queue beneath it, the room down the side,
   and the two actions that run the class pinned to the bottom.
   ============================================================ */
export default function TeacherLiveControl() {
  const qc = useQueryClient();
  const toast = useToast();
  const {
    session, adopt, leave, attendees, answered, results, setResults, connected, reactions,
  } = useLiveSession();

  const [error, setError] = useState('');
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [pollRequest, setPollRequest] = useState(0);

  const courses = useQuery({ queryKey: ['courses'], queryFn: () => api.get<Course[]>('/courses') });
  const sessions = useQuery({
    queryKey: ['sessions'],
    queryFn: () => api.get<SessionRecord[]>('/sessions'),
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

  const list = questions.data ?? [];
  const openQ = list.find((q) => q.state === 'OPEN');
  const nextPending = list.find((q) => q.state === 'PENDING');
  const done = list.filter((q) => q.state === 'CLOSED').length;

  // `o` opens the next pending question, `c` closes the open one, `p`
  // starts a poll. Ignored while typing.
  useEffect(() => {
    if (!session) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      const key = e.key.toLowerCase();
      if (key === 'o' && !openQ && nextPending && !openQuestion.isPending) {
        openQuestion.mutate(nextPending.id);
      } else if (key === 'c' && openQ && !closeQuestion.isPending) {
        closeQuestion.mutate(openQ.id);
      } else if (key === 'p') {
        setPollRequest((n) => n + 1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.id, openQ?.id, nextPending?.id, openQuestion.isPending, closeQuestion.isPending]);

  const openLive = sessions.data?.filter((s) => s.status === 'LIVE') ?? [];
  const recent = sessions.data?.filter((s) => s.status === 'CLOSED').slice(0, 6) ?? [];

  /* ── Before going live ──────────────────────────────── */
  if (!session) {
    return (
      <>
        <PageHeader
          title="Live classroom"
          lede="Start a session to get a room code, then open questions one at a time as you teach."
          actions={
            <LinkButton to="/teacher/studio" variant="secondary">
              <IconSparkle size={15} />Draft questions
            </LinkButton>
          }
        />

        {error && <Banner tone="error" title="Could not start">{error}</Banner>}

        {openLive.length > 0 && (
          <div className="now-strip">
            <span className="now-dot" aria-hidden="true" />
            <div className="grow">
              <span className="now-title">{openLive[0]!.course?.name ?? openLive[0]!.title} is still open</span>
              <span className="now-meta">
                Room <span className="t-data">{openLive[0]!.roomCode}</span> · {openLive[0]!._count?.attendance ?? 0} joined ·
                started {formatDayDate(openLive[0]!.startedAt ?? openLive[0]!.createdAt)}
              </span>
            </div>
            <Button size="sm" onClick={() => adopt(openLive[0]!)}>Resume<IconArrowRight size={14} /></Button>
          </div>
        )}

        <div className="split-rail split">
          <section className="container-form" style={{ margin: 0 }}>
            <SectionHead title="New session" />
            {courses.isLoading ? (
              <Skeleton h={120} className="sk-block" />
            ) : !courses.data?.length ? (
              <EmptyState
                row bare
                title="No courses assigned"
                description="You need to be the assigned teacher on at least one course before you can run a session."
              />
            ) : (
              <form
                className="form"
                onSubmit={(e: FormEvent<HTMLFormElement>) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  const courseId = String(f.get('courseId'));
                  if (courseId) {
                    startSession.mutate({ courseId, title: String(f.get('title') || '') || undefined });
                  }
                }}
              >
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
                <div className="form-actions">
                  <span className="t-caption t-muted grow">A six-character room code is generated when you go live.</span>
                  <Button type="submit" size="lg" loading={startSession.isPending}>
                    <IconPlay size={15} />Go live
                  </Button>
                </div>
              </form>
            )}
          </section>

          <section>
            <SectionHead title="Recent sessions" />
            {sessions.isLoading ? (
              <Skeleton h={80} className="sk-block" />
            ) : !recent.length ? (
              <EmptyState row bare title="No finished sessions" description="Sessions appear here once you close them." />
            ) : (
              <ul className="feed-list">
                {recent.map((s) => (
                  <li key={s.id} className="feed-row">
                    <span className="feed-row-title t-clamp-1">{s.title ?? s.course?.name}</span>
                    <span className="feed-row-meta">
                      {formatDayDate(s.startedAt ?? s.createdAt)} · {s._count?.attendance ?? 0} attended · {s._count?.questions ?? 0} questions
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </>
    );
  }

  /* ── Live ───────────────────────────────────────────── */
  const responseRate = attendees ? Math.round((answered / attendees) * 100) : null;

  return (
    <div className="live">
      <LiveBar
        session={session}
        codeSize="md"
        copyable
        facts={[
          { label: 'In the room', value: attendees },
          { label: 'Answered', value: openQ ? `${answered}/${attendees}` : '—' },
          { label: 'Questions', value: `${done}/${list.length}` },
        ]}
        actions={
          <>
            <LinkButton to="/teacher/studio" variant="secondary" size="sm">
              <IconSparkle size={14} />Add questions
            </LinkButton>
            <Button variant="danger" size="sm" onClick={() => setConfirmEnd(true)}>
              <IconStop size={14} />End session
            </Button>
          </>
        }
      />

      <ConnectionStrip connected={connected} />

      <div className="live-layout">
        <div className="live-main">
          {/* ── Stage ─────────────────────────────────────── */}
          <section className={`live-stage ${openQ ? 'is-open' : results ? 'is-result' : ''}`.trim()} aria-live="polite">
            {questions.isLoading ? (
              <Skeleton h={160} className="sk-block" />
            ) : openQ ? (
              <>
                <div className="stage-head">
                  <span className="stage-kicker"><Badge tone="live">Open</Badge>Question {openQ.order} of {list.length} · {openQ.marks} {openQ.marks === 1 ? 'mark' : 'marks'}</span>
                  <span className="stage-count t-num">{answered} of {attendees} answered</span>
                </div>
                <Progress value={attendees ? (answered / attendees) * 100 : 0} label="Answers received" />
                <p className="stage-prompt">{openQ.prompt}</p>
                {openQ.type === 'MCQ' ? (
                  <ol className="stage-options">
                    {openQ.options.map((opt, i) => (
                      <li key={i} className={openQ.key?.correctIndex === i ? 'is-key' : ''}>
                        <span className="lq-key">{String.fromCharCode(65 + i)}</span>
                        <span className="grow">{opt}</span>
                        {openQ.key?.correctIndex === i && <span className="stage-key-mark"><IconCheck size={12} />Key</span>}
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="t-sm t-muted">Written answers — collected for marking after the session.</p>
                )}
              </>
            ) : results ? (
              <>
                <div className="stage-head">
                  <span className="stage-kicker"><Badge tone="neutral">Closed</Badge>Result</span>
                  <span className="stage-count t-num">{results.correctCount} of {results.totalAnswers} correct</span>
                </div>
                <p className="stage-prompt">{results.prompt}</p>
                {results.distribution.length ? (
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
                ) : (
                  <p className="lq-short-none">
                    {results.totalAnswers} written {results.totalAnswers === 1 ? 'answer' : 'answers'} collected —
                    review and mark them after the session.
                  </p>
                )}
                {results.explanation && (
                  <div className="lq-explain">
                    <span className="t-label">Explanation shown to students</span>
                    <p>{results.explanation}</p>
                  </div>
                )}
              </>
            ) : nextPending ? (
              <>
                <div className="stage-head">
                  <span className="stage-kicker"><Badge tone="info">Up next</Badge>Question {nextPending.order} of {list.length} · {nextPending.marks} {nextPending.marks === 1 ? 'mark' : 'marks'}</span>
                </div>
                <p className="stage-prompt">{nextPending.prompt}</p>
                {nextPending.type === 'MCQ' && (
                  <ol className="stage-options is-preview">
                    {nextPending.options.map((opt, i) => (
                      <li key={i}>
                        <span className="lq-key">{String.fromCharCode(65 + i)}</span>
                        <span className="grow">{opt}</span>
                      </li>
                    ))}
                  </ol>
                )}
              </>
            ) : list.length === 0 ? (
              <EmptyState
                icon={<IconSparkle size={18} />}
                title="No questions in this session"
                description="Draft a set in the quiz studio, review each answer key, then broadcast them here."
                action={<LinkButton to="/teacher/studio" size="sm">Open quiz studio</LinkButton>}
              />
            ) : (
              <EmptyState
                icon={<IconCheck size={18} />}
                title="Every question has been asked"
                description="Add more from the studio, run a poll, or end the session."
              />
            )}
          </section>

          {/* ── Queue ─────────────────────────────────────── */}
          {list.length > 0 && (
            <section className="section-tight">
              <SectionHead title="Question queue" sub={`${done} of ${list.length} done`} />
              <SimpleTable
                bare
                rows={list}
                getRowId={(q) => q.id}
                columns={[
                  { key: 'n', header: '#', width: 40, cell: (q) => <span className="cell-data">{q.order}</span> },
                  { key: 'prompt', header: 'Question', cell: (q) => (
                    <span className={`q-prompt-cell t-clamp-1 ${q.state === 'CLOSED' ? '' : 'cell-primary'}`.trim()}>{q.prompt}</span>
                  ) },
                  { key: 'type', header: 'Type', width: 84, secondary: true, cell: (q) => <span className="cell-muted">{q.type === 'MCQ' ? 'Choice' : 'Written'}</span> },
                  { key: 'answers', header: 'Answers', width: 84, align: 'right', cell: (q) => q._count?.answers ?? 0 },
                  { key: 'state', header: 'State', width: 96, cell: (q) => (
                    <Badge tone={q.state === 'OPEN' ? 'live' : q.state === 'CLOSED' ? 'neutral' : 'info'}>
                      {q.state === 'OPEN' ? 'Open' : q.state === 'CLOSED' ? 'Closed' : 'Pending'}
                    </Badge>
                  ) },
                  { key: 'action', header: '', width: 150, align: 'right', cell: (q) => (
                    q.state === 'OPEN' ? (
                      <Button size="xs" variant="secondary" loading={closeQuestion.isPending} onClick={() => closeQuestion.mutate(q.id)}>
                        Close &amp; reveal
                      </Button>
                    ) : q.state === 'PENDING' ? (
                      <Button size="xs" variant="secondary" disabled={!!openQ} loading={openQuestion.isPending} onClick={() => openQuestion.mutate(q.id)}>
                        Open
                      </Button>
                    ) : <span className="cell-muted">Done</span>
                  ) },
                ]}
              />
            </section>
          )}

          <div className="section-tight">
            <TeacherPollPanel sessionId={session.id} composeRequest={pollRequest} />
          </div>
        </div>

        {/* ── Rail ──────────────────────────────────────── */}
        <aside className="live-rail">
          <section>
            <SectionHead title="Participation" />
            <dl className="kv">
              <div><dt>Joined</dt><dd>{attendees}</dd></div>
              <div><dt>Answered this question</dt><dd>{openQ ? answered : '—'}</dd></div>
              <div><dt>Response rate</dt><dd>{openQ && responseRate !== null ? `${responseRate}%` : '—'}</dd></div>
            </dl>
          </section>

          <section className="section-tight">
            <SectionHead title="Engagement" sub="Anonymous taps since the last question opened" />
            <div className="react-chips" style={{ marginLeft: 0 }}>
              <span className={`react-chip ${reactions.confused > 0 ? 'is-warm' : ''}`.trim()}>
                <IconHelp size={13} />Confused <b className="t-num">{reactions.confused}</b>
              </span>
              <span className="react-chip">
                <IconCheck size={13} />Got it <b className="t-num">{reactions.gotIt}</b>
              </span>
            </div>
          </section>

          <div className="section-tight">
            <QaPanel sessionId={session.id} canAnswer />
          </div>
        </aside>
      </div>

      {/* ── Controls — pinned ─────────────────────────────── */}
      <div className="live-controls" role="toolbar" aria-label="Session controls">
        <span className="live-controls-status t-num">
          {openQ ? `Q${openQ.order} open` : nextPending ? `Q${nextPending.order} next` : 'Queue finished'}
          <span className="t-muted"> · {done}/{list.length} done</span>
        </span>
        <span className="grow" />
        <Button variant="secondary" size="md" onClick={() => setPollRequest((n) => n + 1)}>
          <IconChart size={14} />Launch poll<kbd className="live-kbd">P</kbd>
        </Button>
        {openQ ? (
          <Button size="md" loading={closeQuestion.isPending} onClick={() => closeQuestion.mutate(openQ.id)}>
            Close &amp; reveal<kbd className="live-kbd">C</kbd>
          </Button>
        ) : (
          <Button size="md" disabled={!nextPending} loading={openQuestion.isPending} onClick={() => nextPending && openQuestion.mutate(nextPending.id)}>
            <IconPlay size={14} />Open next<kbd className="live-kbd">O</kbd>
          </Button>
        )}
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
    </div>
  );
}
