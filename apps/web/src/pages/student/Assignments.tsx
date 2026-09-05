import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../../lib/api';
import type { Assignment } from '../../lib/types';
import {
  Badge, EmptyState, ErrorState, PageHeader, SectionHead, SimpleTable, Skeleton,
  type BadgeTone,
} from '../../components/ui';
import { formatDate, formatTime } from '../../lib/format';

export function submissionBadge(a: Assignment): { tone: BadgeTone; label: string } {
  const s = a.mySubmission;
  const overdue = !s?.submittedAt && new Date(a.dueAt) < new Date();
  if (!s || s.status === 'DRAFT') {
    return overdue
      ? { tone: 'danger', label: a.allowLate ? 'Overdue' : 'Closed' }
      : { tone: 'neutral', label: s ? 'Draft saved' : 'Not started' };
  }
  if (s.status === 'RETURNED') return { tone: 'success', label: `${s.marksAwarded}/${a.maxMarks}` };
  if (s.status === 'GRADED' || s.status === 'SUBMITTED') {
    return s.isLate ? { tone: 'warning', label: 'Submitted late' } : { tone: 'info', label: 'Submitted' };
  }
  return { tone: 'neutral', label: s.status };
}

export function dueLabel(dueAt: string): string {
  const due = new Date(dueAt);
  const days = Math.ceil((due.getTime() - Date.now()) / 86_400_000);
  if (days < 0) return `Was due ${formatDate(due)}`;
  if (days === 0) return 'Due today';
  if (days === 1) return 'Due tomorrow';
  if (days <= 7) return `Due in ${days} days`;
  return `Due ${formatDate(due)}`;
}

/* ============================================================
   Student assignments
   Two tables, ordered by deadline — what do I owe, and when;
   then what I have already handed in and what it scored.
   ============================================================ */
export default function StudentAssignments() {
  const navigate = useNavigate();
  const assignments = useQuery({
    queryKey: ['my-assignments'],
    queryFn: () => api.get<Assignment[]>('/me/assignments'),
  });

  const rows = assignments.data ?? [];
  const open = rows.filter((a) => !a.mySubmission?.submittedAt);
  const done = rows.filter((a) => a.mySubmission?.submittedAt);

  const titleCol = {
    key: 'title', header: 'Assignment',
    cell: (a: Assignment) => (
      <span className="cell-stack">
        <Link to={`/student/assignments/${a.id}`} className="cell-primary t-clamp-1">{a.title}</Link>
        {a.course && <span className="cell-sub">{a.course.name}</span>}
      </span>
    ),
  };
  const courseCol = { key: 'course', header: 'Course', width: 96, cell: (a: Assignment) => <span className="cell-data">{a.course?.code}</span> };
  const marksCol = { key: 'marks', header: 'Marks', width: 72, align: 'right' as const, cell: (a: Assignment) => a.maxMarks };
  const statusCol = {
    key: 'status', header: 'Status', width: 120, align: 'right' as const,
    cell: (a: Assignment) => { const b = submissionBadge(a); return <Badge tone={b.tone}>{b.label}</Badge>; },
  };

  return (
    <>
      <PageHeader
        title="Assignments"
        lede={rows.length ? `${open.length} open · ${done.length} handed in` : 'Everything due across your courses, nearest deadline first.'}
      />

      {assignments.isLoading ? (
        <Skeleton h={160} className="sk-block" />
      ) : assignments.isError ? (
        <ErrorState title="Could not load assignments" onRetry={() => assignments.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState
          row bare
          title="Nothing due"
          description="When a teacher posts an assignment in one of your courses, it appears here."
        />
      ) : (
        <>
          <section>
            <SectionHead title="Open" sub={open.length ? `${open.length}` : undefined} />
            {open.length === 0 ? (
              <EmptyState row bare title="Nothing outstanding" description="Every published assignment is handed in." />
            ) : (
              <SimpleTable
                bare
                className="tbl-wide"
                rows={open}
                getRowId={(a) => a.id}
                onRowClick={(a) => navigate(`/student/assignments/${a.id}`)}
                caption="Open assignments"
                columns={[
                  titleCol,
                  courseCol,
                  { key: 'due', header: 'Due', width: 200, cell: (a) => {
                    const overdue = new Date(a.dueAt) < new Date();
                    return (
                      <span style={{ color: overdue ? 'var(--danger)' : undefined }}>
                        {dueLabel(a.dueAt)}<span className="cell-muted"> · {formatTime(a.dueAt)}</span>
                      </span>
                    );
                  } },
                  marksCol,
                  statusCol,
                ]}
              />
            )}
          </section>

          {done.length > 0 && (
            <section className="section">
              <SectionHead title="Handed in" sub={`${done.length}`} />
              <SimpleTable
                bare
                className="tbl-wide"
                rows={done}
                getRowId={(a) => a.id}
                onRowClick={(a) => navigate(`/student/assignments/${a.id}`)}
                caption="Submitted assignments"
                columns={[
                  titleCol,
                  courseCol,
                  { key: 'submitted', header: 'Submitted', width: 200, secondary: true, cell: (a) => (
                    a.mySubmission?.submittedAt ? `${formatDate(a.mySubmission.submittedAt)}${a.mySubmission.isLate ? ' · late' : ''}` : '—'
                  ) },
                  marksCol,
                  statusCol,
                ]}
              />
            </section>
          )}
        </>
      )}
    </>
  );
}
