import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import type { ClassSession, Course, StudentAnalytics } from '../../lib/types';
import { useLiveSession } from '../../features/session/LiveSessionContext';
import {
  Badge, Banner, Card, CardBody, CardHead, EmptyState, LinkButton,
  Meter, PageHeader, PanelRow, Progress, Skeleton, Stat, StatGrid,
} from '../../components/ui';
import {
  IconArrowRight, IconBook, IconBroadcast, IconChart, IconChevronRight, IconClock, IconTarget,
} from '../../components/icons';
import { greeting, relativeTime } from '../../lib/format';

/* ============================================================
   Student dashboard
   Answers, in order: is something happening right now, what am
   I enrolled in, and how am I actually doing.
   ============================================================ */
export default function StudentDashboard() {
  const { user } = useAuth();
  const { session } = useLiveSession();

  const courses = useQuery({ queryKey: ['courses'], queryFn: () => api.get<Course[]>('/courses') });
  const sessions = useQuery({
    queryKey: ['sessions'],
    queryFn: () => api.get<ClassSession[]>('/sessions'),
    refetchInterval: 60_000,
  });
  const analytics = useQuery({
    queryKey: ['analytics', 'me'],
    queryFn: () => api.get<StudentAnalytics>('/analytics/me'),
  });

  const live = sessions.data?.filter((s) => s.status === 'LIVE') ?? [];
  const recent = sessions.data?.filter((s) => s.status !== 'LIVE').slice(0, 5) ?? [];
  const k = analytics.data?.kpis;
  const firstName = user?.name?.split(' ')[0] ?? 'there';

  return (
    <>
      <PageHeader
        eyebrow={new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}
        title={`${greeting()}, ${firstName}`}
        lede="Everything happening across your courses, and where your marks stand."
        actions={
          <LinkButton to="/student/live">
            <IconBroadcast size={16} />{session ? 'Return to session' : 'Join a session'}
          </LinkButton>
        }
      />

      {/* ── What needs attention right now ───────────────── */}
      {session ? (
        <Banner
          tone="success"
          title="You are in a live session"
          action={<LinkButton to="/student/live" size="sm" variant="secondary">Open<IconArrowRight size={14} /></LinkButton>}
        >
          {session.course?.name ?? session.title ?? 'Session'} · room {session.roomCode}
        </Banner>
      ) : live.length > 0 ? (
        <Banner
          tone="warning"
          title={live.length === 1 ? 'A class is live right now' : `${live.length} classes are live right now`}
          action={<LinkButton to="/student/live" size="sm" variant="secondary">Join<IconArrowRight size={14} /></LinkButton>}
        >
          {live.map((s) => s.course?.name ?? s.title).filter(Boolean).join(' · ')} — ask your teacher for the room code.
        </Banner>
      ) : null}

      {/* ── Standing ─────────────────────────────────────── */}
      <div className="section">
        {analytics.isLoading ? (
          <Card><div className="card-body"><Skeleton h={72} className="sk-block" /></div></Card>
        ) : (
          <StatGrid>
            <Stat
              label="Answer accuracy"
              value={k ? `${k.accuracy}%` : '—'}
              foot={k ? `${k.questionsAnswered} questions answered` : 'No answers yet'}
            />
            <Stat
              label="Attendance"
              value={k ? `${k.attendanceRate}%` : '—'}
              foot={k ? `${k.sessionsAttended} sessions attended` : 'No sessions yet'}
            />
            <Stat label="Marks earned" value={k?.marksEarned ?? '—'} foot="Across all courses" />
            <Stat label="Courses" value={courses.data?.length ?? '—'} foot="Currently enrolled" />
          </StatGrid>
        )}
      </div>

      <div className="split section">
        {/* ── Courses ───────────────────────────────────── */}
        <Card>
          <CardHead
            title="Your courses"
            sub="Attendance rate in each course you are enrolled in"
            action={<Link to="/student/courses" className="section-link">View all<IconChevronRight size={13} /></Link>}
          />
          <CardBody>
            {courses.isLoading ? (
              <>
                <Skeleton className="sk-line" h={38} />
                <Skeleton className="sk-line" h={38} />
                <Skeleton className="sk-line" h={38} />
              </>
            ) : !courses.data?.length ? (
              <EmptyState
                tight
                icon={<IconBook size={20} />}
                title="No courses yet"
                description="Your courses appear here once an administrator enrols you. Ask them to add you, or check back after registration closes."
              />
            ) : (
              analytics.data?.perCourse.length ? (
                analytics.data.perCourse.map((c) => (
                  <Meter key={c.course} label={c.course} sub={c.name} value={c.rate} />
                ))
              ) : (
                courses.data.slice(0, 5).map((c) => (
                  <Meter key={c.id} label={c.code} sub={c.name} value={0} tone="foundation" />
                ))
              )
            )}
          </CardBody>
        </Card>

        {/* ── Recent activity ───────────────────────────── */}
        <div className="stack">
          <Card>
            <CardHead title="Recent sessions" sub="The last classes across your courses" />
            {sessions.isLoading ? (
              <div className="card-body"><Skeleton h={60} className="sk-block" /></div>
            ) : !recent.length ? (
              <EmptyState
                tight
                icon={<IconClock size={20} />}
                title="Nothing yet"
                description="Sessions you attend will be listed here."
              />
            ) : (
              <div>
                {recent.map((s) => (
                  <PanelRow key={s.id}>
                    <div className="grow" style={{ minWidth: 0 }}>
                      <div className="record-title t-clamp-1">{s.course?.name ?? s.title ?? 'Session'}</div>
                      <div className="record-meta">
                        {s.course?.code} · {s._count?.questions ?? 0} questions
                      </div>
                    </div>
                    <Badge tone={s.status === 'CLOSED' ? 'neutral' : 'info'}>
                      {s.status === 'CLOSED' ? 'Finished' : 'Scheduled'}
                    </Badge>
                  </PanelRow>
                ))}
              </div>
            )}
          </Card>

          <Card>
            <CardHead title="Where to focus" sub="Based on your answer history" />
            <CardBody>
              {!k || k.questionsAnswered === 0 ? (
                <EmptyState
                  tight
                  icon={<IconTarget size={20} />}
                  title="Not enough data yet"
                  description="Answer a few questions in a live session and we will show you which courses need attention."
                  action={<LinkButton to="/student/live" size="sm" variant="secondary">Join a session</LinkButton>}
                />
              ) : (
                <div className="col">
                  <div>
                    <div className="row-between" style={{ marginBottom: 'var(--s-2)' }}>
                      <span className="t-sm">Accuracy against a 70% target</span>
                      <span className="t-xs t-num t-muted">{k.accuracy}% / 70%</span>
                    </div>
                    <Progress value={(k.accuracy / 70) * 100} tone={k.accuracy >= 70 ? 'success' : 'warning'} />
                  </div>
                  <p className="t-sm t-secondary">
                    {k.accuracy >= 70
                      ? 'You are comfortably above target. Keep attending — attendance is the larger part of your record.'
                      : `You are ${70 - k.accuracy} points below target. Reviewing the explanations shown after each question is the fastest way to close that.`}
                  </p>
                  <LinkButton to="/student/progress" variant="secondary" size="sm" style={{ alignSelf: 'flex-start' }}>
                    <IconChart size={14} />See full breakdown
                  </LinkButton>
                </div>
              )}
            </CardBody>
          </Card>
        </div>
      </div>

      {recent.length > 0 && (
        <p className="t-caption t-muted" style={{ marginTop: 'var(--s-6)' }}>
          Last updated {relativeTime(new Date())}
        </p>
      )}
    </>
  );
}
