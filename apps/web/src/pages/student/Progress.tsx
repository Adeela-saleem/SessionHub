import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import type { StudentAnalytics } from '../../lib/types';
import {
  Card, CardBody, CardHead, EmptyState, ErrorState, LinkButton, Meter,
  PageHeader, Skeleton, Stat, StatGrid,
} from '../../components/ui';
import { ChartCard, Donut, EmptyChart, TrendArea, legendFor } from '../../components/charts';
import { IconBook, IconChart } from '../../components/icons';

/* ============================================================
   My progress
   Three questions, in order: how am I doing overall, is it
   improving, and which course is dragging.
   ============================================================ */
export default function StudentProgress() {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['analytics', 'me'],
    queryFn: () => api.get<StudentAnalytics>('/analytics/me'),
  });

  if (isLoading) {
    return (
      <>
        <PageHeader eyebrow="Learning" title="My progress" />
        <Skeleton h={96} className="sk-block" style={{ marginBottom: 'var(--s-6)' }} />
        <div className="split"><Skeleton h={320} className="sk-block" /><Skeleton h={320} className="sk-block" /></div>
      </>
    );
  }

  if (isError) {
    return (
      <>
        <PageHeader eyebrow="Learning" title="My progress" />
        <Card><ErrorState onRetry={() => void refetch()} /></Card>
      </>
    );
  }

  if (!data) {
    return (
      <>
        <PageHeader eyebrow="Learning" title="My progress" />
        <Card>
          <EmptyState
            icon={<IconChart size={20} />}
            title="No progress recorded yet"
            description="Join a live session and answer a question — your accuracy, attendance and marks start building from there."
            action={<LinkButton to="/student/live" size="sm">Join a session</LinkButton>}
          />
        </Card>
      </>
    );
  }

  const k = data.kpis;
  const trendSeries = [{ key: 'accuracy', name: 'Accuracy' }];

  return (
    <>
      <PageHeader
        eyebrow="Learning"
        title="My progress"
        lede="Your accuracy, attendance and marks across every course you are enrolled in."
      />

      <StatGrid>
        <Stat label="Answer accuracy" value={`${k.accuracy}%`} foot={`${k.questionsAnswered} questions answered`} />
        <Stat label="Attendance rate" value={`${k.attendanceRate}%`} foot={`${k.sessionsAttended} sessions attended`} />
        <Stat label="Marks earned" value={k.marksEarned} foot="Across all sessions" />
        <Stat label="Questions answered" value={k.questionsAnswered} foot="Since you joined" />
      </StatGrid>

      <div className="split section">
        <ChartCard
          title="Accuracy over time"
          sub="Percentage correct in each session you attended"
          legend={legendFor(trendSeries)}
        >
          {data.scoreTrend.length
            ? <TrendArea data={data.scoreTrend} x="date" unit="%" series={trendSeries} />
            : <EmptyChart label="Answer questions in a few sessions to build a trend" />}
        </ChartCard>

        <ChartCard title="Answer breakdown" sub="Every answer you have submitted">
          {data.answerBreakdown.length
            ? <Donut data={data.answerBreakdown} colors={['var(--success)', 'var(--danger)', 'var(--chart-5)']} />
            : <EmptyChart label="Nothing submitted yet" />}
        </ChartCard>
      </div>

      <div className="section">
        <Card>
          <CardHead title="Attendance by course" sub="Sessions you attended out of sessions held" />
          <CardBody>
            {data.perCourse.length ? (
              data.perCourse.map((c) => (
                <Meter key={c.course} label={c.course} sub={c.name} value={c.rate} />
              ))
            ) : (
              <EmptyState
                tight
                icon={<IconBook size={20} />}
                title="Not enrolled anywhere yet"
                description="Once you are enrolled in a course, your attendance in it appears here."
              />
            )}
          </CardBody>
        </Card>
      </div>
    </>
  );
}
