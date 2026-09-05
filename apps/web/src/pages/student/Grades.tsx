import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import type { CourseGradeSummary } from '../../lib/types';
import {
  Badge, EmptyState, ErrorState, PageHeader, Progress, SectionHead, SimpleTable, Skeleton,
} from '../../components/ui';

const KIND_NOTE: Record<string, string> = {
  ASSIGNMENTS: 'graded assignments',
  LIVE_QUIZZES: 'live session quizzes',
  ATTENDANCE: 'classes attended',
};

/** A D is a warning even though it passes; a C is information. */
function gradeTone(letter: string): 'success' | 'info' | 'warning' | 'danger' {
  const initial = letter.trim().charAt(0).toUpperCase();
  if (initial === 'A' || initial === 'B') return 'success';
  if (initial === 'C') return 'info';
  if (initial === 'D') return 'warning';
  return 'danger';
}

/* ============================================================
   Grades — released marks only. One section per course: the
   standing on the section line, the weighted categories as a
   table beneath it.
   ============================================================ */
export default function StudentGrades() {
  const grades = useQuery({
    queryKey: ['my-grades'],
    queryFn: () => api.get<CourseGradeSummary[]>('/me/grades'),
  });

  return (
    <>
      <PageHeader
        title="Grades"
        lede="Where your marks stand in each course, weighted the way your teacher set up."
      />

      {grades.isLoading ? (
        <Skeleton h={160} className="sk-block" />
      ) : grades.isError ? (
        <ErrorState title="Could not load your grades" onRetry={() => grades.refetch()} />
      ) : !grades.data?.length ? (
        <EmptyState
          row bare
          title="No grades yet"
          description="Once your teachers return graded work, your standing appears here."
        />
      ) : (
        grades.data.map((g, i) => (
          <section key={g.course.id} className={i > 0 ? 'section' : undefined}>
            <SectionHead
              title={g.course.name}
              sub={g.course.code}
              action={g.total !== null && g.letter ? (
                <span className="grade-standing">
                  <span className="t-num">{g.total}%</span>
                  <Badge tone={gradeTone(g.letter)}>{g.letter}</Badge>
                </span>
              ) : <span className="t-caption t-muted">Nothing graded yet</span>}
            />
            <SimpleTable
              bare
              className="tbl-wide"
              rows={g.perCategory}
              getRowId={(c) => c.categoryId ?? c.name}
              caption={`${g.course.code} grade categories`}
              columns={[
                { key: 'name', header: 'Category', cell: (c) => <span className="cell-primary">{c.name}</span> },
                { key: 'weight', header: 'Weight', width: 90, align: 'right', cell: (c) => `${c.weightPct}%` },
                { key: 'score', header: 'Score', width: 220, cell: (c) => (
                  c.pct === null
                    ? <span className="cell-muted">No {KIND_NOTE[c.kind] ?? 'marks'} yet</span>
                    : (
                      <span className="cell-progress">
                        <Progress value={c.pct} tone={c.pct >= 75 ? 'success' : c.pct >= 45 ? 'warning' : 'danger'} label={`${c.name} score`} />
                        <span className="t-num">{c.pct}%</span>
                      </span>
                    )
                ) },
                { key: 'contrib', header: 'Contributes', width: 110, align: 'right', secondary: true, cell: (c) => (
                  c.pct === null ? <span className="cell-muted">—</span> : `${Math.round((c.pct * c.weightPct) / 100)} pts`
                ) },
              ]}
            />
          </section>
        ))
      )}
    </>
  );
}
