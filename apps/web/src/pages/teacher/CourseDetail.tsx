import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { api, ApiError } from '../../lib/api';
import type { ClassSession, Course, RosterEntry } from '../../lib/types';
import { usePageDetail } from '../../components/shell/AppShell';
import {
  Avatar, Badge, Banner, Button, ConfirmDialog, DataTable, Drawer, EmptyState, ErrorState,
  LinkButton, PageHeader, SectionHead, SimpleTable, Skeleton, Stat, StatGrid, TextField,
  useToast, type Column,
} from '../../components/ui';
import { IconBook, IconBroadcast, IconPlus, IconTrash } from '../../components/icons';
import { formatDate, formatDayDate } from '../../lib/format';
import { AnnouncementsCard } from '../../features/announcements/AnnouncementsCard';

/** The courses and sessions endpoints return the full records; the
    shared types omit their timestamps, so they are re-declared here. */
type CourseRecord = Course & { createdAt?: string };
type SessionRecord = ClassSession & { startedAt?: string | null; createdAt?: string };

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

  const courses = useQuery({ queryKey: ['courses'], queryFn: () => api.get<CourseRecord[]>('/courses') });
  const sessions = useQuery({ queryKey: ['sessions'], queryFn: () => api.get<SessionRecord[]>('/sessions') });
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
        action={<LinkButton to="/teacher/courses" variant="secondary" size="sm">Back to courses</LinkButton>}
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
        <span className="cell-user">
          <Avatar name={r.student.name} size="sm" />
          <span className="cell-primary">{r.student.name}</span>
        </span>
      ),
    },
    { key: 'email', header: 'Email', sortValue: (r) => r.student.email, cell: (r) => r.student.email },
    {
      key: 'year', header: 'Year', width: 80, align: 'right',
      sortValue: (r) => r.student.year ?? 0,
      cell: (r) => (r.student.year ? r.student.year : <span className="cell-muted">—</span>),
    },
    {
      key: 'actions', header: <span className="sr-only">Actions</span>, align: 'right', width: 110,
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
        title={course.name}
        lede={<><span className="t-data">{course.code}</span>{course.department ? ` · ${course.department}` : ''}{course.createdAt ? ` · created ${formatDate(course.createdAt)}` : ''}</>}
        actions={
          <>
            <LinkButton to={`/teacher/courses/${id}/content`} variant="secondary">
              <IconBook size={15} />Content
            </LinkButton>
            <Button variant="secondary" onClick={() => { setEnrolError(''); setEnrolOpen(true); }}>
              <IconPlus size={15} />Enrol student
            </Button>
            <LinkButton to="/teacher/live" size="lg"><IconBroadcast size={15} />{live ? 'Resume session' : 'Start a session'}</LinkButton>
          </>
        }
      />

      {live && (
        <div className="now-strip">
          <span className="now-dot" aria-hidden="true" />
          <div className="grow">
            <span className="now-title">A session is live in this course</span>
            <span className="now-meta">Room <span className="t-data">{live.roomCode}</span> · {live._count?.attendance ?? 0} joined</span>
          </div>
          <LinkButton to="/teacher/live" size="sm" variant="secondary">Open classroom</LinkButton>
        </div>
      )}

      <StatGrid>
        <Stat label="Students" value={roster.data?.length ?? course._count?.enrollments ?? 0} foot="On the roster" />
        <Stat label="Sessions" value={courseSessions.length} foot="Held in this course" />
        <Stat
          label="Questions asked"
          value={courseSessions.reduce((n, s) => n + (s._count?.questions ?? 0), 0)}
          foot="Across all sessions"
        />
        <Stat
          label="Attendance"
          value={courseSessions.reduce((n, s) => n + (s._count?.attendance ?? 0), 0)}
          foot="Total joins"
        />
      </StatGrid>

      <section className="section">
        <SectionHead
          title="Roster"
          sub={roster.data ? `${roster.data.length} enrolled` : undefined}
          action={<Button size="sm" variant="secondary" onClick={() => { setEnrolError(''); setEnrolOpen(true); }}><IconPlus size={14} />Enrol</Button>}
        />
        <div className="table-frame">
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
                tight
                title="No students enrolled"
                description="Enrol students by their account email. They can join this course’s sessions as soon as they are on the roster."
                action={<Button size="sm" onClick={() => setEnrolOpen(true)}><IconPlus size={14} />Enrol a student</Button>}
              />
            }
          />
        </div>
      </section>

      <div className="split section">
        <section>
          <SectionHead title="Session history" sub={courseSessions.length ? `${courseSessions.length} sessions` : undefined} />
          {!courseSessions.length ? (
            <EmptyState
              row bare
              title="No sessions yet"
              description="Start your first session and it is recorded here with attendance and question counts."
            />
          ) : (
            <SimpleTable
              bare
              rows={courseSessions}
              getRowId={(s) => s.id}
              caption="Sessions in this course"
              columns={[
                { key: 'title', header: 'Session', cell: (s) => <span className="cell-primary t-clamp-1">{s.title ?? course.name}</span> },
                { key: 'date', header: 'Date', width: 130, cell: (s) => formatDayDate(s.startedAt ?? s.createdAt) },
                { key: 'att', header: 'Attended', width: 90, align: 'right', cell: (s) => s._count?.attendance ?? 0 },
                { key: 'q', header: 'Questions', width: 90, align: 'right', secondary: true, cell: (s) => s._count?.questions ?? 0 },
                { key: 'status', header: '', width: 90, align: 'right', cell: (s) => (
                  <Badge tone={s.status === 'LIVE' ? 'live' : s.status === 'CLOSED' ? 'neutral' : 'info'}>
                    {s.status === 'LIVE' ? 'Live' : s.status === 'CLOSED' ? 'Finished' : 'Scheduled'}
                  </Badge>
                ) },
              ]}
            />
          )}
        </section>

        <div>
          <AnnouncementsCard courseId={id!} canPost />
        </div>
      </div>

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
          className="form"
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
