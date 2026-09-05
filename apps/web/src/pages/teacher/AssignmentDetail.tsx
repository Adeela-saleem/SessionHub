import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { api, apiDownload, apiUpload } from '../../lib/api';
import type { Assignment, StoredFileMeta, SubmissionRow } from '../../lib/types';
import { usePageDetail } from '../../components/shell/AppShell';
import {
  Badge, Banner, Button, ConfirmDialog, DataTable,
  Drawer, EmptyState, ErrorState, PageHeader, SectionHead, Skeleton, Stat, StatGrid,
  TextareaField, useToast, type BadgeTone, type Column,
  NumberField,
} from '../../components/ui';
import { IconFile } from '../../components/icons';
import { formatDate, formatTime } from '../../lib/format';

const STATUS_BADGE: Record<string, { tone: BadgeTone; label: string }> = {
  DRAFT: { tone: 'neutral', label: 'Draft' },
  SUBMITTED: { tone: 'info', label: 'Submitted' },
  GRADED: { tone: 'warning', label: 'Graded — not returned' },
  RETURNED: { tone: 'success', label: 'Returned' },
};

/* ============================================================
   Grading desk. The roster is the table — everyone enrolled,
   whether they submitted or not. Grading happens in a drawer
   with the student's work in view.
   ============================================================ */
export default function TeacherAssignmentDetail() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const toast = useToast();
  const fileInput = useRef<HTMLInputElement>(null);

  const [grading, setGrading] = useState<SubmissionRow | null>(null);
  const [confirmPublish, setConfirmPublish] = useState(false);

  const assignment = useQuery({
    queryKey: ['assignment', id],
    queryFn: () => api.get<Assignment>(`/assignments/${id}`),
    enabled: !!id,
  });
  const submissions = useQuery({
    queryKey: ['submissions', id],
    queryFn: () => api.get<SubmissionRow[]>(`/assignments/${id}/submissions`),
    enabled: !!id,
  });

  const a = assignment.data;
  usePageDetail(a?.title);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['assignment', id] });
    qc.invalidateQueries({ queryKey: ['submissions', id] });
    qc.invalidateQueries({ queryKey: ['teacher-assignments'] });
  };

  const setStatus = useMutation({
    mutationFn: (status: string) => api.patch(`/assignments/${id}`, { status }),
    onSuccess: (_d, status) => {
      setConfirmPublish(false); invalidate();
      toast.success(
        status === 'PUBLISHED' ? 'Published' : 'Unpublished',
        status === 'PUBLISHED' ? 'Enrolled students have been notified.' : undefined,
      );
    },
    onError: (e) => toast.error('Could not update', e instanceof Error ? e.message : undefined),
  });

  const upload = useMutation({
    mutationFn: (file: File) => apiUpload<StoredFileMeta>(`/assignments/${id}/files`, file),
    onSuccess: () => { invalidate(); toast.success('File attached'); },
    onError: (e) => toast.error('Upload failed', e instanceof Error ? e.message : undefined),
  });

  if (assignment.isLoading) {
    return <div className="col"><Skeleton h={28} w="40%" /><Skeleton h={220} className="sk-block" /></div>;
  }
  if (assignment.isError || !a) {
    return <ErrorState title="Could not load this assignment" onRetry={() => assignment.refetch()} />;
  }

  const rows = submissions.data ?? [];
  const submitted = rows.filter((r) => r.submission && r.submission.status !== 'DRAFT');
  const returned = submitted.filter((r) => r.submission!.status === 'RETURNED');
  const needsGrading = submitted.filter((r) => r.submission!.status === 'SUBMITTED');

  const columns: Column<SubmissionRow>[] = [
    {
      key: 'student', header: 'Student', sortValue: (r) => r.student.name,
      cell: (r) => (
        <span>
          <span className="cell-primary" style={{ display: 'block' }}>{r.student.name}</span>
          <span className="cell-sub">{r.student.email}</span>
        </span>
      ),
    },
    {
      key: 'status', header: 'Status', width: 170,
      cell: (r) => {
        const b = STATUS_BADGE[r.submission?.status ?? ''] ?? { tone: 'neutral' as BadgeTone, label: 'Not submitted' };
        return <Badge tone={b.tone}>{b.label}</Badge>;
      },
    },
    {
      key: 'submitted', header: 'Handed in', width: 170, secondary: true,
      cell: (r) => r.submission?.submittedAt
        ? `${formatDate(r.submission.submittedAt)} ${formatTime(r.submission.submittedAt)}${r.submission.isLate ? ' · late' : ''}`
        : '—',
    },
    {
      key: 'marks', header: `Marks / ${a.maxMarks}`, width: 100, align: 'right',
      cell: (r) => r.submission?.marksAwarded ?? '—',
      sortValue: (r) => r.submission?.marksAwarded ?? -1,
    },
    {
      key: 'actions', header: '', width: 100, align: 'right',
      cell: (r) => r.submission && r.submission.status !== 'DRAFT' ? (
        <Button size="xs" variant="secondary" onClick={() => setGrading(r)}>
          {r.submission.status === 'SUBMITTED' ? 'Grade' : 'Review'}
        </Button>
      ) : null,
    },
  ];

  return (
    <>
      <PageHeader
        title={a.title}
        lede={<>{a.course && <><span className="t-data">{a.course.code}</span> · </>}Due {formatDate(a.dueAt)} at {formatTime(a.dueAt)} · {a.maxMarks} marks{a.allowLate ? ' · late allowed' : ''}</>}
        actions={
          <>
            {a.status === 'PUBLISHED' ? <Badge tone="success">Published</Badge> : <Badge tone="neutral">Draft</Badge>}
            {a.status === 'PUBLISHED' ? (
              <Button variant="secondary" onClick={() => setStatus.mutate('DRAFT')} loading={setStatus.isPending}>
                Unpublish
              </Button>
            ) : (
              <Button size="lg" onClick={() => setConfirmPublish(true)} loading={setStatus.isPending}>
                Publish
              </Button>
            )}
          </>
        }
      />

      {a.status !== 'PUBLISHED' && (
        <Banner tone="info" title="Draft">
          Students cannot see this assignment yet. Publish it to open submissions and notify the roster.
        </Banner>
      )}

      <StatGrid>
        <Stat label="Enrolled" value={rows.length} foot="On the roster" />
        <Stat label="Submitted" value={submitted.length} foot={rows.length ? `${Math.round((submitted.length / rows.length) * 100)}% of roster` : '—'} />
        <Stat label="Needs grading" value={needsGrading.length} foot="Waiting on you" />
        <Stat label="Returned" value={returned.length} foot="Visible to students" />
      </StatGrid>

      <section className="section">
        <SectionHead
          title="Brief"
          action={
            <Button size="sm" variant="secondary" loading={upload.isPending} onClick={() => fileInput.current?.click()}>
              <IconFile size={14} />Attach file
            </Button>
          }
        />
        <div className="brief">
          <p>{a.instructions}</p>
          {a.files.length > 0 && (
            <ul className="file-list">
              {a.files.map((f) => (
                <li key={f.id}>
                  <button type="button" className="file-chip" onClick={() => apiDownload(f.id, f.originalName)}>
                    <IconFile size={14} /><span className="t-clamp-1">{f.originalName}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <input
            ref={fileInput} type="file" hidden
            onChange={(e) => { const f = e.target.files?.[0]; if (f) upload.mutate(f); e.target.value = ''; }}
          />
        </div>
      </section>

      <section className="section">
        <SectionHead title="Submissions" sub={`${submitted.length} of ${rows.length} handed in`} />
        <div className="table-frame">
      <DataTable
        columns={columns}
        rows={rows}
        getRowId={(r) => r.student.id}
        loading={submissions.isLoading}
        error={submissions.error}
        onRetry={() => submissions.refetch()}
        caption="Submissions"
        search={{ placeholder: 'Search students…', match: (r) => `${r.student.name} ${r.student.email}` }}
        empty={<EmptyState tight title="No students enrolled" description="Enrol students in the course to collect submissions." />}
        mobileCard={(r) => (
          <div className="record">
            <span className="record-main">
              <span className="record-title">{r.student.name}</span>
              <span className="record-meta" style={{ display: 'block' }}>
                {STATUS_BADGE[r.submission?.status ?? '']?.label ?? 'Not submitted'}
                {r.submission?.marksAwarded != null && ` · ${r.submission.marksAwarded}/${a.maxMarks}`}
              </span>
            </span>
            {r.submission && r.submission.status !== 'DRAFT' && (
              <Button size="xs" variant="secondary" onClick={() => setGrading(r)}>Grade</Button>
            )}
          </div>
        )}
      />
        </div>
      </section>

      <GradeDrawer
        row={grading}
        maxMarks={a.maxMarks}
        latePenaltyPct={a.latePenaltyPct}
        onClose={() => setGrading(null)}
        onDone={() => { setGrading(null); invalidate(); }}
      />

      <ConfirmDialog
        open={confirmPublish}
        onClose={() => setConfirmPublish(false)}
        onConfirm={() => setStatus.mutate('PUBLISHED')}
        loading={setStatus.isPending}
        title="Publish this assignment?"
        description="Every enrolled student is notified and can submit from that moment."
        confirmLabel="Publish"
      />
    </>
  );
}

function GradeDrawer({ row, maxMarks, latePenaltyPct, onClose, onDone }: {
  row: SubmissionRow | null; maxMarks: number; latePenaltyPct: number;
  onClose: () => void; onDone: () => void;
}) {
  const toast = useToast();
  const [marks, setMarks] = useState('');
  const [feedback, setFeedback] = useState('');
  const [seeded, setSeeded] = useState<string | null>(null);

  const sub = row?.submission ?? null;

  // Seed the form when a new row opens.
  if (row && sub && seeded !== sub.id) {
    setSeeded(sub.id);
    setMarks(sub.marksAwarded != null ? String(sub.marksAwarded) : '');
    setFeedback(sub.feedback ?? '');
  }

  const grade = useMutation({
    mutationFn: () => api.post(`/submissions/${sub!.id}/grade`, {
      marksAwarded: Number(marks),
      ...(feedback.trim() ? { feedback: feedback.trim() } : {}),
    }),
    onError: (e) => toast.error('Could not save the grade', e instanceof Error ? e.message : undefined),
  });

  const doReturn = useMutation({
    mutationFn: () => api.post(`/submissions/${sub!.id}/return`),
    onSuccess: () => { toast.success('Returned', 'The student can now see their marks and feedback.'); onDone(); },
    onError: (e) => toast.error('Could not return', e instanceof Error ? e.message : undefined),
  });

  if (!row || !sub) return null;

  const saveOnly = () => grade.mutateAsync().then(() => { toast.success('Grade saved', 'Not visible to the student until you return it.'); onDone(); });
  const saveAndReturn = () => grade.mutateAsync().then(() => doReturn.mutate());

  return (
    <Drawer
      open onClose={onClose}
      title={row.student.name}
      description={sub.submittedAt
        ? `Handed in ${formatDate(sub.submittedAt)} at ${formatTime(sub.submittedAt)}${sub.isLate ? ' — LATE' : ''}${sub.attempt > 1 ? ` · attempt ${sub.attempt}` : ''}`
        : undefined}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="secondary" loading={grade.isPending} disabled={marks === ''} onClick={saveOnly}>
            Save grade
          </Button>
          <Button loading={grade.isPending || doReturn.isPending} disabled={marks === ''} onClick={saveAndReturn}>
            Save &amp; return
          </Button>
        </>
      }
    >
      <div className="form">
        {sub.isLate && latePenaltyPct > 0 && (
          <Banner tone="warning" title="Late submission">
            The course policy suggests a {latePenaltyPct}% penalty. It is not applied automatically — the mark you enter is the mark.
          </Banner>
        )}

        <div className="field">
          <span className="field-label">Submission</span>
          <div className="grade-submission">
            {sub.text ? (
              <p className="t-sm" style={{ whiteSpace: 'pre-wrap' }}>{sub.text}</p>
            ) : (
              <p className="t-sm t-muted">No written answer — files only.</p>
            )}
            {sub.files?.length > 0 && (
              <ul className="file-list">
                {sub.files.map((f) => (
                  <li key={f.id}>
                    <button type="button" className="file-chip" onClick={() => apiDownload(f.id, f.originalName)}>
                      <IconFile size={14} /><span className="t-clamp-1">{f.originalName}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <NumberField
          label={`Marks (out of ${maxMarks})`}
          min={0} max={maxMarks}
          value={marks}
          onChange={(e) => setMarks(e.target.value)}
        />
        <TextareaField
          label="Feedback"
          rows={5}
          optional
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
          hint="The student sees this when you return the work."
        />
      </div>
    </Drawer>
  );
}
