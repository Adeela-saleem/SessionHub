import { useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../../lib/api';
import type { Assignment, Course, GradeCategory } from '../../lib/types';
import { MAX_MARKS } from '../../lib/limits';
import {
  Badge, Banner, Button, Checkbox, DataTable, Drawer, EmptyState,
  PageHeader, Select, SelectField, TextField, TextareaField, useToast,
  type Column,
  NumberField,
} from '../../components/ui';
import { IconClipboard, IconPlus } from '../../components/icons';
import { formatDate } from '../../lib/format';

function statusBadge(a: Assignment) {
  if (a.status === 'PUBLISHED') return <Badge tone="success">Published</Badge>;
  if (a.status === 'SCHEDULED') return <Badge tone="info">Scheduled</Badge>;
  if (a.status === 'ARCHIVED') return <Badge tone="neutral">Archived</Badge>;
  return <Badge tone="neutral">Draft</Badge>;
}

/* ============================================================
   Teacher assignments — every assignment across every course,
   filterable by course. Creation happens in a drawer; grading
   lives on the assignment's own page.
   ============================================================ */
export default function TeacherAssignments() {
  const qc = useQueryClient();
  const toast = useToast();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const courseFilter = params.get('course') ?? '';

  const [createOpen, setCreateOpen] = useState(false);
  const [error, setError] = useState('');

  const courses = useQuery({ queryKey: ['courses'], queryFn: () => api.get<Course[]>('/courses') });

  const courseIds = useMemo(
    () => (courseFilter ? [courseFilter] : (courses.data ?? []).map((c) => c.id)),
    [courseFilter, courses.data],
  );

  const assignments = useQuery({
    queryKey: ['teacher-assignments', courseIds],
    enabled: courseIds.length > 0,
    queryFn: async () => {
      const lists = await Promise.all(
        courseIds.map((id) => api.get<Assignment[]>(`/courses/${id}/assignments`)),
      );
      const byCourse = new Map((courses.data ?? []).map((c) => [c.id, c]));
      return lists
        .flat()
        .map((a) => ({ ...a, course: a.course ?? byCourse.get(a.courseId) as never }))
        .sort((x, y) => new Date(y.dueAt).getTime() - new Date(x.dueAt).getTime());
    },
  });

  const columns: Column<Assignment>[] = [
    {
      key: 'title', header: 'Assignment',
      cell: (a) => (
        <Link to={`/teacher/assignments/${a.id}`} className="cell-primary t-clamp-1">{a.title}</Link>
      ),
      sortValue: (a) => a.title,
    },
    { key: 'course', header: 'Course', width: 96, cell: (a) => <span className="cell-data">{(a.course as Course | undefined)?.code}</span>, sortValue: (a) => (a.course as Course | undefined)?.code ?? '' },
    { key: 'due', header: 'Due', width: 130, cell: (a) => formatDate(a.dueAt), sortValue: (a) => a.dueAt },
    { key: 'marks', header: 'Marks', width: 72, align: 'right', cell: (a) => a.maxMarks, secondary: true },
    {
      key: 'submissions', header: 'Submitted', width: 96, align: 'right',
      cell: (a) => a._count?.submissions ?? 0,
      sortValue: (a) => a._count?.submissions ?? 0,
    },
    { key: 'status', header: 'Status', width: 110, cell: statusBadge },
  ];

  const list = assignments.data ?? [];

  return (
    <>
      <PageHeader
        title="Assignments"
        lede={assignments.data ? `${list.length} ${list.length === 1 ? 'assignment' : 'assignments'}${courseFilter ? ' in this course' : ' across your courses'}` : 'Set work, collect submissions and grade them.'}
        actions={
          <Button size="lg" onClick={() => { setError(''); setCreateOpen(true); }}>
            <IconPlus size={15} />New assignment
          </Button>
        }
      />

      <div className="toolbar">
        <Select
          aria-label="Filter by course"
          value={courseFilter}
          style={{ width: 'auto', maxWidth: 320 }}
          onChange={(e) => {
            const v = e.target.value;
            setParams(v ? { course: v } : {});
          }}
        >
          <option value="">All courses</option>
          {(courses.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}
        </Select>
      </div>

      <div className="table-frame">
      <DataTable
        columns={columns}
        rows={list}
        getRowId={(a) => a.id}
        loading={assignments.isLoading || courses.isLoading}
        error={assignments.error}
        onRetry={() => assignments.refetch()}
        caption="Assignments"
        empty={
          <EmptyState
            icon={<IconClipboard size={18} />}
            title="No assignments yet"
            description="Create one and publish it when it's ready — students are notified the moment it goes live."
            action={<Button onClick={() => setCreateOpen(true)}><IconPlus size={15} />New assignment</Button>}
          />
        }
        mobileCard={(a) => (
          <Link to={`/teacher/assignments/${a.id}`} className="record">
            <span className="record-main">
              <span className="record-title">{a.title}</span>
              <span className="record-meta" style={{ display: 'block' }}>
                {(a.course as Course | undefined)?.code} · due {formatDate(a.dueAt)} · {a._count?.submissions ?? 0} submitted
              </span>
            </span>
            {statusBadge(a)}
          </Link>
        )}
      />
      </div>

      <CreateAssignmentDrawer
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        courses={courses.data ?? []}
        defaultCourseId={courseFilter}
        error={error}
        setError={setError}
        onCreated={(id) => {
          setCreateOpen(false);
          qc.invalidateQueries({ queryKey: ['teacher-assignments'] });
          toast.success('Assignment created', 'It starts as a draft — publish it when ready.');
          navigate(`/teacher/assignments/${id}`);
        }}
      />
    </>
  );
}

export function CreateAssignmentDrawer({ open, onClose, courses, defaultCourseId, error, setError, onCreated }: {
  open: boolean; onClose: () => void;
  courses: Course[]; defaultCourseId?: string;
  error: string; setError: (e: string) => void;
  onCreated: (id: string) => void;
}) {
  const [courseId, setCourseId] = useState(defaultCourseId || '');
  const effectiveCourse = courseId || defaultCourseId || courses[0]?.id || '';

  const categories = useQuery({
    queryKey: ['grade-categories', effectiveCourse],
    enabled: open && !!effectiveCourse,
    queryFn: () => api.get<GradeCategory[]>(`/courses/${effectiveCourse}/grade-categories`),
  });

  const create = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api.post<Assignment>(`/courses/${effectiveCourse}/assignments`, body),
    onSuccess: (a) => onCreated(a.id),
    onError: (e) => setError(e instanceof Error ? e.message : 'Could not create the assignment.'),
  });

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    const f = new FormData(e.currentTarget);
    const due = String(f.get('dueDate') ?? '');
    const dueTime = String(f.get('dueTime') ?? '23:59');
    if (!effectiveCourse) { setError('Pick a course first.'); return; }
    if (!due) { setError('Set a due date.'); return; }
    const maxMarks = Number(f.get('maxMarks') ?? 100);
    if (!Number.isInteger(maxMarks) || maxMarks < 1 || maxMarks > MAX_MARKS) {
      setError(`Maximum marks must be a whole number between 1 and ${MAX_MARKS}.`);
      return;
    }
    create.mutate({
      title: String(f.get('title') ?? ''),
      instructions: String(f.get('instructions') ?? ''),
      maxMarks,
      dueAt: new Date(`${due}T${dueTime}`).toISOString(),
      ...(f.get('categoryId') ? { categoryId: String(f.get('categoryId')) } : {}),
      allowLate: f.get('allowLate') === 'on',
      resubmissions: f.get('resubmissions') === 'on',
    });
  };

  return (
    <Drawer open={open} onClose={onClose} title="New assignment" description="It stays a draft until you publish it.">
      <form id="create-assignment" onSubmit={submit} className="form">
        {error && <Banner tone="error" title="Could not create">{error}</Banner>}
        <SelectField label="Course" value={effectiveCourse} onChange={(e) => setCourseId(e.target.value)} required>
          {courses.map((c) => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}
        </SelectField>
        <TextField label="Title" name="title" required minLength={2} maxLength={200} placeholder="e.g. ER modelling exercise" />
        <TextareaField label="Instructions" name="instructions" required rows={6}
          hint="What students should do and how you'll mark it. Plain text or Markdown." />
        <div className="form-row">
          <TextField label="Due date" name="dueDate" type="date" required />
          <TextField label="Due time" name="dueTime" type="time" defaultValue="23:59" />
        </div>
        <div className="form-row">
          <NumberField label="Maximum marks" name="maxMarks" required min={1} max={MAX_MARKS} defaultValue={100} hint={`Up to ${MAX_MARKS}.`} />
          <SelectField label="Grade category" name="categoryId" hint={categories.data?.length ? undefined : 'Set up categories in the gradebook to weight this.'}>
            <option value="">None</option>
            {(categories.data ?? []).filter((c) => c.kind === 'ASSIGNMENTS').map((c) => (
              <option key={c.id} value={c.id}>{c.name} ({c.weightPct}%)</option>
            ))}
          </SelectField>
        </div>
        <Checkbox name="allowLate" defaultChecked label="Accept late submissions" />
        <Checkbox name="resubmissions" label="Allow resubmission before grading" />
        <div className="form-actions">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={create.isPending}>Create draft</Button>
        </div>
      </form>
    </Drawer>
  );
}
