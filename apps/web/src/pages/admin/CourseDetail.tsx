import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { api, ApiError } from '../../lib/api';
import type { Course, RosterEntry } from '../../lib/types';
import { usePageDetail } from '../../components/shell/AppShell';
import {
  Avatar, Badge, Banner, Button, Card, CardHead, ConfirmDialog, DataTable,
  Drawer, EmptyState, ErrorState, LinkButton, PageHeader, Skeleton, Stat,
  StatGrid, TextField, useToast, type Column,
} from '../../components/ui';
import { IconPlus, IconTrash, IconUsers } from '../../components/icons';

/* ============================================================
   Course roster (admin)
   Same roster component a teacher sees, reached from the
   management table rather than from a course they own.
   ============================================================ */
export default function AdminCourseDetail() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const toast = useToast();

  const [enrolOpen, setEnrolOpen] = useState(false);
  const [enrolError, setEnrolError] = useState('');
  const [removing, setRemoving] = useState<RosterEntry | null>(null);

  const courses = useQuery({ queryKey: ['courses'], queryFn: () => api.get<Course[]>('/courses') });
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
      toast.success('Student enrolled');
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
        description="This course may have been deleted."
        action={<LinkButton to="/admin/courses" variant="secondary" size="sm">Back to courses</LinkButton>}
      />
    );
  }

  const columns: Column<RosterEntry>[] = [
    {
      key: 'name', header: 'Student', sortValue: (r) => r.student.name,
      cell: (r) => (
        <span className="row-tight">
          <Avatar name={r.student.name} size="sm" />
          <span className="cell-primary">{r.student.name}</span>
        </span>
      ),
    },
    { key: 'email', header: 'Email', sortValue: (r) => r.student.email, cell: (r) => r.student.email },
    {
      key: 'year', header: 'Year', width: '90px', sortValue: (r) => r.student.year ?? 0,
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
        lede={
          <span className="row-tight" style={{ flexWrap: 'wrap' }}>
            <Badge tone="accent">{course.code}</Badge>
            {course.teacher ? <span className="t-sm">Taught by {course.teacher.name}</span> : <Badge tone="warning">No teacher assigned</Badge>}
          </span>
        }
        actions={
          <Button variant="secondary" onClick={() => { setEnrolError(''); setEnrolOpen(true); }}>
            <IconPlus size={15} />Enrol a student
          </Button>
        }
      />

      <StatGrid>
        <Stat label="Students enrolled" value={roster.data?.length ?? course._count?.enrollments ?? 0} foot="On the roster" />
        <Stat label="Sessions held" value={course._count?.sessions ?? 0} foot="All time" />
        <Stat label="Teacher" value={course.teacher ? course.teacher.name.split(' ')[0]! : '—'} foot={course.teacher?.name ?? 'Assign one from the courses list'} />
        <Stat label="Department" value={course.department ?? '—'} foot="Faculty grouping" />
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
            pageSize={12}
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
                description="Enrol students by their account email. They can join this course's sessions immediately afterwards."
                action={<Button size="sm" onClick={() => setEnrolOpen(true)}><IconPlus size={14} />Enrol a student</Button>}
              />
            }
          />
        </Card>
      </div>

      <Drawer
        open={enrolOpen}
        onClose={() => setEnrolOpen(false)}
        title="Enrol a student"
        description={`Add someone to ${course.code} by their account email.`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setEnrolOpen(false)}>Cancel</Button>
            <Button form="admin-enrol" type="submit" loading={enrol.isPending}>Enrol student</Button>
          </>
        }
      >
        <form
          id="admin-enrol"
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
            hint="The student must already have an account. Teaching accounts cannot be enrolled as students."
          />
        </form>
      </Drawer>

      <ConfirmDialog
        open={!!removing}
        onClose={() => setRemoving(null)}
        onConfirm={() => removing && unenrol.mutate(removing.student.id)}
        title={`Remove ${removing?.student.name ?? 'this student'}?`}
        description="They lose access to this course's sessions. Attendance and marks already recorded are kept."
        confirmLabel="Remove from course"
        destructive
        loading={unenrol.isPending}
      />
    </>
  );
}
