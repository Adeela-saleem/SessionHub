import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import type { TeacherAnalytics } from '../../lib/types';
import {
  Card, CardBody, CardHead, EmptyState, ErrorState, LinkButton, Meter,
  PageHeader, Skeleton, Stat, StatGrid,
} from '../../components/ui';
import { Bars, ChartCard, EmptyChart, TrendLine, legendFor } from '../../components/charts';
import { IconBook, IconChart } from '../../components/icons';

/* ============================================================
   Teaching analytics
   Two questions worth a chart: is participation holding up,
   and which question did the room fail. Everything else is a
   number or a bar.
   ============================================================ */
export default function TeacherAnalyticsPage() {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['analytics', 'teacher'],
    queryFn: () => api.get<TeacherAnalytics>('/analytics/teacher'),
  });

  if (isLoading) {
    return (
      <>
        <PageHeader eyebrow="Insight" title="Analytics" />
        <Skeleton h={96} className="sk-block" style={{ marginBottom: 'var(--s-6)' }} />
        <div className="split"><Skeleton h={320} className="sk-block" /><Skeleton h={320} className="sk-block" /></div>
      </>
    );
  }
  if (isError) {
    return (
      <>
        <PageHeader eyebrow="Insight" title="Analytics" />
        <Card><ErrorState onRetry={() => void refetch()} /></Card>
      </>
    );
  }
  if (!data) {
    return (
      <>
        <PageHeader eyebrow="Insight" title="Analytics" />
        <Card>
          <EmptyState
            icon={<IconChart size={20} />}
            title="No sessions to analyse yet"
            description="Run a live session and ask a few questions — participation and comprehension appear here afterwards."
            action={<LinkButton to="/teacher/live" size="sm">Start a session</LinkButton>}
          />
        </Card>
      </>
    );
  }

  const k = data.kpis;
  const maxJoins = Math.max(...data.attendanceByCourse.map((c) => c.students), 1);
  const participation = [
    { key: 'joined', name: 'Joined' },
    { key: 'answers', name: 'Answers' },
    { key: 'accuracy', name: 'Accuracy %' },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Insight"
        title="Analytics"
        lede="Participation and comprehension across every session you have run."
      />

      <StatGrid>
        <Stat label="Sessions run" value={k.sessionsRun} foot={k.liveNow ? `${k.liveNow} live now` : 'None live'} />
        <Stat label="Questions asked" value={k.questionsAsked} foot="Across all sessions" />
        <Stat label="Answers received" value={k.totalAnswers} foot="From your students" />
        <Stat
          label="Average accuracy"
          value={`${k.avgAccuracy}%`}
          foot={k.totalAnswers > 0 && k.avgAccuracy < 50 ? 'Below the 50% line' : 'Across every question'}
        />
      </StatGrid>

      <div className="section">
        <ChartCard
          title="Participation over time"
          sub="Students joined, answers submitted and accuracy, per session"
          height={300}
          legend={legendFor(participation)}
        >
          {data.participationTrend.length
            ? <TrendLine data={data.participationTrend} x="date" series={participation} />
            : <EmptyChart label="Run a few sessions to build a trend" />}
        </ChartCard>
      </div>

      <div className="split section">
        <ChartCard
          title="Where the room struggled"
          sub="Percent correct per question — red needs re-teaching"
          height={280}
        >
          {data.questionDifficulty.length
            ? (
              <Bars
                data={data.questionDifficulty} x="label" unit="%"
                series={[{ key: 'correctPct', name: 'Correct' }]}
                colorBy={(r) => r.correctPct >= 70 ? 'var(--success)' : r.correctPct >= 40 ? 'var(--warning)' : 'var(--danger)'}
              />
            )
            : <EmptyChart label="No answered questions yet" />}
        </ChartCard>

        <Card>
          <CardHead title="Attendance by course" sub="Total joins, relative to your busiest course" />
          <CardBody>
            {data.attendanceByCourse.length ? (
              data.attendanceByCourse.map((c) => (
                <Meter
                  key={c.course}
                  label={c.course}
                  sub={`${c.students} total joins`}
                  value={(c.students / maxJoins) * 100}
                  tone="foundation"
                />
              ))
            ) : (
              <EmptyState
                tight
                icon={<IconBook size={20} />}
                title="No attendance recorded yet"
                description="Attendance is counted the moment a student joins with your room code."
              />
            )}
          </CardBody>
        </Card>
      </div>
    </>
  );
}
