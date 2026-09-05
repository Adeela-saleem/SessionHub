import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import type { StudentAnalytics } from '../../lib/types';
import {
  EmptyState, ErrorState, LinkButton, PageHeader, Progress, SectionHead, SimpleTable,
  Skeleton, Stat, StatGrid,
} from '../../components/ui';
import { IconAward2, IconMessage, IconTarget, IconUserCheck } from '../../components/icons';
import { ChartFrame, Donut, donutLegend, EmptyChart, TrendArea, legendFor } from '../../components/charts';

/* ============================================================
   Analytics — the student's own record.
   Three questions, in order: how am I doing overall, is it
   improving, and which course is dragging.
   ============================================================ */
const BREAKDOWN_COLORS = ['var(--success)', 'var(--danger)', 'var(--chart-5)'];

export default function StudentProgress() {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['analytics', 'me'],
    queryFn: () => api.get<StudentAnalytics>('/analytics/me'),
  });

  if (isLoading) {
    return (
      <>
        <PageHeader title="Analytics" />
        <Skeleton h={72} className="sk-block" style={{ marginBottom: 'var(--s-7)' }} />
        <div className="split"><Skeleton h={260} className="sk-block" /><Skeleton h={260} className="sk-block" /></div>
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
        <EmptyState
          row bare
          title="No progress recorded yet"
          description="Join a live session and answer a question — your accuracy, attendance and marks start building from there."
          action={<LinkButton to="/student/live" size="sm">Join a session</LinkButton>}
        />
      </>
    );
  }

  const k = data.kpis;
  const trendSeries = [{ key: 'accuracy', name: 'Accuracy' }];
  const total = data.answerBreakdown.reduce((n, d) => n + d.value, 0);

  return (
    <>
      <PageHeader
        title="Analytics"
        lede="Your accuracy, attendance and marks across every course you are enrolled in."
      />

      <StatGrid>
        <Stat icon={<IconTarget size={16} />} tone="success" label="Answer accuracy" value={`${k.accuracy}%`} foot={`${k.questionsAnswered} answered`} />
        <Stat icon={<IconUserCheck size={16} />} tone="info" label="Attendance rate" value={`${k.attendanceRate}%`} foot={`${k.sessionsAttended} sessions`} />
        <Stat icon={<IconAward2 size={16} />} tone="accent" label="Marks earned" value={k.marksEarned} foot="All sessions" />
        <Stat icon={<IconMessage size={16} />} tone="neutral" label="Questions answered" value={k.questionsAnswered} foot="Since you joined" />
      </StatGrid>

      <div className="split section">
        <section>
          <SectionHead title="Accuracy over time" sub="Per session attended" />
          <ChartFrame height={220} legend={legendFor(trendSeries)}>
            {data.scoreTrend.length
              ? <TrendArea data={data.scoreTrend} x="date" unit="%" series={trendSeries} />
              : <EmptyChart label="Answer questions in a few sessions to build a trend" />}
          </ChartFrame>
        </section>

        <section>
          <SectionHead title="Answer breakdown" sub={total ? `${total} submitted` : undefined} />
          <ChartFrame
            height={220}
            legend={data.answerBreakdown.length ? donutLegend(data.answerBreakdown, BREAKDOWN_COLORS) : undefined}
          >
            {data.answerBreakdown.length
              ? <Donut data={data.answerBreakdown} colors={BREAKDOWN_COLORS} />
              : <EmptyChart label="Nothing submitted yet" />}
          </ChartFrame>
        </section>
      </div>

      <section className="section">
        <SectionHead title="Attendance by course" sub="Sessions attended out of sessions held" />
        {data.perCourse.length ? (
          <SimpleTable
            bare
            className="tbl-wide"
            rows={data.perCourse}
            getRowId={(c) => c.course}
            caption="Attendance by course"
            columns={[
              { key: 'code', header: 'Code', width: 96, cell: (c) => <span className="cell-data">{c.course}</span> },
              { key: 'name', header: 'Course', cell: (c) => <span className="cell-primary">{c.name}</span> },
              { key: 'sessions', header: 'Attended', width: 110, align: 'right', cell: (c) => <span className="t-num">{c.attended} of {c.total}</span> },
              { key: 'rate', header: 'Rate', width: 190, cell: (c) => (
                <span className="cell-progress">
                  <Progress value={c.rate} tone={c.rate >= 75 ? 'success' : c.rate >= 45 ? 'warning' : 'danger'} label={`${c.course} attendance`} />
                  <span className="t-num">{c.rate}%</span>
                </span>
              ) },
            ]}
          />
        ) : (
          <EmptyState
            row bare
            title="Not enrolled anywhere yet"
            description="Once you are enrolled in a course, your attendance in it appears here."
          />
        )}
      </section>
    </>
  );
}
