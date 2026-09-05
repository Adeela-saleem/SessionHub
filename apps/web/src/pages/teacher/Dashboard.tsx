import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../../lib/api';
import type { ClassSession, Course, Slot, TeacherAnalytics } from '../../lib/types';
import { useLiveSession } from '../../features/session/LiveSessionContext';
import {
  Badge, EmptyState, LinkButton, PageHeader, Progress, SectionHead, SimpleTable, Skeleton,
  Stat, StatGrid,
} from '../../components/ui';
import { IconArrowRight, IconAward2, IconBook, IconBroadcast, IconClipboard, IconClock, IconFile, IconMessage, IconSparkle, IconTarget, IconUsers } from '../../components/icons';
import { formatDayDate } from '../../lib/format';

/** The sessions endpoint returns the full record; the shared type
    omits its timestamps, so they are re-declared here. */
type SessionRecord = ClassSession & { startedAt?: string | null; createdAt?: string };

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
   Teacher overview
   Is a session running, what is on today, which questions the
   room failed, what I teach, and what happened recently.
   ============================================================ */
export default function TeacherDashboard() {
  const navigate = useNavigate();
  const { session } = useLiveSession();

  const courses = useQuery({ queryKey: ['courses'], queryFn: () => api.get<Course[]>('/courses') });
  const sessions = useQuery({
    queryKey: ['sessions'],
    queryFn: () => api.get<SessionRecord[]>('/sessions'),
    refetchInterval: 60_000,
  });
  const analytics = useQuery({
    queryKey: ['analytics', 'teacher'],
    queryFn: () => api.get<TeacherAnalytics>('/analytics/teacher'),
  });
  const timetable = useQuery({
    queryKey: ['timetable', 'me'],
    queryFn: () => api.get<Slot[]>('/me/timetable'),
  });

  const k = analytics.data?.kpis;
  const liveElsewhere = sessions.data?.filter((s) => s.status === 'LIVE' && s.id !== session?.id) ?? [];
  const recent = sessions.data?.filter((s) => s.status === 'CLOSED').slice(0, 6) ?? [];
  const { today, next } = todayAndNext(timetable.data);

  // The analytics payload repeats a question once per session it was
  // asked in; keep one row per prompt, at its worst accuracy.
  const worstByPrompt = new Map<string, TeacherAnalytics['questionDifficulty'][number]>();
  for (const q of analytics.data?.questionDifficulty ?? []) {
    if (q.answers === 0) continue;
    const prev = worstByPrompt.get(q.prompt);
    if (!prev || q.correctPct < prev.correctPct) worstByPrompt.set(q.prompt, q);
  }
  const weakest = [...worstByPrompt.values()]
    .filter((q) => q.correctPct < 70)
    .sort((a, b) => a.correctPct - b.correctPct)
    .slice(0, 5);
  const dateLabel = new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
  const engagement = k && k.questionsAsked ? Math.round(k.totalAnswers / k.questionsAsked * 10) / 10 : null;

  return (
    <>
      <PageHeader
        title="Overview"
        lede={dateLabel}
        actions={
          <LinkButton to="/teacher/live" size="lg">
            <IconBroadcast size={15} />{session ? 'Return to classroom' : 'Start a session'}
          </LinkButton>
        }
      />

      {(session || liveElsewhere.length > 0) && (
        <div className="now-strip">
          <span className="now-dot" aria-hidden="true" />
          <div className="grow">
            <span className="now-title">{session ? 'Your session is live' : 'A session of yours is still open'}</span>
            <span className="now-meta">
              {session
                ? `${session.course?.name ?? session.title} · room ${session.roomCode}`
                : `${liveElsewhere[0]!.course?.name ?? liveElsewhere[0]!.title} · room ${liveElsewhere[0]!.roomCode} — close it when the class ends so attendance is final.`}
            </span>
          </div>
          <LinkButton to="/teacher/live" size="sm" variant="secondary">
            {session ? 'Open classroom' : 'Resume'}<IconArrowRight size={14} />
          </LinkButton>
        </div>
      )}

      {analytics.isLoading ? (
        <Skeleton h={72} className="sk-block" />
      ) : (
        <StatGrid>
          <Stat icon={<IconBroadcast size={16} />} tone={k?.liveNow ? 'danger' : 'neutral'} label="Sessions run" value={k?.sessionsRun ?? '—'} foot={k?.liveNow ? `${k.liveNow} live now` : 'None live'} />
          <Stat icon={<IconMessage size={16} />} tone="info" label="Questions asked" value={k?.questionsAsked ?? '—'} foot="All sessions" />
          <Stat icon={<IconUsers size={16} />} tone="accent" label="Answers received" value={k?.totalAnswers ?? '—'} foot={engagement !== null ? `${engagement} per question` : 'From students'} />
          <Stat icon={<IconTarget size={16} />} tone={k && k.avgAccuracy >= 70 ? 'success' : 'warning'} label="Average accuracy" value={k ? `${k.avgAccuracy}%` : '—'} foot={k && k.avgAccuracy < 50 ? 'Below the 50% line' : 'Every question'} />
          <Stat icon={<IconBook size={16} />} label="Courses" value={courses.data?.length ?? '—'} foot="Assigned to you" />
        </StatGrid>
      )}

      <div className="split section">
        <div>
          <section>
            <SectionHead
              title="Today"
              sub={next ? `Next: ${next.course?.code} at ${next.startTime}` : undefined}
              action={<Link to="/teacher/timetable" className="section-link">Full schedule<IconArrowRight /></Link>}
            />
            {timetable.isLoading ? (
              <Skeleton h={80} className="sk-block" />
            ) : today.length === 0 ? (
              <EmptyState row bare title="No classes scheduled today" description="Add slots to your timetable to see them here." />
            ) : (
              <SimpleTable
                bare
                rows={today}
                getRowId={(s) => s.id}
                onRowClick={(s) => navigate(`/teacher/courses/${s.courseId}`)}
                columns={[
                  { key: 'time', header: 'Time', width: 120, cell: (s) => <span className="cell-data">{s.startTime}–{s.endTime}</span> },
                  { key: 'course', header: 'Course', cell: (s) => <span className="cell-primary">{s.course?.name ?? s.courseId}</span> },
                  { key: 'code', header: 'Code', width: 96, cell: (s) => <span className="cell-data">{s.course?.code}</span> },
                  { key: 'room', header: 'Room', width: 110, secondary: true, cell: (s) => s.room ?? <span className="cell-muted">—</span> },
                  { key: 'status', header: '', width: 90, align: 'right', cell: (s) => (
                    (session?.courseId === s.courseId || liveElsewhere.some((l) => l.courseId === s.courseId)) ? <Badge tone="live">Live</Badge>
                    : next?.id === s.id ? <Badge tone="accent">Next</Badge>
                    : null
                  ) },
                ]}
              />
            )}
          </section>

          <section className="section">
            <SectionHead
              title="Needs re-teaching"
              sub="Questions the room answered worst"
              action={<Link to="/teacher/analytics" className="section-link">Analytics<IconArrowRight /></Link>}
            />
            {analytics.isLoading ? (
              <Skeleton h={80} className="sk-block" />
            ) : !weakest.length ? (
              <EmptyState row bare title="Nothing flagged" description="Questions students struggled with are surfaced here once answers come in." />
            ) : (
              <SimpleTable
                bare
                rows={weakest}
                getRowId={(q) => q.prompt}
                columns={[
                  { key: 'q', header: 'Question', cell: (q) => <span className="cell-primary t-clamp-1">{q.prompt}</span> },
                  { key: 'label', header: '', width: 60, cell: (q) => <span className="cell-data">{q.label}</span> },
                  { key: 'answers', header: 'Answers', width: 88, align: 'right', cell: (q) => q.answers },
                  { key: 'pct', header: 'Correct', width: 170, cell: (q) => (
                    <span className="cell-progress">
                      <Progress value={q.correctPct} tone={q.correctPct >= 75 ? 'success' : q.correctPct >= 45 ? 'warning' : 'danger'} label={`${q.label} correct`} />
                      <span className="t-num">{q.correctPct}%</span>
                    </span>
                  ) },
                ]}
              />
            )}
          </section>

          <section className="section">
            <SectionHead
              title="Courses you teach"
              action={<Link to="/teacher/courses" className="section-link">View all<IconArrowRight /></Link>}
            />
            {courses.isLoading ? (
              <Skeleton h={100} className="sk-block" />
            ) : !courses.data?.length ? (
              <EmptyState
                row bare
                title="No courses assigned"
                description="An administrator needs to assign you a course before you can run a session."
              />
            ) : (
              <SimpleTable
                bare
                rows={courses.data.slice(0, 6)}
                getRowId={(c) => c.id}
                onRowClick={(c) => navigate(`/teacher/courses/${c.id}`)}
                columns={[
                  { key: 'code', header: 'Code', width: 96, cell: (c) => <span className="cell-data">{c.code}</span> },
                  { key: 'name', header: 'Course', cell: (c) => <span className="cell-primary">{c.name}</span> },
                  { key: 'students', header: 'Students', width: 96, align: 'right', cell: (c) => c._count?.enrollments ?? 0 },
                  { key: 'sessions', header: 'Sessions', width: 96, align: 'right', cell: (c) => c._count?.sessions ?? 0 },
                  { key: 'att', header: 'Joins', width: 140, secondary: true, cell: (c) => {
                    const row = analytics.data?.attendanceByCourse.find((x) => x.course === c.code);
                    const max = Math.max(1, ...(analytics.data?.attendanceByCourse.map((x) => x.students) ?? [1]));
                    return row ? (
                      <span className="cell-progress">
                        <Progress value={(row.students / max) * 100} tone="foundation" label={`${c.code} joins`} />
                        <span className="t-num">{row.students}</span>
                      </span>
                    ) : <span className="cell-muted">—</span>;
                  } },
                ]}
              />
            )}
          </section>
        </div>

        <div>
          <section>
            <SectionHead title="Recent sessions" />
            {sessions.isLoading ? (
              <Skeleton h={60} className="sk-block" />
            ) : !recent.length ? (
              <EmptyState row bare title="No finished sessions" description="Sessions appear here once you close them." />
            ) : (
              <ul className="feed-list">
                {recent.map((s) => (
                  <li key={s.id} className="feed-row">
                    <span className="feed-row-icon"><IconClock size={14} /></span>
                    <span className="feed-row-main">
                      <span className="feed-row-title t-clamp-1">{s.title ?? s.course?.name}</span>
                      <span className="feed-row-meta">
                        {formatDayDate(s.startedAt ?? s.createdAt)} · {s._count?.attendance ?? 0} attended · {s._count?.questions ?? 0} questions
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="section">
            <SectionHead title="Prepare" />
            <ul className="link-list">
              <li><Link to="/teacher/studio"><span className="feed-row-icon tone-accent"><IconSparkle size={14} /></span><span className="grow">Draft questions in the quiz studio</span><IconArrowRight size={14} /></Link></li>
              <li><Link to="/teacher/paper"><span className="feed-row-icon"><IconFile size={14} /></span><span className="grow">Generate an exam paper</span><IconArrowRight size={14} /></Link></li>
              <li><Link to="/teacher/assignments"><span className="feed-row-icon"><IconClipboard size={14} /></span><span className="grow">Post an assignment</span><IconArrowRight size={14} /></Link></li>
              <li><Link to="/teacher/gradebook"><span className="feed-row-icon"><IconAward2 size={14} /></span><span className="grow">Open the gradebook</span><IconArrowRight size={14} /></Link></li>
            </ul>
          </section>
        </div>
      </div>
    </>
  );
}
