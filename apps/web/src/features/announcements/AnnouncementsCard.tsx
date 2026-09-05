import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import type { Announcement } from '../../lib/types';
import {
  Badge, Banner, Button, Card, CardHead, Checkbox, ConfirmDialog, Drawer,
  EmptyState, IconButton, Skeleton, TextField, TextareaField, useToast,
} from '../../components/ui';
import { IconMessage, IconPlus, IconTrash } from '../../components/icons';
import { relativeTime } from '../../lib/format';

/* ============================================================
   Course announcements — shared between the teacher view
   (compose, delete) and the student view (read). Publishing
   notifies every enrolled student.
   ============================================================ */
export function AnnouncementsCard({ courseId, canPost }: { courseId: string; canPost: boolean }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [composeOpen, setComposeOpen] = useState(false);
  const [error, setError] = useState('');
  const [removing, setRemoving] = useState<Announcement | null>(null);

  const announcements = useQuery({
    queryKey: ['announcements', courseId],
    queryFn: () => api.get<Announcement[]>(`/courses/${courseId}/announcements`),
    enabled: !!courseId,
  });

  const create = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.post(`/courses/${courseId}/announcements`, body),
    onSuccess: () => {
      setComposeOpen(false); setError('');
      qc.invalidateQueries({ queryKey: ['announcements', courseId] });
      toast.success('Announcement posted', 'Enrolled students have been notified.');
    },
    onError: (e) => setError(e instanceof Error ? e.message : 'Could not post the announcement.'),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.del(`/announcements/${id}`),
    onSuccess: () => {
      setRemoving(null);
      qc.invalidateQueries({ queryKey: ['announcements', courseId] });
      toast.success('Announcement removed');
    },
    onError: (e) => toast.error('Could not remove', e instanceof Error ? e.message : undefined),
  });

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    const f = new FormData(e.currentTarget);
    create.mutate({
      title: String(f.get('title') ?? ''),
      body: String(f.get('body') ?? ''),
      priority: f.get('important') === 'on' ? 'IMPORTANT' : 'NORMAL',
    });
  };

  const rows = announcements.data ?? [];

  return (
    <Card>
      <CardHead
        title="Announcements"
        sub={canPost ? 'Posting notifies every enrolled student' : undefined}
        action={canPost && (
          <Button size="sm" variant="secondary" onClick={() => { setError(''); setComposeOpen(true); }}>
            <IconPlus size={14} />Post
          </Button>
        )}
      />
      {announcements.isLoading ? (
        <div style={{ padding: 'var(--s-4)' }}><Skeleton h={60} /></div>
      ) : rows.length === 0 ? (
        <EmptyState
          tight
          icon={<IconMessage size={20} />}
          title="Nothing posted yet"
          description={canPost
            ? 'Share deadlines, scope changes and reminders — students are notified instantly.'
            : 'When your teacher posts an announcement, it appears here.'}
        />
      ) : (
        <ul className="ann-list">
          {rows.map((a) => (
            <li key={a.id} className="ann-item">
              <div className="grow" style={{ minWidth: 0 }}>
                <div className="row-tight">
                  <span className="t-sm" style={{ fontWeight: 600 }}>{a.title}</span>
                  {a.priority === 'IMPORTANT' && <Badge tone="warning">Important</Badge>}
                </div>
                <p className="t-sm t-secondary" style={{ whiteSpace: 'pre-wrap', margin: '4px 0 0' }}>{a.body}</p>
                <span className="t-caption t-muted">
                  {a.author?.name ?? 'Staff'} · {relativeTime(a.createdAt)}
                </span>
              </div>
              {canPost && (
                <IconButton label={`Delete ${a.title}`} onClick={() => setRemoving(a)}>
                  <IconTrash size={14} />
                </IconButton>
              )}
            </li>
          ))}
        </ul>
      )}

      <Drawer
        open={composeOpen} onClose={() => setComposeOpen(false)}
        title="Post an announcement"
        description="Every enrolled student is notified the moment you post."
      >
        <form className="col" onSubmit={submit}>
          {error && <Banner tone="error" title="Could not post">{error}</Banner>}
          <TextField label="Title" name="title" required minLength={2} maxLength={200} />
          <TextareaField label="Message" name="body" required rows={6} />
          <Checkbox name="important" label="Mark as important" description="Pinned above normal announcements for students." />
          <div className="row" style={{ justifyContent: 'flex-end', gap: 'var(--s-2)' }}>
            <Button type="button" variant="secondary" onClick={() => setComposeOpen(false)}>Cancel</Button>
            <Button type="submit" loading={create.isPending}>Post</Button>
          </div>
        </form>
      </Drawer>

      <ConfirmDialog
        open={!!removing}
        onClose={() => setRemoving(null)}
        onConfirm={() => removing && remove.mutate(removing.id)}
        loading={remove.isPending}
        destructive
        title={`Delete “${removing?.title}”?`}
        description="It disappears for students. Notifications already sent are not recalled."
        confirmLabel="Delete"
      />
    </Card>
  );
}
