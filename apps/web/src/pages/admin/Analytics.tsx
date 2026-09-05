import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import type { AdminAnalytics } from '../../lib/types';
import {
  EmptyState, ErrorState, PageHeader, SectionHead, SimpleTable, Skeleton, Stat, StatGrid,
} from '../../components/ui';
import { Bars, ChartFrame, Donut, EmptyChart, TrendArea, donutLegend, legendFor } from '../../components/charts';
import { IconBroadcast, IconGrad, IconPie, IconUserCheck, IconUsers } from '../../components/icons';

/* ============================================================
   Institution analytics
   Four questions, each answered once: is the platform being
   used, is it growing, who is on it, and how is it spread
   across departments. A KPI row summarises the fortnight; the
   departments table gives the exact figures beneath the bars.
   ============================================================ */
export default function AdminAnalyticsPage() {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['analytics', 'admin'],
    queryFn: () => api.get<AdminAnalytics>('/analytics/admin'),
  });

  if (isLoading) {
    // Mirrors the loaded layout so nothing jumps when data lands.
    return (
      <>
        <PageHeader title="Analytics" lede="Last 14 days" />
        <Skeleton h={72} className="sk-block" />
        <div className="section"><Skeleton h={260} className="sk-block" /></div>
        <div className="split-even split section">
          <Skeleton h={260} className="sk-block" />
          <Skeleton h={260} className="sk-block" />
        </div>
      </>
    );
  }
  if (isError) {
    return (
      <>
        <PageHeader title="Analytics" />
        <ErrorState onRetry={() => void refetch()} />
      </>
    );
  }
  if (!data) {
    return (
      <>
        <PageHeader title="Analytics" />
        <EmptyState icon={<IconPie size={18} />} title="No data yet" description="Analytics appear once accounts and sessions exist on the platform." />
      </>
    );
  }

  const sessionSeries = [{ key: 'sessions', name: 'Sessions' }, { key: 'attendance', name: 'Joins' }];
  const signupSeries = [{ key: 'students', name: 'Students' }, { key: 'teachers', name: 'Teachers' }];
  const deptSeries = [
    { key: 'students', name: 'Students' },
    { key: 'teachers', name: 'Teachers' },
    { key: 'courses', name: 'Courses' },
  ];

  const sum = (rows: Record<string, number>[], key: string) => rows.reduce((n, r) => n + (r[key] ?? 0), 0);
  const sessions14 = sum(data.sessionTrend as unknown as Record<string, number>[], 'sessions');
  const joins14 = sum(data.sessionTrend as unknown as Record<string, number>[], 'attendance');
  const students14 = sum(data.signupTrend as unknown as Record<string, number>[], 'students');
  const teachers14 = sum(data.signupTrend as unknown as Record<string, number>[], 'teachers');
  const accounts = data.roleSplit.reduce((n, r) => n + r.value, 0);

  return (
    <>
      <PageHeader
        title="Analytics"
        lede="Growth, activity and departmental spread across the last fourteen days."
      />

      <StatGrid>
        <Stat icon={<IconBroadcast size={16} />} tone="neutral" label="Sessions" value={sessions14} foot="Started, last 14 days" />
        <Stat icon={<IconUserCheck size={16} />} tone="info" label="Joins" value={joins14} foot={sessions14 ? `${Math.round(joins14 / sessions14 * 10) / 10} per session` : 'Last 14 days'} />
        <Stat icon={<IconGrad size={16} />} tone="success" label="New students" value={students14} foot="Signed up, last 14 days" />
        <Stat icon={<IconUserCheck size={16} />} tone="accent" label="New teachers" value={teachers14} foot="Signed up, last 14 days" />
        <Stat icon={<IconUsers size={16} />} tone="info" label="Accounts" value={accounts} foot="On the platform" />
      </StatGrid>

      <section className="section">
        <SectionHead title="Sessions and attendance" sub="Sessions started and total joins per day" />
        <ChartFrame height={240} legend={legendFor(sessionSeries)}>
          {data.sessionTrend.some((d) => d.sessions || d.attendance)
            ? <TrendArea data={data.sessionTrend} x="date" series={sessionSeries} />
            : <EmptyChart label="No sessions in the last 14 days" />}
        </ChartFrame>
      </section>

      <div className="split split-even section">
        <section>
          <SectionHead title="New accounts" sub="Signups per day, by role" />
          <ChartFrame height={220} legend={legendFor(signupSeries)}>
            {data.signupTrend.some((d) => d.students || d.teachers)
              ? <TrendArea data={data.signupTrend} x="date" series={signupSeries} />
              : <EmptyChart label="No signups in the last 14 days" />}
          </ChartFrame>
        </section>

        <section>
          <SectionHead title="Who is on the platform" sub="Accounts by role" />
          <ChartFrame height={220} legend={donutLegend(data.roleSplit)}>
            {data.roleSplit.length
              ? <Donut data={data.roleSplit} />
              : <EmptyChart label="No accounts yet" />}
          </ChartFrame>
        </section>
      </div>

      <section className="section">
        <SectionHead title="Departments" sub="Students, teachers and courses per department" />
        {data.departments.length ? (
          <div className="split section-tight" style={{ marginTop: 0 }}>
            <ChartFrame height={Math.max(160, 40 * data.departments.length + 40)} legend={legendFor(deptSeries)}>
              <Bars data={data.departments} x="department" horizontal series={deptSeries} />
            </ChartFrame>
            <SimpleTable
              bare
              rows={data.departments}
              getRowId={(d) => d.department}
              columns={[
                { key: 'dept', header: 'Department', cell: (d) => <span className="cell-primary">{d.department}</span> },
                { key: 'students', header: 'Students', width: 90, align: 'right', cell: (d) => d.students },
                { key: 'teachers', header: 'Teachers', width: 90, align: 'right', cell: (d) => d.teachers },
                { key: 'courses', header: 'Courses', width: 90, align: 'right', cell: (d) => d.courses },
              ]}
            />
          </div>
        ) : (
          <EmptyState row bare title="No departments recorded" description="Departments appear once accounts or courses carry one." />
        )}
      </section>
    </>
  );
}
