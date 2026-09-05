import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { api, ApiError } from '../../lib/api';
import type { ClassSession, Course, RosterEntry } from '../../lib/types';
import { usePageDetail } from '../../components/shell/AppShell';
import {
  Avatar, Badge, Banner, Button, Card, CardHead, ConfirmDialog, DataTable,
  Drawer, EmptyState, ErrorState, LinkButton, PageHeader, PanelRow, Skeleton,
  Stat, StatGrid, TextField, useToast, type Column,
} from '../../components/ui';
import { IconBroadcast, IconClock, IconPlus, IconTrash, IconUsers } from '../../components/icons';
import { formatDate } from '../../lib/format';

/* ============================================================
   Course management
   Roster first — it is the thing a teacher actually maintains.
   Enrolment happens in a drawer so the list stays in view.
   ============================================================ */
export default function TeacherCourseDetail() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const toast = useToast();

  const [enrolOpen, setEnrolOpen] = useState(false);
  const [enrolError, setEnrolError] = useState('');
  const [removing, setRemoving] = useState<RosterEntry | null>(null);

  const courses = useQuery({ queryKey: ['courses'], queryFn: () => api.get<Course[]>('/courses') });
  const sessions = useQuery({ queryKey: ['sessions'], queryFn: () => api.get<ClassSession[]>('/sessions') });
  const roster = useQuery({
    queryKey: ['roster', id],
    queryFn: () => api.get<RosterEntry[]>(`/courses/${id}/roster`),
    enabled: !!id,
  });

  const course = courses.data?.find((c) => c.id === id);
  usePageDetail(course?.code);

  const enrol = useMutation({
    mutationFn: (email: string) => api.post(`/courses/${id}/enroll`, { email }),
    onSuccess: () => {
      setEnrolOpen(false); setEnrolError('');
      qc.invalidateQueries({ queryKey: ['roster', id] });
      qc.invalidateQueries({ queryKey: ['courses'] });
      toast.success('Student enrolled', 'They can join this course’s sessions immediately.');
    },
    onError: (e) => setEnrolError(
      e instanceof ApiError
        ? e.status === 409 ? 'That student is already enrolled in this course.' : e.message
        : 'Could not enrol that student.',
    ),
  });

  const unenrol = useMutation({
    mutationFn: (studentId: string) => api.del(`/courses/${id}/enroll/${studentId}`),
    onSuccess: () => {
      setRemoving(null);
      qc.invalidateQueries({ queryKey: ['roster', id] });
      qc.invalidateQueries({ queryKey: ['courses'] });
      toast.success('Student removed from the course');
    },
    onError: () => { setRemoving(null); toast.error('Could not remove that student'); },
  });

  if (courses.isLoading) return <Skeleton h={240} className="sk-block" />;
  if (courses.isError) return <ErrorState onRetry={() => void courses.refetch()} />;
  if (!course) {
    return (
      <EmptyState
        title="Course not found"
        description="This course may have been removed, or you are no longer assigned to it."
        action={<LinkButton to="/teacher/courses" variant="secondary" size="sm">Back to my courses</LinkButton>}
      />
    );
  }

  const courseSessions = sessions.data?.filter((s) => s.courseId === id) ?? [];
  const live = courseSessions.find((s) => s.status === 'LIVE');

  const columns: Column<RosterEntry>[] = [
    {
      key: 'name',
      header: 'Student',
      sortValue: (r) => r.student.name,
      cell: (r) => (
        <span className="row-tight">
          <Avatar name={r.student.name} size="sm" />
          <span className="cell-primary">{r.student.name}</span>
        </span>
      ),
    },
    { key: 'email', header: 'Email', sortValue: (r) => r.student.email, cell: (r) => r.student.email },
    {
      key: 'year', header: 'Year', width: '90px',
      sortValue: (r) => r.student.year ?? 0,
      cell: (r) => (r.student.year ? `Year ${r.student.year}` : '—'),
    },
    {
      key: 'actions', header: <span className="sr-only">Actions</span>, align: 'right', width: '110px',
      cell: (r) => (
        <span className="row-actions">
          <Button size="xs" variant="danger" onClick={() => setRemoving(r)}>
            <IconTrash size={13} />Remove
          </Button>
        </span>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow={course.department ?? 'Course'}
        title={course.name}
        lede={<Badge tone="accent">{course.code}</Badge>}
        actions={
          <>
            <Button variant="secondary" onClick={() => { setEnrolError(''); setEnrolOpen(true); }}>
              <IconPlus size={15} />Enrol a student
            </Button>
            <LinkButton to="/teacher/live"><IconBroadcast size={15} />{live ? 'Resume session' : 'Start a session'}</LinkButton>
          </>
        }
      />

      <StatGrid>
        <Stat label="Students enrolled" value={roster.data?.length ?? course._count?.enrollments ?? 0} foot="On the roster" />
        <Stat label="Sessions held" value={courseSessions.length} foot="In this course" />
        <Stat
          label="Questions asked"
          value={courseSessions.reduce((n, s) => n + (s._count?.questions ?? 0), 0)}
          foot="Across all sessions"
        />
        <Stat label="Status" value={live ? 'Live now' : 'Idle'} foot={live ? `Room ${live.roomCode}` : 'No session running'} />
      </StatGrid>

      <div className="section">
        <Card className="card-flush">
          <CardHead title="Roster" sub="Students enrolled in this course" />
          <DataTable
            rows={roster.data}
            columns={columns}
            getRowId={(r) => r.student.id}
            loading={roster.isLoading}
            error={roster.isError || undefined}
            onRetry={() => void roster.refetch()}
            caption="Enrolled students"
            search={{ placeholder: 'Search students', match: (r) => `${r.student.name} ${r.student.email}` }}
            pageSize={10}
            mobileCard={(r) => (
              <div className="record">
                <Avatar name={r.student.name} size="sm" />
                <div className="record-main">
                  <div className="record-title">{r.student.name}</div>
                  <div className="record-meta">{r.student.email}</div>
                </div>
                <Button size="xs" variant="danger" onClick={() => setRemoving(r)} aria-label={`Remove ${r.student.name}`}>
                  <IconTrash size={13} />
                </Button>
              </div>
            )}
            empty={
              <EmptyState
                icon={<IconUsers size={20} />}
                title="No students enrolled"
                description="Enrol students by their account email address. They can join this course’s sessions as soon as they are on the roster."
                action={<Button size="sm" onClick={() => setEnrolOpen(true)}><IconPlus size={14} />Enrol a student</Button>}
              />
            }
          />
        </Card>
      </div>

      <div className="section">
        <Card>
          <CardHead title="Session history" sub="Every class you have run in this course" />
          {!courseSessions.length ? (
            <EmptyState
              tight
              icon={<IconClock size={20} />}
              title="No sessions yet"
              description="Start your first session and it will be recorded here with attendance and question counts."
            />
          ) : (
            <div>
              {courseSessions.map((s) => (
                <PanelRow key={s.id}>
                  <div className="grow" style={{ minWidth: 0 }}>
                    <div className="record-title t-clamp-1">{s.title ?? `${course.code} session`}</div>
                    <div className="record-meta">
                      Room {s.roomCode} · {s._count?.attendance ?? 0} attended · {s._count?.questions ?? 0} questions
                    </div>
                  </div>
                  <Badge tone={s.status === 'LIVE' ? 'live' : s.status === 'CLOSED' ? 'neutral' : 'info'}>
                    {s.status === 'LIVE' ? 'Live' : s.status === 'CLOSED' ? 'Finished' : 'Scheduled'}
                  </Badge>
                </PanelRow>
              ))}
            </div>
          )}
        </Card>
      </div>

      <p className="t-caption t-muted" style={{ marginTop: 'var(--s-6)' }}>
        Course created {formatDate(new Date())} · Only an administrator can rename or reassign this course.
      </p>

      {/* ── Enrolment ─────────────────────────────────── */}
      <Drawer
        open={enrolOpen}
        onClose={() => setEnrolOpen(false)}
        title="Enrol a student"
        description={`Add someone to ${course.code} by their account email.`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setEnrolOpen(false)}>Cancel</Button>
            <Button form="enrol-form" type="submit" loading={enrol.isPending}>Enrol student</Button>
          </>
        }
      >
        <form
          id="enrol-form"
          className="col"
          onSubmit={(e: FormEvent<HTMLFormElement>) => {
            e.preventDefault();
            setEnrolError('');
            enrol.mutate(String(new FormData(e.currentTarget).get('email')));
          }}
        >
          {enrolError && <Banner tone="error" title="Could not enrol">{enrolError}</Banner>}
          <TextField
            label="Student email" name="email" type="email" required
            placeholder="student@university.edu"
            hint="The student must already have a SessionHub account. Teaching accounts cannot be enrolled."
          />
        </form>
      </Drawer>

      <ConfirmDialog
        open={!!removing}
        onClose={() => setRemoving(null)}
        onConfirm={() => removing && unenrol.mutate(removing.student.id)}
        title={`Remove ${removing?.student.name ?? 'this student'}?`}
        description="They will lose access to this course's sessions. Marks and attendance already recorded are kept."
        confirmLabel="Remove from course"
        destructive
        loading={unenrol.isPending}
      />
    </>
  );
}
