import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { api, ApiError } from '../../lib/api';
import type { ContentStatus, Course, CourseModule, Lesson, LessonType } from '../../lib/types';
import { usePageDetail } from '../../components/shell/AppShell';
import {
  Badge, Banner, Button, ConfirmDialog, Drawer,
  EmptyState, ErrorState, LinkButton, Menu, MenuItem, MenuSep, PageHeader,
  SelectField, Skeleton, TextField, useToast,
  NumberField,
} from '../../components/ui';
import {
  IconBook, IconChevronDown, IconChevronUp, IconEdit, IconMore,
  IconPlus, IconTrash,
} from '../../components/icons';

/* ============================================================
   Course builder
   Modules hold lessons; both carry their own publish state, so a
   module can go live while individual lessons are still drafts.
   Ordering is explicit (move up / move down) rather than drag —
   it is keyboard-reachable and needs no pointer heuristics.
   ============================================================ */

const STATUS_TONE: Record<ContentStatus, 'success' | 'neutral' | 'info' | 'warning'> = {
  PUBLISHED: 'success', DRAFT: 'neutral', SCHEDULED: 'info', ARCHIVED: 'warning',
};

const LESSON_TYPES: { value: LessonType; label: string }[] = [
  { value: 'TEXT', label: 'Text / reading' },
  { value: 'VIDEO', label: 'Video' },
  { value: 'RESOURCE', label: 'Resources' },
  { value: 'EMBED', label: 'Embedded content' },
  { value: 'LIVE', label: 'Live session' },
];

export default function CourseBuilder() {
  const { id: courseId } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const toast = useToast();

  const [moduleDrawer, setModuleDrawer] = useState<CourseModule | 'new' | null>(null);
  const [lessonDrawer, setLessonDrawer] = useState<{ moduleId: string; lesson: Lesson | null } | null>(null);
  const [removing, setRemoving] = useState<{ kind: 'module' | 'lesson'; id: string; title: string } | null>(null);
  const [formError, setFormError] = useState('');
  const [open, setOpen] = useState<Record<string, boolean>>({});

  const courses = useQuery({ queryKey: ['courses'], queryFn: () => api.get<Course[]>('/courses') });
  const course = courses.data?.find((c) => c.id === courseId);
  usePageDetail(course?.code);

  const outline = useQuery({
    queryKey: ['outline', courseId],
    queryFn: () => api.get<CourseModule[]>(`/courses/${courseId}/outline`),
    enabled: !!courseId,
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ['outline', courseId] });
  const fail = (e: unknown, fallback: string) =>
    setFormError(e instanceof ApiError ? e.message : fallback);

  const saveModule = useMutation({
    mutationFn: (v: { id?: string; title: string; summary?: string }) =>
      v.id
        ? api.patch(`/modules/${v.id}`, { title: v.title, summary: v.summary })
        : api.post(`/courses/${courseId}/modules`, { title: v.title, summary: v.summary }),
    onSuccess: () => { setModuleDrawer(null); setFormError(''); refresh(); toast.success('Module saved'); },
    onError: (e) => fail(e, 'Could not save that module.'),
  });

  const saveLesson = useMutation({
    mutationFn: (v: { id?: string; moduleId: string; body: Record<string, unknown> }) =>
      v.id ? api.patch(`/lessons/${v.id}`, v.body) : api.post(`/modules/${v.moduleId}/lessons`, v.body),
    onSuccess: () => { setLessonDrawer(null); setFormError(''); refresh(); toast.success('Lesson saved'); },
    onError: (e) => fail(e, 'Could not save that lesson.'),
  });

  const setStatus = useMutation({
    mutationFn: (v: { kind: 'module' | 'lesson'; id: string; status: ContentStatus }) =>
      api.patch(`/${v.kind === 'module' ? 'modules' : 'lessons'}/${v.id}`, { status: v.status }),
    onSuccess: (_d, v) => { refresh(); toast.success(v.status === 'PUBLISHED' ? 'Published' : `Moved to ${v.status.toLowerCase()}`); },
    onError: () => toast.error('Could not change that status'),
  });

  const remove = useMutation({
    mutationFn: (v: { kind: 'module' | 'lesson'; id: string }) =>
      api.del(`/${v.kind === 'module' ? 'modules' : 'lessons'}/${v.id}`),
    onSuccess: () => { setRemoving(null); refresh(); toast.success('Deleted'); },
    onError: () => { setRemoving(null); toast.error('Could not delete that'); },
  });

  const reorder = useMutation({
    mutationFn: (v: { scope: 'modules' | 'lessons'; parentId: string; ids: string[] }) =>
      v.scope === 'modules'
        ? api.post(`/courses/${v.parentId}/modules/reorder`, { ids: v.ids })
        : api.post(`/modules/${v.parentId}/lessons/reorder`, { ids: v.ids }),
    onSuccess: refresh,
    onError: () => toast.error('Could not reorder'),
  });

  function move<T extends { id: string }>(list: T[], index: number, delta: number) {
    const next = [...list];
    const target = index + delta;
    if (target < 0 || target >= next.length) return null;
    [next[index], next[target]] = [next[target]!, next[index]!];
    return next.map((x) => x.id);
  }

  const modules = outline.data ?? [];
  const lessonCount = modules.reduce((n, m) => n + m.lessons.length, 0);
  const published = modules.filter((m) => m.status === 'PUBLISHED').length;

  if (courses.isLoading || outline.isLoading) return <Skeleton h={280} className="sk-block" />;
  if (outline.isError) return <ErrorState onRetry={() => void outline.refetch()} />;
  if (!course) {
    return (
      <EmptyState
        title="Course not found"
        description="This course may have been removed, or you are no longer assigned to it."
        action={<LinkButton to="/teacher/courses" variant="secondary" size="sm">Back to my courses</LinkButton>}
      />
    );
  }

  return (
    <>
      <PageHeader
        title="Course content"
        lede={<><span className="t-data">{course.code}</span> · {modules.length} {modules.length === 1 ? 'module' : 'modules'} · {lessonCount} {lessonCount === 1 ? 'lesson' : 'lessons'} · {published} published</>}
        actions={
          <>
            <LinkButton to={`/teacher/courses/${courseId}`} variant="secondary">Back to course</LinkButton>
            <Button size="lg" onClick={() => { setFormError(''); setModuleDrawer('new'); }}>
              <IconPlus size={15} />Add module
            </Button>
          </>
        }
      />

      {!modules.length ? (
        <EmptyState
          icon={<IconBook size={18} />}
          title="No content yet"
          description="Modules group your lessons. Add the first one, then build lessons inside it. Nothing is visible to students until you publish it."
          action={<Button size="sm" onClick={() => setModuleDrawer('new')}><IconPlus size={14} />Add module</Button>}
        />
      ) : (
        <div className="builder">
          {modules.map((m, mi) => {
            const expanded = open[m.id] ?? true;
            return (
              <section key={m.id} className="builder-module">
                <div className="builder-module-head">
                  <button type="button" className="builder-toggle" onClick={() => setOpen((o) => ({ ...o, [m.id]: !expanded }))} aria-expanded={expanded}>
                    {expanded ? <IconChevronUp size={15} /> : <IconChevronDown size={15} />}
                    <span className="builder-index">{String(mi + 1).padStart(2, '0')}</span>
                    <span className="grow" style={{ minWidth: 0 }}>
                      <span className="t-clamp-1">{m.title}</span>
                      <span className="builder-module-sub t-clamp-1">{m.summary ?? `${m.lessons.length} ${m.lessons.length === 1 ? 'lesson' : 'lessons'}`}</span>
                    </span>
                  </button>
                  <div className="builder-module-actions">
                      <Badge tone={STATUS_TONE[m.status]} dot>{m.status[0] + m.status.slice(1).toLowerCase()}</Badge>
                      <Button size="xs" variant="secondary"
                        onClick={() => setStatus.mutate({ kind: 'module', id: m.id, status: m.status === 'PUBLISHED' ? 'DRAFT' : 'PUBLISHED' })}>
                        {m.status === 'PUBLISHED' ? 'Unpublish' : 'Publish'}
                      </Button>
                      <Menu label={`Actions for ${m.title}`} trigger={<IconMore size={16} />}>
                        {(close) => (
                          <>
                            <MenuItem icon={<IconEdit size={15} />} onClick={() => { close(); setFormError(''); setModuleDrawer(m); }}>Edit module</MenuItem>
                            <MenuItem icon={<IconChevronUp size={15} />} onClick={() => { close(); const ids = move(modules, mi, -1); if (ids) reorder.mutate({ scope: 'modules', parentId: courseId!, ids }); }}>Move up</MenuItem>
                            <MenuItem icon={<IconChevronDown size={15} />} onClick={() => { close(); const ids = move(modules, mi, 1); if (ids) reorder.mutate({ scope: 'modules', parentId: courseId!, ids }); }}>Move down</MenuItem>
                            <MenuSep />
                            <MenuItem danger icon={<IconTrash size={15} />} onClick={() => { close(); setRemoving({ kind: 'module', id: m.id, title: m.title }); }}>Delete module</MenuItem>
                          </>
                        )}
                      </Menu>
                  </div>
                </div>

                {expanded && (
                  <>
                    {m.lessons.length > 0 && (
                      <ul className="builder-lessons">
                        {m.lessons.map((l, li) => (
                          <li key={l.id}>
                            <span className="builder-lesson-index">{mi + 1}.{li + 1}</span>
                            <span className="grow" style={{ minWidth: 0 }}>
                              <span className="builder-lesson-title">{l.title}</span>
                              <span className="builder-lesson-meta">
                                {LESSON_TYPES.find((t) => t.value === l.type)?.label}
                                {l.durationMin ? ` · ${l.durationMin} min` : ''}
                                {l._count ? ` · ${l._count.progress} started` : ''}
                              </span>
                            </span>
                            <Badge tone={STATUS_TONE[l.status]}>{l.status[0] + l.status.slice(1).toLowerCase()}</Badge>
                            <Button size="xs" variant="tertiary"
                              onClick={() => setStatus.mutate({ kind: 'lesson', id: l.id, status: l.status === 'PUBLISHED' ? 'DRAFT' : 'PUBLISHED' })}>
                              {l.status === 'PUBLISHED' ? 'Unpublish' : 'Publish'}
                            </Button>
                            <Menu label={`Actions for ${l.title}`} trigger={<IconMore size={15} />}>
                              {(close) => (
                                <>
                                  <MenuItem icon={<IconEdit size={15} />} onClick={() => { close(); setFormError(''); setLessonDrawer({ moduleId: m.id, lesson: l }); }}>Edit lesson</MenuItem>
                                  <MenuItem icon={<IconChevronUp size={15} />} onClick={() => { close(); const ids = move(m.lessons, li, -1); if (ids) reorder.mutate({ scope: 'lessons', parentId: m.id, ids }); }}>Move up</MenuItem>
                                  <MenuItem icon={<IconChevronDown size={15} />} onClick={() => { close(); const ids = move(m.lessons, li, 1); if (ids) reorder.mutate({ scope: 'lessons', parentId: m.id, ids }); }}>Move down</MenuItem>
                                  <MenuSep />
                                  <MenuItem danger icon={<IconTrash size={15} />} onClick={() => { close(); setRemoving({ kind: 'lesson', id: l.id, title: l.title }); }}>Delete lesson</MenuItem>
                                </>
                              )}
                            </Menu>
                          </li>
                        ))}
                      </ul>
                    )}
                    <div className="builder-add">
                      <Button size="sm" variant="secondary"
                        onClick={() => { setFormError(''); setLessonDrawer({ moduleId: m.id, lesson: null }); }}>
                        <IconPlus size={14} />Add lesson
                      </Button>
                    </div>
                  </>
                )}
              </section>
            );
          })}
        </div>
      )}

      {/* ── Module drawer ─────────────────────────────── */}
      <Drawer
        open={moduleDrawer !== null}
        onClose={() => setModuleDrawer(null)}
        title={moduleDrawer && moduleDrawer !== 'new' ? `Edit ${moduleDrawer.title}` : 'New module'}
        description="Modules group lessons into a teachable unit."
        footer={
          <>
            <Button variant="secondary" onClick={() => setModuleDrawer(null)}>Cancel</Button>
            <Button form="module-form" type="submit" loading={saveModule.isPending}>Save module</Button>
          </>
        }
      >
        <form id="module-form" className="form" onSubmit={(e: FormEvent<HTMLFormElement>) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          saveModule.mutate({
            id: moduleDrawer && moduleDrawer !== 'new' ? moduleDrawer.id : undefined,
            title: String(f.get('title')),
            summary: String(f.get('summary') || '') || undefined,
          });
        }}>
          {formError && <Banner tone="error" title="Could not save">{formError}</Banner>}
          <TextField label="Module title" name="title" required maxLength={120}
            defaultValue={moduleDrawer && moduleDrawer !== 'new' ? moduleDrawer.title : ''}
            placeholder="Relational Model" />
          <TextField label="Summary" name="summary" optional maxLength={500}
            defaultValue={moduleDrawer && moduleDrawer !== 'new' ? moduleDrawer.summary ?? '' : ''}
            hint="One line describing what this module covers." />
        </form>
      </Drawer>

      {/* ── Lesson drawer ─────────────────────────────── */}
      <Drawer
        open={lessonDrawer !== null}
        onClose={() => setLessonDrawer(null)}
        title={lessonDrawer?.lesson ? `Edit ${lessonDrawer.lesson.title}` : 'New lesson'}
        description="Students see this only once both the lesson and its module are published."
        footer={
          <>
            <Button variant="secondary" onClick={() => setLessonDrawer(null)}>Cancel</Button>
            <Button form="lesson-form" type="submit" loading={saveLesson.isPending}>Save lesson</Button>
          </>
        }
      >
        <form id="lesson-form" className="form" onSubmit={(e: FormEvent<HTMLFormElement>) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          const duration = String(f.get('durationMin') || '');
          saveLesson.mutate({
            id: lessonDrawer?.lesson?.id,
            moduleId: lessonDrawer!.moduleId,
            body: {
              title: String(f.get('title')),
              type: String(f.get('type')),
              body: String(f.get('body') || '') || undefined,
              url: String(f.get('url') || '') || undefined,
              durationMin: duration ? Number(duration) : undefined,
            },
          });
        }}>
          {formError && <Banner tone="error" title="Could not save">{formError}</Banner>}
          <TextField label="Lesson title" name="title" required maxLength={160}
            defaultValue={lessonDrawer?.lesson?.title ?? ''} placeholder="Introduction to relations" />
          <SelectField label="Type" name="type" defaultValue={lessonDrawer?.lesson?.type ?? 'TEXT'}>
            {LESSON_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </SelectField>
          <TextField label="Content" name="body" optional
            defaultValue={lessonDrawer?.lesson?.body ?? ''}
            hint="The lesson text students will read. Plain text or Markdown." />
          <TextField label="Link" name="url" optional
            defaultValue={lessonDrawer?.lesson?.url ?? ''}
            placeholder="https://…"
            hint="Video or embed URL, for video and embedded lessons." />
          <NumberField label="Estimated minutes" name="durationMin" min={1} max={600} optional
            defaultValue={lessonDrawer?.lesson?.durationMin ?? ''} />
        </form>
      </Drawer>

      <ConfirmDialog
        open={!!removing}
        onClose={() => setRemoving(null)}
        onConfirm={() => removing && remove.mutate({ kind: removing.kind, id: removing.id })}
        title={`Delete ${removing?.title ?? 'this'}?`}
        description={removing?.kind === 'module'
          ? 'Every lesson inside this module is deleted with it, along with student progress on them. This cannot be undone.'
          : 'Student progress on this lesson is deleted with it. This cannot be undone.'}
        confirmLabel="Delete"
        destructive
        loading={remove.isPending}
      />
    </>
  );
}
