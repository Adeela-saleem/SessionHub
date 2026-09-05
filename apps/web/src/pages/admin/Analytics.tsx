import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import type { AdminAnalytics } from '../../lib/types';
import { Card, ErrorState, EmptyState, PageHeader, Skeleton } from '../../components/ui';
import { Bars, ChartCard, Donut, EmptyChart, TrendArea, legendFor } from '../../components/charts';
import { IconPie } from '../../components/icons';

/* ============================================================
   Institution analytics
   Four charts, each answering one governance question: is the
   platform being used, is it growing, who is on it, and how is
   it distributed across departments.
   ============================================================ */
export default function AdminAnalyticsPage() {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['analytics', 'admin'],
    queryFn: () => api.get<AdminAnalytics>('/analytics/admin'),
  });

  if (isLoading) {
    return (
      <>
        <PageHeader eyebrow="Insight" title="Institution analytics" />
        <div className="split">
          <Skeleton h={320} className="sk-block" />
          <Skeleton h={320} className="sk-block" />
        </div>
      </>
    );
  }
  if (isError) {
    return (
      <>
        <PageHeader eyebrow="Insight" title="Institution analytics" />
        <Card><ErrorState onRetry={() => void refetch()} /></Card>
      </>
    );
  }
  if (!data) {
    return (
      <>
        <PageHeader eyebrow="Insight" title="Institution analytics" />
        <Card>
          <EmptyState icon={<IconPie size={20} />} title="No data yet" description="Analytics appear once accounts and sessions exist on the platform." />
        </Card>
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

  return (
    <>
      <PageHeader
        eyebrow="Insight"
        title="Institution analytics"
        lede="Growth, activity and departmental spread across the last fourteen days."
      />

      <ChartCard
        title="Sessions and attendance"
        sub="Sessions started and total joins per day"
        height={300}
        legend={legendFor(sessionSeries)}
      >
        {data.sessionTrend.some((d) => d.sessions || d.attendance)
          ? <TrendArea data={data.sessionTrend} x="date" series={sessionSeries} />
          : <EmptyChart label="No sessions in the last 14 days" />}
      </ChartCard>

      <div className="split section">
        <ChartCard
          title="New accounts"
          sub="Signups per day, by role"
          legend={legendFor(signupSeries)}
        >
          {data.signupTrend.some((d) => d.students || d.teachers)
            ? <TrendArea data={data.signupTrend} x="date" series={signupSeries} />
            : <EmptyChart label="No signups in the last 14 days" />}
        </ChartCard>

        <ChartCard
          title="Who is on the platform"
          sub="Accounts by role"
          legend={data.roleSplit.map((r, i) => ({ name: r.name, color: `var(--chart-${i + 1})` }))}
        >
          {data.roleSplit.length
            ? <Donut data={data.roleSplit} />
            : <EmptyChart label="No accounts yet" />}
        </ChartCard>
      </div>

      <div className="section">
        <ChartCard
          title="Departments"
          sub="Students, teachers and courses per department"
          height={320}
          legend={legendFor(deptSeries)}
        >
          {data.departments.length
            ? <Bars data={data.departments} x="department" horizontal series={deptSeries} />
            : <EmptyChart label="No departments recorded" />}
        </ChartCard>
      </div>
    </>
  );
}
