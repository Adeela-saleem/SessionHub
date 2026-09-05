import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../../lib/api';
import type { AdminAnalytics, AuditEntry, ClassSession, Course, Page, PlatformStats, User } from '../../lib/types';
import {
  Avatar, Badge, EmptyState, LinkButton, PageHeader, SectionHead, SimpleTable, Skeleton,
  Stat, StatGrid,
} from '../../components/ui';
import { ChartFrame, EmptyChart, TrendArea, legendFor } from '../../components/charts';
import { IconArrowRight, IconBook, IconBroadcast, IconGrad, IconShield, IconUserCheck, IconUsers } from '../../components/icons';
import { relativeTime } from '../../lib/format';

/* ============================================================
   Admin overview
   Operational: what is blocked on an approval, what is running,
   the activity trend, and the latest consequential actions.
   ============================================================ */
export default function AdminDashboard() {
  const navigate = useNavigate();
  const stats = useQuery({ queryKey: ['stats'], queryFn: () => api.get<PlatformStats>('/users/stats') });
  const pending = useQuery({
    queryKey: ['users', 'pending'],
    queryFn: () => api.get<User[]>('/users?role=TEACHER&status=PENDING'),
  });
  const courses = useQuery({ queryKey: ['courses'], queryFn: () => api.get<Course[]>('/courses') });
  const sessions = useQuery({
    queryKey: ['sessions'],
    queryFn: () => api.get<ClassSession[]>('/sessions'),
    refetchInterval: 60_000,
  });
  const analytics = useQuery({
    queryKey: ['analytics', 'admin'],
    queryFn: () => api.get<AdminAnalytics>('/analytics/admin'),
  });
  const audit = useQuery({
    queryKey: ['audit', 'recent'],
    queryFn: () => api.get<Page<AuditEntry>>('/audit?take=6'),
  });

  const s = stats.data;
  const unassigned = courses.data?.filter((c) => !c.teacher) ?? [];
  const liveNow = sessions.data?.filter((x) => x.status === 'LIVE') ?? [];
  const sessionSeries = [{ key: 'sessions', name: 'Sessions' }, { key: 'attendance', name: 'Joins' }];
  const blocking = (s?.pending ?? 0) + unassigned.length;

  return (
    <>
      <PageHeader
        title="Overview"
        lede={blocking
          ? `${blocking} ${blocking === 1 ? 'item needs' : 'items need'} an administrator.`
          : 'Nothing is waiting on an administrator.'}
        actions={<LinkButton to="/admin/users" size="lg" variant="secondary">Manage people</LinkButton>}
      />

      {s?.pending ? (
        <div className="now-strip is-warning">
          <span className="now-dot" aria-hidden="true" />
          <div className="grow">
            <span className="now-title">{s.pending} teaching {s.pending === 1 ? 'account is' : 'accounts are'} waiting for approval</span>
            <span className="now-meta">Teachers cannot sign in or run a session until an administrator approves them.</span>
          </div>
          <LinkButton to="/admin/approvals" size="sm">Review<IconArrowRight size={14} /></LinkButton>
        </div>
      ) : unassigned.length ? (
        <div className="now-strip is-info">
          <span className="now-dot" aria-hidden="true" />
          <div className="grow">
            <span className="now-title">{unassigned.length} {unassigned.length === 1 ? 'course has' : 'courses have'} no teacher</span>
            <span className="now-meta">
              {unassigned.slice(0, 3).map((c) => c.code).join(', ')}{unassigned.length > 3 ? ` and ${unassigned.length - 3} more` : ''} cannot run sessions yet.
            </span>
          </div>
          <LinkButton to="/admin/courses" size="sm" variant="secondary">Assign<IconArrowRight size={14} /></LinkButton>
        </div>
      ) : null}

      {stats.isLoading ? (
        <Skeleton h={72} className="sk-block" />
      ) : (
        <StatGrid>
          <Stat icon={<IconGrad size={16} />} tone="info" label="Students" value={s?.students ?? '—'} foot="Registered" />
          <Stat icon={<IconUsers size={16} />} tone="accent" label="Teachers" value={s?.teachers ?? '—'} foot="Approved" />
          <Stat icon={<IconUserCheck size={16} />} tone={s?.pending ? 'warning' : 'success'} label="Pending approval" value={s?.pending ?? '—'} foot={s?.pending ? 'Cannot sign in yet' : 'All reviewed'} />
          <Stat icon={<IconBook size={16} />} tone={unassigned.length ? 'warning' : 'neutral'} label="Courses" value={s?.courses ?? '—'} foot={unassigned.length ? `${unassigned.length} without a teacher` : 'All have a teacher'} />
          <Stat icon={<IconBroadcast size={16} />} tone={s?.liveSessions ? 'danger' : 'neutral'} label="Live now" value={s?.liveSessions ?? '—'} foot="Sessions in progress" />
        </StatGrid>
      )}

      <div className="split section">
        <div>
          <section>
            <SectionHead
              title="Awaiting approval"
              action={<Link to="/admin/approvals" className="section-link">All approvals<IconArrowRight /></Link>}
            />
            {pending.isLoading ? (
              <Skeleton h={60} className="sk-block" />
            ) : !pending.data?.length ? (
              <EmptyState row bare title="Nothing waiting" description="Every teaching account has been reviewed." />
            ) : (
              <SimpleTable
                bare
                rows={pending.data.slice(0, 5)}
                getRowId={(u) => u.id}
                onRowClick={() => navigate('/admin/approvals')}
                columns={[
                  { key: 'name', header: 'Name', cell: (u) => (
                    <span className="cell-user"><Avatar name={u.name} size="sm" /><span><span className="cell-primary">{u.name}</span><span className="cell-sub">{u.email}</span></span></span>
                  ) },
                  { key: 'dept', header: 'Department', width: 160, secondary: true, cell: (u) => u.department ?? <span className="cell-muted">Not set</span> },
                  { key: 'when', header: 'Requested', width: 120, cell: (u) => relativeTime(u.createdAt) },
                  { key: 'status', header: '', width: 90, align: 'right', cell: () => <Badge tone="warning">Pending</Badge> },
                ]}
              />
            )}
          </section>

          <section className="section">
            <SectionHead title="Platform activity" sub="Sessions started and joins, last 14 days" />
            <ChartFrame height={240} legend={legendFor(sessionSeries)}>
              {analytics.data?.sessionTrend.some((d) => d.sessions || d.attendance)
                ? <TrendArea data={analytics.data.sessionTrend} x="date" series={sessionSeries} />
                : <EmptyChart label="No sessions in the last 14 days" />}
            </ChartFrame>
          </section>

          <section className="section">
            <SectionHead
              title="Courses"
              sub="Largest by enrolment"
              action={<Link to="/admin/courses" className="section-link">All courses<IconArrowRight /></Link>}
            />
            {courses.isLoading ? (
              <Skeleton h={60} className="sk-block" />
            ) : !courses.data?.length ? (
              <EmptyState
                row bare
                title="No courses yet"
                description="Create the first course to let teachers run sessions."
                action={<LinkButton to="/admin/courses" size="sm">Create a course</LinkButton>}
              />
            ) : (
              <SimpleTable
                bare
                rows={[...courses.data].sort((a, b) => (b._count?.enrollments ?? 0) - (a._count?.enrollments ?? 0)).slice(0, 5)}
                getRowId={(c) => c.id}
                onRowClick={(c) => navigate(`/admin/courses/${c.id}`)}
                columns={[
                  { key: 'code', header: 'Code', width: 96, cell: (c) => <span className="cell-data">{c.code}</span> },
                  { key: 'name', header: 'Course', cell: (c) => <span className="cell-primary">{c.name}</span> },
                  { key: 'teacher', header: 'Teacher', width: 170, cell: (c) => c.teacher?.name ?? <Badge tone="warning">Unassigned</Badge> },
                  { key: 'students', header: 'Students', width: 90, align: 'right', cell: (c) => c._count?.enrollments ?? 0 },
                  { key: 'sessions', header: 'Sessions', width: 90, align: 'right', secondary: true, cell: (c) => c._count?.sessions ?? 0 },
                ]}
              />
            )}
          </section>
        </div>

        <div>
          <section>
            <SectionHead title="Live now" />
            {sessions.isLoading ? (
              <Skeleton h={60} className="sk-block" />
            ) : liveNow.length === 0 ? (
              <EmptyState row bare title="No sessions in progress" description="Live sessions appear here as teachers start them." />
            ) : (
              <ul className="feed-list">
                {liveNow.slice(0, 5).map((x) => (
                  <li key={x.id} className="feed-row">
                    <span className="feed-row-icon tone-danger"><IconBroadcast size={14} /></span>
                    <span className="feed-row-main">
                      <span className="feed-row-title t-clamp-1"><Badge tone="live">Live</Badge>{x.course?.name ?? x.title ?? 'Session'}</span>
                      <span className="feed-row-meta">Room <span className="t-data">{x.roomCode}</span> · {x._count?.attendance ?? 0} joined</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="section">
            <SectionHead
              title="Recent activity"
              action={<Link to="/admin/audit" className="section-link">Audit log<IconArrowRight /></Link>}
            />
            {audit.isLoading ? (
              <Skeleton h={120} className="sk-block" />
            ) : !audit.data?.items.length ? (
              <EmptyState row bare title="No activity recorded" description="Consequential actions are logged here." />
            ) : (
              <ul className="feed-list">
                {audit.data.items.map((e) => (
                  <li key={e.id} className="feed-row">
                    <span className="feed-row-icon"><IconShield size={14} /></span>
                    <span className="feed-row-main">
                      <span className="feed-row-title t-clamp-2" style={{ whiteSpace: 'normal' }}>{e.summary}</span>
                      <span className="feed-row-meta">{e.actor?.name ?? e.actorEmail} · {relativeTime(e.createdAt)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </>
  );
}
