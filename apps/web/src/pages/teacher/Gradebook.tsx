import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { api } from '../../lib/api';
import { downloadCsv } from '../../lib/csv';
import type { Course, GradeCategory, GradebookData } from '../../lib/types';
import {
  Badge, Banner, Button, ConfirmDialog, Drawer,
  EmptyState, ErrorState, PageHeader, Select, SelectField, Skeleton,
  TextField, useToast,
  NumberField,
} from '../../components/ui';
import { IconPlus, IconTrash } from '../../components/icons';

const KIND_LABEL: Record<string, string> = {
  ASSIGNMENTS: 'Assignments',
  LIVE_QUIZZES: 'Live quizzes',
  ATTENDANCE: 'Attendance',
};

/**
 * Tone follows the letter, not a pass line: a D is a warning even
 * though it passes, and a C is information, never a green light.
 */
function gradeTone(letter: string): 'success' | 'info' | 'warning' | 'danger' {
  const initial = letter.trim().charAt(0).toUpperCase();
  if (initial === 'A' || initial === 'B') return 'success';
  if (initial === 'C') return 'info';
  if (initial === 'D') return 'warning';
  return 'danger';
}

/* ============================================================
   Gradebook — one course at a time. Categories and weights on
   top; the computed table below. Everything is derived live
   from submissions, quiz answers and attendance.
   ============================================================ */
export default function TeacherGradebook() {
  const qc = useQueryClient();
  const toast = useToast();
  const [params, setParams] = useSearchParams();

  const courses = useQuery({ queryKey: ['courses'], queryFn: () => api.get<Course[]>('/courses') });
  const courseId = params.get('course') ?? courses.data?.[0]?.id ?? '';

  const [catOpen, setCatOpen] = useState(false);
  const [removing, setRemoving] = useState<GradeCategory | null>(null);
  const [error, setError] = useState('');

  const gradebook = useQuery({
    queryKey: ['gradebook', courseId],
    queryFn: () => api.get<GradebookData>(`/courses/${courseId}/gradebook`),
    enabled: !!courseId,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['gradebook', courseId] });
    qc.invalidateQueries({ queryKey: ['grade-categories', courseId] });
  };

  const createCat = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.post(`/courses/${courseId}/grade-categories`, body),
    onSuccess: () => { setCatOpen(false); setError(''); invalidate(); },
    onError: (e) => setError(e instanceof Error ? e.message : 'Could not add the category.'),
  });

  const removeCat = useMutation({
    mutationFn: (id: string) => api.del(`/grade-categories/${id}`),
    onSuccess: () => { setRemoving(null); invalidate(); toast.success('Category removed'); },
    onError: (e) => toast.error('Could not remove', e instanceof Error ? e.message : undefined),
  });

  const g = gradebook.data;
  const declared = (g?.categories ?? []).filter((c) => c.id !== null);
  const weightSum = declared.reduce((sum, c) => sum + c.weightPct, 0);

  return (
    <>
      <PageHeader
        title="Gradebook"
        lede={g
          ? `${g.course.code} · ${g.rows.length} students · ${g.assignments.length} assignments counted · ${g.sessionsHeld} sessions held`
          : 'Weighted standing for every student, computed live from graded work, quiz answers and attendance.'}
        actions={
          <Button variant="secondary" onClick={() => { setError(''); setCatOpen(true); }} disabled={!courseId}>
            <IconPlus size={15} />Add category
          </Button>
        }
      />

      {declared.length > 0 && weightSum !== 100 && (
        <Banner tone="warning" title={`Weights add up to ${weightSum}%`}>
          Grades are computed proportionally, but a scheme that sums to 100% is easier for students to reason about.
        </Banner>
      )}

      <div className="toolbar">
          <Select
            aria-label="Course"
            value={courseId}
            onChange={(e) => setParams({ course: e.target.value })}
            disabled={!(courses.data ?? []).length}
            style={{ width: 'auto', maxWidth: 300 }}
          >
            {(courses.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}
          </Select>
          {(g?.categories ?? []).map((c) => (
            <span key={c.id ?? c.name} className="cat-chip">
              <strong>{c.name}</strong> {c.weightPct}%
              {KIND_LABEL[c.kind] !== c.name && (
                <span className="t-caption t-muted"> · {KIND_LABEL[c.kind]}</span>
              )}
              {c.id && (
                <button
                  type="button" className="cat-chip-x" aria-label={`Remove ${c.name}`}
                  onClick={() => setRemoving(c as GradeCategory)}
                >
                  <IconTrash size={12} />
                </button>
              )}
            </span>
          ))}
          <span className="toolbar-end">
          <Button
            size="md"
            variant="secondary"
            disabled={!g || g.rows.length === 0}
            onClick={() => {
              if (!g) return;
              downloadCsv(`${g.course.code.toLowerCase()}-gradebook.csv`, [
                ['Student', ...g.categories.map((c) => `${c.name} (${c.weightPct}%)`), 'Total %', 'Grade'],
                ...g.rows.map((r) => [
                  r.student.name,
                  ...r.perCategory.map((c) => c.pct),
                  r.total,
                  r.letter,
                ]),
              ]);
            }}
          >
            Export CSV
          </Button>
          </span>
      </div>

      <div className="table-frame gradebook-frame">
        {gradebook.isLoading || courses.isLoading ? (
          <div style={{ padding: 'var(--s-4)' }}><Skeleton h={280} /></div>
        ) : gradebook.isError ? (
          <ErrorState title="Could not load the gradebook" onRetry={() => gradebook.refetch()} />
        ) : !g || g.rows.length === 0 ? (
          <EmptyState
            tight
            title="No students enrolled"
            description="Enrol students in this course and their standing appears here."
          />
        ) : (
          <div className="table-wrap gradebook-scroll">
            <table className="data data-compact gradebook-table">
              <caption className="sr-only">Course gradebook</caption>
              <thead>
                <tr>
                  <th scope="col">Student</th>
                  {g.categories.map((c) => (
                    <th key={c.id ?? c.name} scope="col" style={{ textAlign: 'right' }}>
                      {c.name}<span className="t-caption t-muted"> {c.weightPct}%</span>
                    </th>
                  ))}
                  <th scope="col" style={{ textAlign: 'right' }}>Total</th>
                  <th scope="col" style={{ textAlign: 'right' }}>Grade</th>
                </tr>
              </thead>
              <tbody>
                {g.rows.map((r) => (
                  <tr key={r.student.id}>
                    <th scope="row" style={{ fontWeight: 500 }}>{r.student.name}</th>
                    {r.perCategory.map((c) => (
                      <td key={c.categoryId ?? c.name} style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                        {c.pct === null ? <span className="t-muted">—</span> : `${c.pct}%`}
                      </td>
                    ))}
                    <td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>
                      {r.total === null ? <span className="t-muted">—</span> : `${r.total}%`}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      {r.letter ? <Badge tone={gradeTone(r.letter)}>{r.letter}</Badge> : <span className="t-muted">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Drawer
        open={catOpen} onClose={() => setCatOpen(false)}
        title="Add grade category"
        description="Weights decide how each bucket counts toward the final grade."
      >
        <form
          className="form"
          onSubmit={(e: FormEvent<HTMLFormElement>) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            createCat.mutate({
              name: String(f.get('name') ?? ''),
              kind: String(f.get('kind') ?? 'ASSIGNMENTS'),
              weightPct: Number(f.get('weightPct') ?? 0),
              order: declared.length,
            });
          }}
        >
          {error && <Banner tone="error" title="Could not add">{error}</Banner>}
          <TextField label="Name" name="name" required minLength={2} maxLength={80} placeholder="e.g. Assignments" />
          <SelectField label="Counts" name="kind" hint="Assignments hold graded work; the other two are computed from live sessions.">
            <option value="ASSIGNMENTS">Graded assignments</option>
            <option value="LIVE_QUIZZES">Live quiz marks</option>
            <option value="ATTENDANCE">Attendance rate</option>
          </SelectField>
          <NumberField label="Weight (%)" name="weightPct" min={0} max={100} required defaultValue={20} />
          <div className="form-actions">
            <Button type="button" variant="secondary" onClick={() => setCatOpen(false)}>Cancel</Button>
            <Button type="submit" loading={createCat.isPending}>Add category</Button>
          </div>
        </form>
      </Drawer>

      <ConfirmDialog
        open={!!removing}
        onClose={() => setRemoving(null)}
        onConfirm={() => removing && removeCat.mutate(removing.id)}
        loading={removeCat.isPending}
        destructive
        title={`Remove “${removing?.name}”?`}
        description="Assignments in this category keep their marks but stop counting toward a weighted bucket until reassigned."
        confirmLabel="Remove"
      />
    </>
  );
}
