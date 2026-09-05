import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../../lib/api';
import type { Course, User } from '../../lib/types';
import {
  Badge, Banner, Button, Card, CardHead, ConfirmDialog, DataTable, Drawer,
  EmptyState, Menu, MenuItem, MenuSep, PageHeader, SelectField, Stat, StatGrid,
  TextField, useToast, type Column,
} from '../../components/ui';
import { IconBook, IconEdit, IconMore, IconPlus, IconTrash } from '../../components/icons';

/* ============================================================
   Courses
   Creating and editing a course is a short, structured form,
   so it lives in a drawer beside the list rather than on a
   page of its own.
   ============================================================ */
export default function AdminCourses() {
  const qc = useQueryClient();
  const toast = useToast();

  const [editing, setEditing] = useState<Course | null | 'new'>(null);
  const [formError, setFormError] = useState('');
  const [removing, setRemoving] = useState<Course | null>(null);

  const courses = useQuery({ queryKey: ['courses'], queryFn: () => api.get<Course[]>('/courses') });
  const teachers = useQuery({
    queryKey: ['users', 'teachers'],
    queryFn: () => api.get<User[]>('/users?role=TEACHER&status=APPROVED&take=200'),
  });

  const done = (message: string) => {
    setEditing(null); setFormError('');
    qc.invalidateQueries({ queryKey: ['courses'] });
    qc.invalidateQueries({ queryKey: ['stats'] });
    toast.success(message);
  };

  const create = useMutation({
    mutationFn: (body: unknown) => api.post('/courses', body),
    onSuccess: () => done('Course created'),
    onError: (e) => setFormError(
      e instanceof ApiError
        ? e.status === 409 ? 'A course with that code already exists.' : e.message
        : 'Could not create that course.',
    ),
  });

  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: unknown }) => api.patch(`/courses/${id}`, body),
    onSuccess: () => done('Course updated'),
    onError: (e) => setFormError(e instanceof ApiError ? e.message : 'Could not save those changes.'),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.del(`/courses/${id}`),
    onSuccess: () => { setRemoving(null); qc.invalidateQueries({ queryKey: ['courses'] }); toast.success('Course deleted'); },
    onError: () => { setRemoving(null); toast.error('Could not delete that course', 'Courses with recorded sessions cannot be removed.'); },
  });

  const rows = courses.data ?? [];
  const unassigned = rows.filter((c) => !c.teacher).length;

  const columns: Column<Course>[] = [
    {
      key: 'code', header: 'Code', width: '120px', sortValue: (c) => c.code,
      cell: (c) => <Link to={`/admin/courses/${c.id}`} className="cell-primary mono">{c.code}</Link>,
    },
    {
      key: 'name', header: 'Course', sortValue: (c) => c.name,
      cell: (c) => <Link to={`/admin/courses/${c.id}`} className="cell-link">{c.name}</Link>,
    },
    {
      key: 'teacher', header: 'Teacher', sortValue: (c) => c.teacher?.name ?? '',
      cell: (c) => c.teacher?.name ?? <Badge tone="warning">Unassigned</Badge>,
    },
    {
      key: 'department', header: 'Department', sortValue: (c) => c.department ?? '',
      cell: (c) => c.department ?? <span className="t-muted">—</span>,
    },
    {
      key: 'students', header: 'Students', align: 'right', width: '110px',
      sortValue: (c) => c._count?.enrollments ?? 0,
      cell: (c) => c._count?.enrollments ?? 0,
    },
    {
      key: 'sessions', header: 'Sessions', align: 'right', width: '110px',
      sortValue: (c) => c._count?.sessions ?? 0,
      cell: (c) => c._count?.sessions ?? 0,
    },
    {
      key: 'actions', header: <span className="sr-only">Actions</span>, align: 'right', width: '64px',
      cell: (c) => (
        <Menu label={`Actions for ${c.code}`} trigger={<IconMore size={16} />}>
          {(close) => (
            <>
              <MenuItem icon={<IconEdit size={15} />} onClick={() => { close(); setFormError(''); setEditing(c); }}>
                Edit course
              </MenuItem>
              <MenuSep />
              <MenuItem danger icon={<IconTrash size={15} />} onClick={() => { close(); setRemoving(c); }}>
                Delete course
              </MenuItem>
            </>
          )}
        </Menu>
      ),
    },
  ];

  const editingCourse = editing === 'new' ? null : editing;

  return (
    <>
      <PageHeader
        eyebrow="Management"
        title="Courses"
        lede="Create courses, assign the teacher who runs them, and keep enrolment in one place."
        actions={
          <Button onClick={() => { setFormError(''); setEditing('new'); }}>
            <IconPlus size={16} />New course
          </Button>
        }
      />

      <StatGrid>
        <Stat label="Courses" value={rows.length} foot="On the platform" />
        <Stat label="Without a teacher" value={unassigned} foot={unassigned ? 'Cannot run sessions' : 'All assigned'} />
        <Stat label="Total enrolments" value={rows.reduce((n, c) => n + (c._count?.enrollments ?? 0), 0)} foot="Across all courses" />
        <Stat label="Sessions held" value={rows.reduce((n, c) => n + (c._count?.sessions ?? 0), 0)} foot="All time" />
      </StatGrid>

      <div className="section">
        <Card className="card-flush">
          <CardHead title="All courses" sub="Select a course to manage its roster" />
          <DataTable
            rows={rows}
            columns={columns}
            getRowId={(c) => c.id}
            loading={courses.isLoading}
            error={courses.isError || undefined}
            onRetry={() => void courses.refetch()}
            caption="All courses"
            search={{ placeholder: 'Search code, title, teacher or department', match: (c) => `${c.code} ${c.name} ${c.teacher?.name ?? ''} ${c.department ?? ''}` }}
            pageSize={12}
            mobileCard={(c) => (
              <Link to={`/admin/courses/${c.id}`} className="record">
                <div className="record-main">
                  <div className="record-title">{c.name}</div>
                  <div className="record-meta">{c.code} · {c.teacher?.name ?? 'Unassigned'}</div>
                </div>
                <span className="t-sm t-num t-muted">{c._count?.enrollments ?? 0}</span>
              </Link>
            )}
            empty={
              <EmptyState
                icon={<IconBook size={20} />}
                title="No courses yet"
                description="Create the first course so teachers can run sessions and students have something to enrol in."
                action={<Button size="sm" onClick={() => setEditing('new')}><IconPlus size={14} />Create a course</Button>}
              />
            }
          />
        </Card>
      </div>

      {/* ── Create / edit ─────────────────────────────── */}
      <Drawer
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editingCourse ? `Edit ${editingCourse.code}` : 'New course'}
        description={editingCourse
          ? 'Change the title, department or assigned teacher.'
          : 'Courses are identified by a short code that students recognise.'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditing(null)}>Cancel</Button>
            <Button form="course-form" type="submit" loading={create.isPending || update.isPending}>
              {editingCourse ? 'Save changes' : 'Create course'}
            </Button>
          </>
        }
      >
        <form
          id="course-form"
          className="col"
          onSubmit={(e: FormEvent<HTMLFormElement>) => {
            e.preventDefault();
            setFormError('');
            const f = new FormData(e.currentTarget);
            const body = {
              name: String(f.get('name')),
              department: String(f.get('department') || '') || undefined,
              teacherId: String(f.get('teacherId') || '') || undefined,
            };
            if (editingCourse) update.mutate({ id: editingCourse.id, body });
            else create.mutate({ ...body, code: String(f.get('code')).toUpperCase() });
          }}
        >
          {formError && <Banner tone="error" title="Could not save">{formError}</Banner>}

          {!editingCourse && (
            <TextField
              label="Course code" name="code" required maxLength={20}
              placeholder="CS-204"
              hint="Short and stable — this is what students type and teachers recognise. It cannot be changed later."
            />
          )}

          <TextField
            label="Course title" name="name" required maxLength={120}
            defaultValue={editingCourse?.name}
            placeholder="Database Systems"
          />

          <TextField
            label="Department" name="department" optional maxLength={80}
            defaultValue={editingCourse?.department ?? ''}
            placeholder="Computer Science"
          />

          <SelectField
            label="Assigned teacher" name="teacherId" optional
            defaultValue={editingCourse?.teacher?.id ?? ''}
            hint="Only approved teaching accounts can be assigned. A course without a teacher cannot run sessions."
          >
            <option value="">No teacher assigned</option>
            {teachers.data?.map((t) => (
              <option key={t.id} value={t.id}>{t.name} — {t.email}</option>
            ))}
          </SelectField>
        </form>
      </Drawer>

      <ConfirmDialog
        open={!!removing}
        onClose={() => setRemoving(null)}
        onConfirm={() => removing && remove.mutate(removing.id)}
        title={`Delete ${removing?.code ?? 'this course'}?`}
        description="Enrolments and session history for this course are removed with it. This cannot be undone."
        confirmLabel="Delete course"
        destructive
        loading={remove.isPending}
      />
    </>
  );
}
