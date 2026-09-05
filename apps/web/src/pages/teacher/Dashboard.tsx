import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import type { ClassSession, Course, TeacherAnalytics } from '../../lib/types';
import { useLiveSession } from '../../features/session/LiveSessionContext';
import {
  Badge, Banner, Card, CardBody, CardHead, EmptyState, LinkButton, Meter,
  PageHeader, PanelRow, Skeleton, Stat, StatGrid,
} from '../../components/ui';
import {
  IconArrowRight, IconBook, IconBroadcast, IconChevronRight, IconClock, IconSparkle, IconTarget,
} from '../../components/icons';
import { greeting } from '../../lib/format';

/* ============================================================
   Teacher dashboard
   Built around the next action: is a session running, what am
   I teaching today, and which question did the room fail.
   ============================================================ */
export default function TeacherDashboard() {
  const { user } = useAuth();
  const { session } = useLiveSession();

  const courses = useQuery({ queryKey: ['courses'], queryFn: () => api.get<Course[]>('/courses') });
  const sessions = useQuery({
    queryKey: ['sessions'],
    queryFn: () => api.get<ClassSession[]>('/sessions'),
    refetchInterval: 60_000,
  });
  const analytics = useQuery({
    queryKey: ['analytics', 'teacher'],
    queryFn: () => api.get<TeacherAnalytics>('/analytics/teacher'),
  });

  const k = analytics.data?.kpis;
  const liveElsewhere = sessions.data?.filter((s) => s.status === 'LIVE' && s.id !== session?.id) ?? [];
  const recent = sessions.data?.filter((s) => s.status === 'CLOSED').slice(0, 5) ?? [];
  const weakest = [...(analytics.data?.questionDifficulty ?? [])]
    .filter((q) => q.answers > 0)
    .sort((a, b) => a.correctPct - b.correctPct)
    .slice(0, 4);
  const firstName = user?.name?.split(' ')[0] ?? 'there';

  return (
    <>
      <PageHeader
        eyebrow={new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}
        title={`${greeting()}, ${firstName}`}
        lede="Your classes, the questions that need re-teaching, and everything waiting on you."
        actions={
          <LinkButton to="/teacher/live">
            <IconBroadcast size={16} />{session ? 'Return to live control' : 'Start a session'}
          </LinkButton>
        }
      />

      {session ? (
        <Banner
          tone="success"
          title="Your session is live"
          action={<LinkButton to="/teacher/live" size="sm" variant="secondary">Open control<IconArrowRight size={14} /></LinkButton>}
        >
          {session.course?.name ?? session.title} · room {session.roomCode}
        </Banner>
      ) : liveElsewhere.length > 0 ? (
        <Banner
          tone="warning"
          title="A session of yours is still open"
          action={<LinkButton to="/teacher/live" size="sm" variant="secondary">Resume<IconArrowRight size={14} /></LinkButton>}
        >
          {liveElsewhere[0]!.course?.name ?? liveElsewhere[0]!.title} has been live since you last used it. Close it when the class ends so attendance is final.
        </Banner>
      ) : null}

      <div className="section">
        {analytics.isLoading ? (
          <Card><CardBody><Skeleton h={72} className="sk-block" /></CardBody></Card>
        ) : (
          <StatGrid>
            <Stat label="Sessions run" value={k?.sessionsRun ?? '—'} foot={k?.liveNow ? `${k.liveNow} live now` : 'None live'} />
            <Stat label="Questions asked" value={k?.questionsAsked ?? '—'} foot="Across all sessions" />
            <Stat label="Answers received" value={k?.totalAnswers ?? '—'} foot="From your students" />
            <Stat label="Average accuracy" value={k ? `${k.avgAccuracy}%` : '—'} foot={k && k.avgAccuracy < 50 ? 'Below the 50% line' : 'Across every question'} />
          </StatGrid>
        )}
      </div>

      <div className="split section">
        <Card>
          <CardHead
            title="Courses you teach"
            sub="Start a session directly from a course"
            action={<Link to="/teacher/courses" className="section-link">View all<IconChevronRight size={13} /></Link>}
          />
          {courses.isLoading ? (
            <CardBody><Skeleton h={100} className="sk-block" /></CardBody>
          ) : !courses.data?.length ? (
            <EmptyState
              tight
              icon={<IconBook size={20} />}
              title="No courses assigned"
              description="An administrator needs to assign you a course before you can run a session. Ask them to add you as the teacher on a course."
            />
          ) : (
            <div>
              {courses.data.slice(0, 6).map((c) => (
                <PanelRow key={c.id} to={`/teacher/courses/${c.id}`}>
                  <div className="grow" style={{ minWidth: 0 }}>
                    <div className="record-title t-clamp-1">{c.name}</div>
                    <div className="record-meta">
                      {c.code} · {c._count?.enrollments ?? 0} students · {c._count?.sessions ?? 0} sessions
                    </div>
                  </div>
                  <IconChevronRight size={16} className="t-muted" />
                </PanelRow>
              ))}
            </div>
          )}
        </Card>

        <div className="stack">
          <Card>
            <CardHead title="Needs re-teaching" sub="Questions the room answered worst" />
            <CardBody>
              {analytics.isLoading ? (
                <Skeleton h={80} className="sk-block" />
              ) : !weakest.length ? (
                <EmptyState
                  tight
                  icon={<IconTarget size={20} />}
                  title="Nothing flagged"
                  description="Once students answer questions, the ones they struggled with are surfaced here."
                />
              ) : (
                weakest.map((q) => (
                  <Meter
                    key={q.label}
                    label={q.label}
                    sub={q.prompt.length > 46 ? `${q.prompt.slice(0, 46)}…` : q.prompt}
                    value={q.correctPct}
                  />
                ))
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHead title="Recent sessions" sub="Your last finished classes" />
            {sessions.isLoading ? (
              <CardBody><Skeleton h={60} className="sk-block" /></CardBody>
            ) : !recent.length ? (
              <EmptyState
                tight
                icon={<IconClock size={20} />}
                title="No finished sessions"
                description="Sessions appear here once you close them."
                action={<LinkButton to="/teacher/live" size="sm" variant="secondary">Start one</LinkButton>}
              />
            ) : (
              <div>
                {recent.map((s) => (
                  <PanelRow key={s.id}>
                    <div className="grow" style={{ minWidth: 0 }}>
                      <div className="record-title t-clamp-1">{s.course?.name ?? s.title}</div>
                      <div className="record-meta">
                        {s._count?.attendance ?? 0} attended · {s._count?.questions ?? 0} questions
                      </div>
                    </div>
                    <Badge tone="neutral">Finished</Badge>
                  </PanelRow>
                ))}
              </div>
            )}
          </Card>

          <Card>
            <CardHead title="Prepare ahead" plain />
            <CardBody>
              <p className="t-sm t-secondary" style={{ marginBottom: 'var(--s-4)' }}>
                Draft a question set before class so you can open questions without pausing the lecture.
              </p>
              <LinkButton to="/teacher/studio" variant="secondary" size="sm">
                <IconSparkle size={14} />Open quiz studio
              </LinkButton>
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}
