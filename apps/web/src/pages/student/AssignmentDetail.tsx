import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { api, apiDownload, apiUpload } from '../../lib/api';
import type { Assignment, StoredFileMeta, Submission } from '../../lib/types';
import { usePageDetail } from '../../components/shell/AppShell';
import {
  Badge, Banner, Button, ConfirmDialog, EmptyState, ErrorState, PageHeader, SectionHead,
  Skeleton, Textarea, useToast,
} from '../../components/ui';
import { IconFile, IconTrash } from '../../components/icons';
import { formatDate, formatTime } from '../../lib/format';
import { dueLabel, submissionBadge } from './Assignments';

function fileSize(bytes: number) {
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

/* ============================================================
   Assignment workspace
   Left: the brief and its files. Right: facts, then the result.
   Below: the student's answer. The deadline and lateness are
   enforced by the API; this page just tells the truth about them.
   ============================================================ */
export default function AssignmentDetail() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const toast = useToast();
  const fileInput = useRef<HTMLInputElement>(null);

  const [text, setText] = useState('');
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [dirty, setDirty] = useState(false);

  const assignment = useQuery({
    queryKey: ['assignment', id],
    queryFn: () => api.get<Assignment>(`/assignments/${id}`),
    enabled: !!id,
  });
  const a = assignment.data;
  const sub = (a?.mySubmission ?? null) as Submission | null;
  usePageDetail(a?.title);

  // Seed the editor from the saved draft exactly once per load.
  useEffect(() => {
    if (sub?.text != null && !dirty) setText(sub.text);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sub?.text]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['assignment', id] });
    qc.invalidateQueries({ queryKey: ['my-assignments'] });
  };

  const saveDraft = useMutation({
    mutationFn: () => api.patch<Submission>(`/assignments/${id}/submission`, { text }),
    onSuccess: () => { setDirty(false); invalidate(); toast.success('Draft saved'); },
    onError: (e) => toast.error('Could not save', e instanceof Error ? e.message : undefined),
  });

  const upload = useMutation({
    mutationFn: (file: File) => apiUpload<StoredFileMeta>(`/assignments/${id}/submission/files`, file),
    onSuccess: () => { invalidate(); toast.success('File attached'); },
    onError: (e) => toast.error('Upload failed', e instanceof Error ? e.message : undefined),
  });

  const removeFile = useMutation({
    mutationFn: (fileId: string) => api.del(`/files/${fileId}`),
    onSuccess: invalidate,
  });

  const submit = useMutation({
    mutationFn: () => api.post<Submission>(`/assignments/${id}/submit`),
    onSuccess: () => {
      setConfirmSubmit(false); invalidate();
      toast.success('Submitted', 'Your work has been handed in.');
    },
    onError: (e) => {
      setConfirmSubmit(false);
      toast.error('Could not submit', e instanceof Error ? e.message : undefined);
    },
  });

  if (assignment.isLoading) {
    return <div className="col"><Skeleton h={22} w="40%" /><Skeleton h={220} className="sk-block" /></div>;
  }
  if (assignment.isError || !a) {
    return <ErrorState title="Could not load this assignment" onRetry={() => assignment.refetch()} />;
  }

  const badge = submissionBadge(a);
  const overdue = new Date(a.dueAt) < new Date();
  const editable = !sub || sub.status === 'DRAFT' || sub.status === 'RETURNED'
    || (sub.status === 'SUBMITTED' && a.resubmissions);
  const canEdit = editable && !(overdue && !a.allowLate);

  const download = (f: StoredFileMeta) =>
    apiDownload(f.id, f.originalName).catch(() => toast.error('Could not download the file'));

  return (
    <>
      <PageHeader
        title={a.title}
        lede={a.course ? `${a.course.code} · ${a.course.name}` : undefined}
        actions={<Badge tone={badge.tone}>{badge.label}</Badge>}
      />

      {overdue && !sub?.submittedAt && (
        <Banner tone={a.allowLate ? 'warning' : 'error'} title={a.allowLate ? 'Past the deadline' : 'Closed'}>
          {a.allowLate
            ? `You can still submit, but it will be marked late${a.latePenaltyPct ? ` (${a.latePenaltyPct}% penalty applies)` : ''}.`
            : 'The deadline has passed and this assignment no longer accepts submissions.'}
        </Banner>
      )}

      <div className="split section-tight">
        <div>
          <section>
            <SectionHead title="Brief" />
            <p className="prose-block">{a.instructions}</p>
            {a.files.length > 0 && (
              <ul className="file-list">
                {a.files.map((f) => (
                  <li key={f.id}>
                    <button type="button" className="file-chip" onClick={() => download(f)}>
                      <IconFile size={14} />
                      <span className="t-clamp-1">{f.originalName}</span>
                      <span className="t-caption t-muted">{fileSize(f.sizeBytes)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="section">
            <SectionHead
              title="Your work"
              sub={sub?.submittedAt
                ? `Submitted ${formatDate(sub.submittedAt)} at ${formatTime(sub.submittedAt)}${sub.isLate ? ' · late' : ''}${sub.attempt > 1 ? ` · attempt ${sub.attempt}` : ''}`
                : undefined}
            />
            {canEdit ? (
              <div className="form">
                <Textarea
                  rows={10}
                  value={text}
                  aria-label="Your answer"
                  placeholder="Type your answer here…"
                  onChange={(e) => { setText(e.target.value); setDirty(true); }}
                />
                <div className="form-actions" style={{ justifyContent: 'flex-start' }}>
                  <Button variant="secondary" loading={saveDraft.isPending} disabled={!dirty} onClick={() => saveDraft.mutate()}>
                    Save draft
                  </Button>
                  <Button variant="secondary" loading={upload.isPending} onClick={() => fileInput.current?.click()}>
                    Attach file
                  </Button>
                  <span className="grow" />
                  <Button
                    loading={submit.isPending}
                    onClick={() => (dirty ? saveDraft.mutateAsync().then(() => setConfirmSubmit(true)) : setConfirmSubmit(true))}
                  >
                    {sub?.submittedAt ? 'Resubmit' : 'Submit'}
                  </Button>
                </div>
                <input
                  ref={fileInput} type="file" hidden
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) upload.mutate(f); e.target.value = ''; }}
                />
              </div>
            ) : sub?.text ? (
              <p className="prose-block">{sub.text}</p>
            ) : (
              <EmptyState row bare title="No written answer" description="This submission was files only." />
            )}

            {sub && sub.files?.length > 0 && (
              <ul className="file-list">
                {sub.files.map((f) => (
                  <li key={f.id}>
                    <button type="button" className="file-chip" onClick={() => download(f)}>
                      <IconFile size={14} />
                      <span className="t-clamp-1">{f.originalName}</span>
                      <span className="t-caption t-muted">{fileSize(f.sizeBytes)}</span>
                    </button>
                    {canEdit && (
                      <button type="button" className="icon-btn" aria-label={`Remove ${f.originalName}`} onClick={() => removeFile.mutate(f.id)}>
                        <IconTrash size={14} />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <div>
          <section>
            <SectionHead title="Details" />
            <dl className="kv">
              <div><dt>Due</dt><dd style={{ color: overdue && !sub?.submittedAt ? 'var(--danger)' : undefined }}>{dueLabel(a.dueAt)}</dd></div>
              <div><dt>Time</dt><dd>{formatTime(a.dueAt)}</dd></div>
              <div><dt>Marks</dt><dd>{a.maxMarks}</dd></div>
              <div><dt>Late work</dt><dd>{a.allowLate ? (a.latePenaltyPct ? `Accepted · ${a.latePenaltyPct}% penalty` : 'Accepted') : 'Not accepted'}</dd></div>
              <div><dt>Resubmission</dt><dd>{a.resubmissions ? 'Allowed' : 'Single attempt'}</dd></div>
              {a.category && <div><dt>Counts toward</dt><dd>{a.category.name}</dd></div>}
            </dl>
          </section>

          {sub?.status === 'RETURNED' && (
            <section className="section">
              <SectionHead title="Result" sub={sub.gradedAt ? `Graded ${formatDate(sub.gradedAt)}` : undefined} />
              <dl className="kv">
                <div><dt>Marks awarded</dt><dd>{sub.marksAwarded} / {a.maxMarks}</dd></div>
              </dl>
              {sub.feedback && (
                <div className="feedback-block">
                  <span className="t-label">Feedback</span>
                  <p className="prose-block">{sub.feedback}</p>
                </div>
              )}
            </section>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={confirmSubmit}
        onClose={() => setConfirmSubmit(false)}
        onConfirm={() => submit.mutate()}
        loading={submit.isPending}
        title={sub?.submittedAt ? 'Resubmit this assignment?' : 'Submit this assignment?'}
        description={overdue
          ? 'The deadline has passed, so this will be marked as a late submission.'
          : 'Your teacher will see your written answer and any attached files.'}
        confirmLabel={sub?.submittedAt ? 'Resubmit' : 'Submit'}
      />
    </>
  );
}
