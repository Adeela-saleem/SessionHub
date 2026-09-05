import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import type { AdminAnalytics, Course, PlatformStats, User } from '../../lib/types';
import {
  Avatar, Badge, Banner, Card, CardBody, CardHead, EmptyState, LinkButton,
  PageHeader, PanelRow, Skeleton, Stat, StatGrid,
} from '../../components/ui';
import { ChartCard, EmptyChart, TrendArea, legendFor } from '../../components/charts';
import {
  IconArrowRight, IconBook, IconCheckCircle, IconChevronRight, IconUserCheck,
} from '../../components/icons';
import { greeting, relativeTime } from '../../lib/format';

/* ============================================================
   Admin dashboard
   Operational, not celebratory: what is blocked on an approval,
   what the platform is doing today, and where growth is coming
   from.
   ============================================================ */
export default function AdminDashboard() {
  const { user } = useAuth();

  const stats = useQuery({ queryKey: ['stats'], queryFn: () => api.get<PlatformStats>('/users/stats') });
  const pending = useQuery({
    queryKey: ['users', 'pending'],
    queryFn: () => api.get<User[]>('/users?role=TEACHER&status=PENDING'),
  });
  const courses = useQuery({ queryKey: ['courses'], queryFn: () => api.get<Course[]>('/courses') });
  const analytics = useQuery({
    queryKey: ['analytics', 'admin'],
    queryFn: () => api.get<AdminAnalytics>('/analytics/admin'),
  });

  const s = stats.data;
  const unassigned = courses.data?.filter((c) => !c.teacher) ?? [];
  const sessionSeries = [{ key: 'sessions', name: 'Sessions' }, { key: 'attendance', name: 'Joins' }];

  return (
    <>
      <PageHeader
        eyebrow={new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}
        title={`${greeting()}, ${user?.name?.split(' ')[0] ?? 'there'}`}
        lede="Platform activity, pending approvals and anything that needs an administrator."
        actions={<LinkButton to="/admin/users">Manage people</LinkButton>}
      />

      {/* ── Blocking work first ─────────────────────────── */}
      {s?.pending ? (
        <Banner
          tone="warning"
          title={`${s.pending} teaching ${s.pending === 1 ? 'account is' : 'accounts are'} waiting for approval`}
          action={<LinkButton to="/admin/approvals" size="sm" variant="secondary">Review<IconArrowRight size={14} /></LinkButton>}
        >
          Teachers cannot sign in or run a session until an administrator approves them.
        </Banner>
      ) : unassigned.length ? (
        <Banner
          tone="info"
          title={`${unassigned.length} ${unassigned.length === 1 ? 'course has' : 'courses have'} no teacher assigned`}
          action={<LinkButton to="/admin/courses" size="sm" variant="secondary">Assign<IconArrowRight size={14} /></LinkButton>}
        >
          {unassigned.slice(0, 3).map((c) => c.code).join(', ')}{unassigned.length > 3 ? ` and ${unassigned.length - 3} more` : ''} cannot run sessions yet.
        </Banner>
      ) : (
        <Banner tone="success" title="Nothing needs your attention">
          Every teaching account is reviewed and every course has a teacher.
        </Banner>
      )}

      <div className="section">
        {stats.isLoading ? (
          <Card><CardBody><Skeleton h={72} className="sk-block" /></CardBody></Card>
        ) : (
          <StatGrid>
            <Stat label="Students" value={s?.students ?? '—'} foot="Registered accounts" />
            <Stat label="Teachers" value={s?.teachers ?? '—'} foot="Approved to teach" />
            <Stat label="Courses" value={s?.courses ?? '—'} foot={`${unassigned.length} without a teacher`} />
            <Stat label="Live now" value={s?.liveSessions ?? '—'} foot="Sessions in progress" />
          </StatGrid>
        )}
      </div>

      <div className="split section">
        <ChartCard
          title="Platform activity"
          sub="Sessions started and total joins, last 14 days"
          height={280}
          legend={legendFor(sessionSeries)}
        >
          {analytics.data?.sessionTrend.some((d) => d.sessions || d.attendance)
            ? <TrendArea data={analytics.data.sessionTrend} x="date" series={sessionSeries} />
            : <EmptyChart label="No sessions in the last 14 days" />}
        </ChartCard>

        <div className="stack">
          <Card>
            <CardHead
              title="Awaiting approval"
              sub="Teaching accounts that cannot sign in yet"
              action={<Link to="/admin/approvals" className="section-link">All<IconChevronRight size={13} /></Link>}
            />
            {pending.isLoading ? (
              <CardBody><Skeleton h={60} className="sk-block" /></CardBody>
            ) : !pending.data?.length ? (
              <EmptyState
                tight
                icon={<IconCheckCircle size={20} />}
                title="Nothing waiting"
                description="Every teaching account has been reviewed."
              />
            ) : (
              <div>
                {pending.data.slice(0, 4).map((u) => (
                  <PanelRow key={u.id} to="/admin/approvals">
                    <Avatar name={u.name} size="sm" />
                    <div className="grow" style={{ minWidth: 0 }}>
                      <div className="record-title t-clamp-1">{u.name}</div>
                      <div className="record-meta t-clamp-1">{u.email}</div>
                    </div>
                    <span className="t-caption t-muted hide-sm">{relativeTime(u.createdAt)}</span>
                    <Badge tone="warning">Pending</Badge>
                  </PanelRow>
                ))}
              </div>
            )}
          </Card>

          <Card>
            <CardHead
              title="Courses"
              sub="Largest by enrolment"
              action={<Link to="/admin/courses" className="section-link">All<IconChevronRight size={13} /></Link>}
            />
            {courses.isLoading ? (
              <CardBody><Skeleton h={60} className="sk-block" /></CardBody>
            ) : !courses.data?.length ? (
              <EmptyState
                tight
                icon={<IconBook size={20} />}
                title="No courses yet"
                description="Create the first course to let teachers run sessions."
                action={<LinkButton to="/admin/courses" size="sm">Create a course</LinkButton>}
              />
            ) : (
              <div>
                {[...courses.data]
                  .sort((a, b) => (b._count?.enrollments ?? 0) - (a._count?.enrollments ?? 0))
                  .slice(0, 4)
                  .map((c) => (
                    <PanelRow key={c.id} to={`/admin/courses/${c.id}`}>
                      <div className="grow" style={{ minWidth: 0 }}>
                        <div className="record-title t-clamp-1">{c.name}</div>
                        <div className="record-meta">{c.code} · {c.teacher?.name ?? 'No teacher assigned'}</div>
                      </div>
                      <span className="t-sm t-num t-muted">{c._count?.enrollments ?? 0}</span>
                    </PanelRow>
                  ))}
              </div>
            )}
          </Card>

          {!!s?.pending && (
            <Card>
              <CardBody>
                <div className="row-tight" style={{ marginBottom: 'var(--s-3)' }}>
                  <IconUserCheck size={16} />
                  <strong className="t-sm">Approve in bulk</strong>
                </div>
                <p className="t-sm t-secondary" style={{ marginBottom: 'var(--s-4)' }}>
                  Select several accounts at once on the approvals screen rather than working through them one by one.
                </p>
                <LinkButton to="/admin/approvals" variant="secondary" size="sm">Go to approvals</LinkButton>
              </CardBody>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
