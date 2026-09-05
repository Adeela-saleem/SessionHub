import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import type { Course, Slot, SlotConflict } from '../../lib/types';
import {
  Banner, Button, ConfirmDialog, Drawer, EmptyState, ErrorState,
  PageHeader, SelectField, Skeleton, TextField, useToast,
} from '../../components/ui';
import { IconCalendar, IconPlus } from '../../components/icons';
import { DAY_NAMES, TimetableGrid } from '../shared/TimetablePage';

/* ============================================================
   Teacher timetable — the week, plus slot management. A clash
   saves anyway but comes back as a warning: the room, the
   teacher, or shared students. The scheduler decides.
   ============================================================ */
export default function TeacherTimetable() {
  const qc = useQueryClient();
  const toast = useToast();

  const [addOpen, setAddOpen] = useState(false);
  const [error, setError] = useState('');
  const [warnings, setWarnings] = useState<SlotConflict[]>([]);
  const [removing, setRemoving] = useState<Slot | null>(null);

  const courses = useQuery({ queryKey: ['courses'], queryFn: () => api.get<Course[]>('/courses') });
  const timetable = useQuery({
    queryKey: ['my-timetable'],
    queryFn: () => api.get<Slot[]>('/me/timetable'),
  });

  const create = useMutation({
    mutationFn: ({ courseId, ...body }: { courseId: string } & Record<string, unknown>) =>
      api.post<{ slot: Slot; conflicts: SlotConflict[] }>(`/courses/${courseId}/slots`, body),
    onSuccess: ({ conflicts }) => {
      setAddOpen(false); setError('');
      setWarnings(conflicts);
      qc.invalidateQueries({ queryKey: ['my-timetable'] });
      toast.success('Class scheduled', conflicts.length ? 'With clashes — see the warning.' : undefined);
    },
    onError: (e) => setError(e instanceof Error ? e.message : 'Could not schedule the class.'),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.del(`/slots/${id}`),
    onSuccess: () => {
      setRemoving(null);
      qc.invalidateQueries({ queryKey: ['my-timetable'] });
      toast.success('Slot removed');
    },
    onError: (e) => toast.error('Could not remove', e instanceof Error ? e.message : undefined),
  });

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    const f = new FormData(e.currentTarget);
    create.mutate({
      courseId: String(f.get('courseId') ?? ''),
      dayOfWeek: Number(f.get('dayOfWeek') ?? 1),
      startTime: String(f.get('startTime') ?? ''),
      endTime: String(f.get('endTime') ?? ''),
      ...(String(f.get('room') ?? '').trim() ? { room: String(f.get('room')).trim() } : {}),
    });
  };

  return (
    <>
      <PageHeader
        title="Schedule"
        lede={timetable.data ? `${timetable.data.length} weekly ${timetable.data.length === 1 ? 'class' : 'classes'} · clashes are flagged, never blocked` : 'Your teaching week.'}
        actions={
          <Button size="lg" onClick={() => { setError(''); setAddOpen(true); }}>
            <IconPlus size={15} />Add class
          </Button>
        }
      />

      {warnings.length > 0 && (
        <Banner tone="warning" title="Schedule conflicts" action={
          <Button size="sm" variant="secondary" onClick={() => setWarnings([])}>Dismiss</Button>
        }>
          <ul style={{ margin: 0, paddingLeft: '1.1em' }}>
            {warnings.map((w, i) => <li key={i}>{w.detail}</li>)}
          </ul>
        </Banner>
      )}

      {timetable.isLoading ? (
        <Skeleton h={260} className="sk-block" />
      ) : timetable.isError ? (
        <ErrorState title="Could not load your timetable" onRetry={() => timetable.refetch()} />
      ) : !timetable.data?.length ? (
        <EmptyState
          icon={<IconCalendar size={18} />}
          title="No classes scheduled"
          description="Add your weekly classes so students see them in their timetable."
          action={<Button size="sm" onClick={() => setAddOpen(true)}><IconPlus size={14} />Add class</Button>}
        />
      ) : (
        <div className="ttb-frame">
          <TimetableGrid slots={timetable.data} onSlotClick={(s) => setRemoving(s)} />
        </div>
      )}

      <Drawer
        open={addOpen} onClose={() => setAddOpen(false)}
        title="Add a class"
        description="A weekly slot. Students enrolled in the course see it immediately."
      >
        <form className="form" onSubmit={submit}>
          {error && <Banner tone="error" title="Could not schedule">{error}</Banner>}
          <SelectField label="Course" name="courseId" required>
            {(courses.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}
          </SelectField>
          <SelectField label="Day" name="dayOfWeek" defaultValue="1">
            {[1, 2, 3, 4, 5, 6, 0].map((d) => <option key={d} value={d}>{DAY_NAMES[d]}</option>)}
          </SelectField>
          <div className="form-row">
            <TextField label="Starts" name="startTime" type="time" required defaultValue="09:00" />
            <TextField label="Ends" name="endTime" type="time" required defaultValue="10:30" />
          </div>
          <TextField label="Room" name="room" optional placeholder="e.g. LT-4" maxLength={80} />
          <div className="form-actions">
            <Button type="button" variant="secondary" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button type="submit" loading={create.isPending}>Schedule</Button>
          </div>
        </form>
      </Drawer>

      <ConfirmDialog
        open={!!removing}
        onClose={() => setRemoving(null)}
        onConfirm={() => removing && remove.mutate(removing.id)}
        loading={remove.isPending}
        destructive
        title={`Remove ${removing?.course?.code ?? 'this class'} on ${removing ? DAY_NAMES[removing.dayOfWeek] : ''}?`}
        description={removing ? `${removing.startTime}–${removing.endTime}${removing.room ? ` in ${removing.room}` : ''}. Students stop seeing it immediately.` : undefined}
        confirmLabel="Remove slot"
      />
    </>
  );
}
