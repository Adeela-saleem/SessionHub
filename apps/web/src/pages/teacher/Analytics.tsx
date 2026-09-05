import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import type { TeacherAnalytics } from '../../lib/types';
import {
  EmptyState, ErrorState, LinkButton, PageHeader, Progress, SectionHead,
  SimpleTable, Skeleton, Stat, StatGrid,
} from '../../components/ui';
import { IconBroadcast, IconTarget, IconMessage, IconUsers } from '../../components/icons';
import { Bars, ChartFrame, EmptyChart, TrendLine, legendFor } from '../../components/charts';

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
    // Mirrors the loaded layout — stat band, full-width trend, split —
    // so nothing jumps when the data lands.
    return (
      <>
        <PageHeader title="Analytics" />
        <Skeleton h={72} className="sk-block" />
        <div className="section"><Skeleton h={280} className="sk-block" /></div>
        <div className="split section"><Skeleton h={260} className="sk-block" /><Skeleton h={260} className="sk-block" /></div>
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
          title="No sessions to analyse yet"
          description="Run a live session and ask a few questions — participation and comprehension appear here afterwards."
          action={<LinkButton to="/teacher/live" size="sm">Start a session</LinkButton>}
        />
      </>
    );
  }

  const k = data.kpis;
  const maxJoins = Math.max(...data.attendanceByCourse.map((c) => c.students), 1);
  // Counts and percentages never share an axis: joins/answers read on the
  // left, accuracy on its own right-hand 0–100 scale.
  const participation = [
    { key: 'joined', name: 'Joined' },
    { key: 'answers', name: 'Answers' },
    { key: 'accuracy', name: 'Accuracy %', axis: 'right' as const },
  ];
  // One row per prompt at its worst accuracy; only answered questions
  // under the 70% line belong in a "struggled" list.
  const worstByPrompt = new Map<string, TeacherAnalytics['questionDifficulty'][number]>();
  for (const q of data.questionDifficulty) {
    if (q.answers === 0) continue;
    const prev = worstByPrompt.get(q.prompt);
    if (!prev || q.correctPct < prev.correctPct) worstByPrompt.set(q.prompt, q);
  }
  const weakest = [...worstByPrompt.values()]
    .filter((q) => q.correctPct < 70)
    .sort((a, b) => a.correctPct - b.correctPct)
    .slice(0, 5);

  return (
    <>
      <PageHeader
        title="Analytics"
        lede={`${k.sessionsRun} ${k.sessionsRun === 1 ? 'session' : 'sessions'} analysed · ${k.questionsAsked} questions · ${k.totalAnswers} answers`}
      />

      <StatGrid>
        <Stat icon={<IconBroadcast size={16} />} tone="neutral" label="Sessions run" value={k.sessionsRun} foot={k.liveNow ? `${k.liveNow} live now` : 'None live'} />
        <Stat icon={<IconMessage size={16} />} tone="info" label="Questions asked" value={k.questionsAsked} foot="All sessions" />
        <Stat icon={<IconUsers size={16} />} tone="accent" label="Answers received" value={k.totalAnswers} foot={k.questionsAsked ? `${Math.round((k.totalAnswers / k.questionsAsked) * 10) / 10} per question` : 'From students'} />
        <Stat
          icon={<IconTarget size={16} />} tone={k.avgAccuracy >= 70 ? 'success' : 'warning'}
          label="Average accuracy"
          value={`${k.avgAccuracy}%`}
          foot={k.totalAnswers > 0 && k.avgAccuracy < 50 ? 'Below the 50% line' : 'Every question'}
        />
      </StatGrid>

      <section className="section">
        <SectionHead title="Participation over time" sub="Joined, answers and accuracy, per session" />
        <ChartFrame height={260} legend={legendFor(participation)}>
          {data.participationTrend.length
            ? <TrendLine data={data.participationTrend} x="date" series={participation} />
            : <EmptyChart label="Run a few sessions to build a trend" />}
        </ChartFrame>
      </section>

      <div className="split section">
        <section>
          <SectionHead title="Where the room struggled" sub="Percent correct per question" />
          <ChartFrame height={240}>
            {data.questionDifficulty.length
              ? (
                <Bars
                  data={data.questionDifficulty} x="label" unit="%"
                  series={[{ key: 'correctPct', name: 'Correct' }]}
                  colorBy={(r) => r.correctPct >= 70 ? 'var(--success)' : r.correctPct >= 40 ? 'var(--warning)' : 'var(--danger)'}
                />
              )
              : <EmptyChart label="No answered questions yet" />}
          </ChartFrame>
          {weakest.length > 0 && (
            <div style={{ marginTop: 'var(--s-4)' }}>
              <SimpleTable
                bare
                rows={weakest}
                getRowId={(q) => `${q.label}-${q.prompt}`}
                caption="Questions answered worst"
                columns={[
                  { key: 'label', header: '', width: 48, cell: (q) => <span className="cell-data">{q.label}</span> },
                  { key: 'prompt', header: 'Question', cell: (q) => <span className="t-clamp-1">{q.prompt}</span> },
                  { key: 'answers', header: 'Answers', width: 80, align: 'right', cell: (q) => q.answers },
                  { key: 'pct', header: 'Correct', width: 90, align: 'right', cell: (q) => (
                    <span style={{ color: q.correctPct >= 70 ? 'var(--success)' : q.correctPct >= 40 ? 'var(--warning)' : 'var(--danger)', fontWeight: 500 }}>{q.correctPct}%</span>
                  ) },
                ]}
              />
            </div>
          )}
        </section>

        <section>
          <SectionHead title="Attendance by course" sub="Total joins" />
          {data.attendanceByCourse.length ? (
            <SimpleTable
              bare
              rows={data.attendanceByCourse}
              getRowId={(c) => c.course}
              caption="Attendance by course"
              columns={[
                { key: 'course', header: 'Course', width: 96, cell: (c) => <span className="cell-data">{c.course}</span> },
                { key: 'bar', header: 'Relative to busiest', cell: (c) => (
                  <span className="cell-progress">
                    <Progress value={(c.students / maxJoins) * 100} tone="foundation" label={`${c.course} joins`} />
                    <span className="t-num">{Math.round((c.students / maxJoins) * 100)}%</span>
                  </span>
                ) },
                { key: 'joins', header: 'Joins', width: 72, align: 'right', cell: (c) => c.students },
              ]}
            />
          ) : (
            <EmptyState
              row bare
              title="No attendance recorded yet"
              description="Attendance is counted the moment a student joins with your room code."
            />
          )}
        </section>
      </div>
    </>
  );
}
