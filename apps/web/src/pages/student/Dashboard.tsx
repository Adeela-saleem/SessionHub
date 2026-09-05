import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../../lib/api';
import type {
  Announcement, Assignment, ClassSession, ContinueItem, Course, Slot, StudentAnalytics,
} from '../../lib/types';
import { useLiveSession } from '../../features/session/LiveSessionContext';
import {
  Badge, EmptyState, LinkButton, PageHeader, Progress, SectionHead, SimpleTable, Skeleton,
  Stat, StatGrid,
} from '../../components/ui';
import { IconArrowRight, IconAward2, IconBook, IconBroadcast, IconClipboard, IconClock, IconMessage, IconTarget, IconUserCheck } from '../../components/icons';
import { formatDayDate, relativeTime } from '../../lib/format';
import { dueLabel } from './Assignments';

/** The sessions endpoint returns the full record; the shared type
    omits its timestamps, so they are re-declared here. */
type SessionRecord = ClassSession & { startedAt?: string | null; createdAt?: string };


/** Today's timetable slots, in order; then the next one after now. */
function todayAndNext(slots: Slot[] | undefined) {
  if (!slots) return { today: [] as Slot[], next: null as Slot | null };
  const now = new Date();
  const dow = now.getDay();
  const hm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const today = slots.filter((s) => s.dayOfWeek === dow).sort((a, b) => a.startTime.localeCompare(b.startTime));
  const next = today.find((s) => s.endTime > hm) ?? null;
  return { today, next };
}

/* ============================================================
   Student overview
   Answers, in order: is something live, what do I have today,
   what is due, how am I doing, what am I enrolled in.
   ============================================================ */
export default function StudentDashboard() {
  const navigate = useNavigate();
  const { session } = useLiveSession();

  const courses = useQuery({ queryKey: ['courses'], queryFn: () => api.get<Course[]>('/courses') });
  const sessions = useQuery({
    queryKey: ['sessions'],
    queryFn: () => api.get<SessionRecord[]>('/sessions'),
    refetchInterval: 60_000,
  });
  const analytics = useQuery({
    queryKey: ['analytics', 'me'],
    queryFn: () => api.get<StudentAnalytics>('/analytics/me'),
  });
  const resume = useQuery({
    queryKey: ['continue'],
    queryFn: () => api.get<ContinueItem[]>('/me/continue?take=3'),
  });
  const assignments = useQuery({
    queryKey: ['my-assignments'],
    queryFn: () => api.get<Assignment[]>('/me/assignments'),
  });
  const feed = useQuery({
    queryKey: ['my-announcements'],
    queryFn: () => api.get<Announcement[]>('/me/announcements?take=4'),
  });
  const timetable = useQuery({
    queryKey: ['timetable', 'me'],
    queryFn: () => api.get<Slot[]>('/me/timetable'),
  });

  const live = sessions.data?.filter((s) => s.status === 'LIVE') ?? [];
  const dueSoon = (assignments.data ?? [])
    .filter((a) => !a.mySubmission?.submittedAt)
    .sort((a, b) => a.dueAt.localeCompare(b.dueAt))
    .slice(0, 5);
  const recent = sessions.data?.filter((s) => s.status !== 'LIVE').slice(0, 6) ?? [];
  const k = analytics.data?.kpis;
  const { today, next } = todayAndNext(timetable.data);
  const dateLabel = new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <>
      <PageHeader
        title="Overview"
        lede={dateLabel}
        actions={
          <LinkButton to="/student/live" size="lg" variant={session || live.length ? 'primary' : 'secondary'}>
            <IconBroadcast size={15} />{session ? 'Return to session' : 'Join a session'}
          </LinkButton>
        }
      />

      {/* ── Right now ─────────────────────────────────────── */}
      {(session || live.length > 0) && (
        <div className="now-strip">
          <span className="now-dot" aria-hidden="true" />
          <div className="grow">
            <span className="now-title">
              {session ? 'You are in a live session' : live.length === 1 ? 'A class is live now' : `${live.length} classes are live now`}
            </span>
            <span className="now-meta">
              {session
                ? `${session.course?.name ?? session.title ?? 'Session'} · room ${session.roomCode}`
                : `${live.map((s) => s.course?.name ?? s.title).filter(Boolean).join(' · ')} — ask your teacher for the room code.`}
            </span>
          </div>
          <LinkButton to="/student/live" size="sm" variant={session ? 'secondary' : 'primary'}>
            {session ? 'Open' : 'Join now'}<IconArrowRight size={14} />
          </LinkButton>
        </div>
      )}

      {/* ── KPIs ──────────────────────────────────────────── */}
      {analytics.isLoading ? (
        <Skeleton h={72} className="sk-block" />
      ) : (
        <StatGrid>
          <Stat icon={<IconTarget size={16} />} tone={k && k.accuracy >= 70 ? 'success' : 'warning'} label="Answer accuracy" value={k ? `${k.accuracy}%` : '—'} foot={k ? `${k.questionsAnswered} answered` : 'No answers yet'} />
          <Stat icon={<IconUserCheck size={16} />} tone="info" label="Attendance" value={k ? `${k.attendanceRate}%` : '—'} foot={k ? `${k.sessionsAttended} sessions` : 'No sessions yet'} />
          <Stat icon={<IconAward2 size={16} />} tone="accent" label="Marks earned" value={k?.marksEarned ?? '—'} foot="All courses" />
          <Stat icon={<IconClipboard size={16} />} tone={dueSoon.length ? 'danger' : 'neutral'} label="Due" value={assignments.data ? dueSoon.length : '—'} foot={dueSoon.length ? 'Not yet submitted' : 'Nothing outstanding'} />
          <Stat icon={<IconBook size={16} />} label="Courses" value={courses.data?.length ?? '—'} foot="Enrolled" />
        </StatGrid>
      )}

      <div className="split section">
        <div>
          {/* ── Today ─────────────────────────────────────── */}
          <section>
            <SectionHead
              title="Today"
              sub={next ? `Next: ${next.course?.code} at ${next.startTime}` : undefined}
              action={<Link to="/student/timetable" className="section-link">Full schedule<IconArrowRight /></Link>}
            />
            {timetable.isLoading ? (
              <Skeleton h={80} className="sk-block" />
            ) : today.length === 0 ? (
              <EmptyState row bare title="No classes scheduled today" description="Your timetable is clear. Anything live still appears above." />
            ) : (
              <SimpleTable
                bare
                rows={today}
                getRowId={(s) => s.id}
                onRowClick={(s) => navigate(`/student/courses/${s.courseId}`)}
                columns={[
                  { key: 'time', header: 'Time', width: 120, cell: (s) => <span className="cell-data">{s.startTime}–{s.endTime}</span> },
                  { key: 'course', header: 'Course', cell: (s) => <span className="cell-primary">{s.course?.name ?? s.courseId}</span> },
                  { key: 'code', header: 'Code', width: 96, cell: (s) => <span className="cell-data">{s.course?.code}</span> },
                  { key: 'room', header: 'Room', width: 110, secondary: true, cell: (s) => s.room ?? <span className="cell-muted">—</span> },
                  { key: 'status', header: '', width: 90, align: 'right', cell: (s) => (
                    next?.id === s.id ? <Badge tone="accent">Next</Badge>
                    : live.some((l) => l.courseId === s.courseId) ? <Badge tone="live">Live</Badge>
                    : null
                  ) },
                ]}
              />
            )}
          </section>

          {/* ── Due soon ──────────────────────────────────── */}
          <section className="section">
            <SectionHead
              title="Due soon"
              action={<Link to="/student/assignments" className="section-link">All assignments<IconArrowRight /></Link>}
            />
            {assignments.isLoading ? (
              <Skeleton h={80} className="sk-block" />
            ) : dueSoon.length === 0 ? (
              <EmptyState row bare title="Nothing outstanding" description="Every published assignment is handed in." />
            ) : (
              <SimpleTable
                bare
                rows={dueSoon}
                getRowId={(a) => a.id}
                onRowClick={(a) => navigate(`/student/assignments/${a.id}`)}
                columns={[
                  { key: 'title', header: 'Assignment', cell: (a) => <Link to={`/student/assignments/${a.id}`} className="cell-primary t-clamp-1">{a.title}</Link> },
                  { key: 'course', header: 'Course', width: 96, cell: (a) => <span className="cell-data">{a.course?.code}</span> },
                  { key: 'due', header: 'Due', width: 150, cell: (a) => (
                    <span style={{ color: new Date(a.dueAt) < new Date() ? 'var(--danger)' : undefined }}>{dueLabel(a.dueAt)}</span>
                  ) },
                  { key: 'marks', header: 'Marks', width: 72, align: 'right', cell: (a) => a.maxMarks },
                ]}
              />
            )}
          </section>

          {/* ── Courses ───────────────────────────────────── */}
          <section className="section">
            <SectionHead
              title="My courses"
              action={<Link to="/student/courses" className="section-link">View all<IconArrowRight /></Link>}
            />
            {courses.isLoading ? (
              <Skeleton h={100} className="sk-block" />
            ) : !courses.data?.length ? (
              <EmptyState
                row bare
                title="No courses yet"
                description="Courses appear here once an administrator enrols you."
              />
            ) : (
              <SimpleTable
                bare
                rows={courses.data.slice(0, 6)}
                getRowId={(c) => c.id}
                onRowClick={(c) => navigate(`/student/courses/${c.id}`)}
                columns={[
                  { key: 'code', header: 'Code', width: 96, cell: (c) => <span className="cell-data">{c.code}</span> },
                  { key: 'name', header: 'Course', cell: (c) => <span className="cell-primary">{c.name}</span> },
                  { key: 'teacher', header: 'Teacher', width: 160, secondary: true, cell: (c) => c.teacher?.name ?? <span className="cell-muted">Unassigned</span> },
                  { key: 'att', header: 'Attendance', width: 180, cell: (c) => {
                    const pc = analytics.data?.perCourse.find((x) => x.course === c.code);
                    return pc ? (
                      <span className="cell-progress">
                        <Progress value={pc.rate} tone={pc.rate >= 75 ? 'success' : pc.rate >= 45 ? 'warning' : 'danger'} label={`${c.code} attendance`} />
                        <span className="t-num">{pc.rate}%</span>
                      </span>
                    ) : <span className="cell-muted">No sessions yet</span>;
                  } },
                ]}
              />
            )}
          </section>
        </div>

        {/* ── Rail ──────────────────────────────────────────── */}
        <div>
          {resume.data && resume.data.length > 0 && (
            <section>
              <SectionHead title="Continue" />
              <ul className="resume-list">
                {resume.data.map((r) => (
                  <li key={r.id}>
                    <Link to={`/student/learn/${r.lesson.module.course.id}/${r.lesson.id}`} className="resume-row">
                      <span className="resume-row-main">
                        <span className="resume-row-title t-clamp-1">{r.lesson.title}</span>
                        <span className="resume-row-meta t-clamp-1">
                          <span className="t-data">{r.lesson.module.course.code}</span> · {r.lesson.module.title}
                        </span>
                        <Progress value={r.percent} size="sm" label={`${r.lesson.title} progress`} />
                      </span>
                      <span className="resume-row-pct t-num">{r.percent}%</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className={resume.data?.length ? 'section' : undefined}>
            <SectionHead title="Announcements" />
            {feed.isLoading ? (
              <Skeleton h={60} className="sk-block" />
            ) : !feed.data?.length ? (
              <EmptyState row bare title="No announcements" description="Course news from your teachers lands here." />
            ) : (
              <ul className="feed-list">
                {feed.data.map((a) => (
                  <li key={a.id}>
                    <Link to={`/student/courses/${a.courseId}`} className="feed-row">
                      <span className="feed-row-icon tone-warning"><IconMessage size={14} /></span>
                      <span className="feed-row-main">
                      <span className="feed-row-title t-clamp-1">
                        {a.priority === 'IMPORTANT' && <Badge tone="warning">Important</Badge>}
                        {a.title}
                      </span>
                      <span className="feed-row-meta"><span className="t-data">{a.course?.code}</span> · {relativeTime(a.createdAt)}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="section">
            <SectionHead title="Recent sessions" />
            {sessions.isLoading ? (
              <Skeleton h={60} className="sk-block" />
            ) : !recent.length ? (
              <EmptyState row bare title="Nothing yet" description="Sessions you attend will be listed here." />
            ) : (
              <ul className="feed-list">
                {recent.map((s) => (
                  <li key={s.id} className="feed-row">
                    <span className="feed-row-icon"><IconClock size={14} /></span>
                    <span className="feed-row-main">
                      <span className="feed-row-title t-clamp-1">{s.title ?? s.course?.name ?? 'Session'}</span>
                      <span className="feed-row-meta">
                        <span className="t-data">{s.course?.code}</span> · {formatDayDate(s.startedAt ?? s.createdAt)} · {s._count?.questions ?? 0} questions
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {k && k.questionsAnswered > 0 && (
            <section className="section">
              <SectionHead title="Standing" />
              <dl className="kv">
                <div><dt>Answer accuracy</dt><dd style={{ color: k.accuracy >= 70 ? 'var(--success)' : 'var(--warning)' }}>{k.accuracy}%</dd></div>
                <div><dt>Target</dt><dd>70%</dd></div>
                <div><dt>Attendance</dt><dd>{k.attendanceRate}%</dd></div>
              </dl>
              <p className="t-caption t-muted" style={{ marginTop: 'var(--s-3)' }}>
                {k.accuracy >= 70
                  ? 'Above target. Attendance is the larger part of your record, so keep attending.'
                  : `${70 - k.accuracy} points below target. Reviewing the explanation after each question is the fastest way to close that.`}
              </p>
            </section>
          )}
        </div>
      </div>
    </>
  );
}
