import { useEffect, useMemo, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../../lib/api';
import type { CourseModule, LessonDetail } from '../../lib/types';
import { usePageDetail } from '../../components/shell/AppShell';
import {
  Badge, Button, EmptyState, ErrorState, LinkButton, Progress, Skeleton, useToast,
} from '../../components/ui';
import {
  IconArrowLeft, IconArrowRight, IconCheck, IconCheckCircle, IconFile,
} from '../../components/icons';

/* ============================================================
   Lesson player
   Curriculum rail left, reading column centre. Position is
   saved as the student reads so the next visit resumes rather
   than restarts; the write is throttled so scrolling does not
   hammer the API.
   ============================================================ */
export default function LessonPlayer() {
  const { courseId, lessonId } = useParams<{ courseId: string; lessonId: string }>();
  const qc = useQueryClient();
  const toast = useToast();
  const navigate = useNavigate();
  const scroller = useRef<HTMLDivElement>(null);
  const lastSaved = useRef(0);

  const outline = useQuery({
    queryKey: ['outline', courseId],
    queryFn: () => api.get<CourseModule[]>(`/courses/${courseId}/outline`),
    enabled: !!courseId,
  });
  const lesson = useQuery({
    queryKey: ['lesson', lessonId],
    queryFn: () => api.get<LessonDetail>(`/lessons/${lessonId}`),
    enabled: !!lessonId,
  });

  usePageDetail(lesson.data?.title);

  const flat = useMemo(
    () => (outline.data ?? []).flatMap((m) => m.lessons.map((l) => ({ ...l, moduleTitle: m.title }))),
    [outline.data],
  );
  const index = flat.findIndex((l) => l.id === lessonId);
  const prev = index > 0 ? flat[index - 1] : null;
  const next = index >= 0 && index < flat.length - 1 ? flat[index + 1] : null;
  const done = flat.filter((l) => l.progress?.status === 'COMPLETED').length;

  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.patch(`/lessons/${lessonId}/progress`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['outline', courseId] });
      qc.invalidateQueries({ queryKey: ['lesson', lessonId] });
    },
  });

  // Mark as started on arrival, once per lesson.
  useEffect(() => {
    if (!lesson.data) return;
    if (!lesson.data.progress) {
      save.mutate({ status: 'IN_PROGRESS', percent: 0, positionSec: 0 });
    }
    // Restore the reading position from the previous visit.
    const pos = lesson.data.progress?.positionSec ?? 0;
    if (pos > 0 && scroller.current) scroller.current.scrollTop = pos;
    lastSaved.current = Date.now();
  }, [lesson.data?.id]);

  // Throttled position save — at most one write every 5 seconds.
  function onScroll() {
    const el = scroller.current;
    if (!el || !lesson.data || lesson.data.progress?.status === 'COMPLETED') return;
    if (Date.now() - lastSaved.current < 5000) return;
    lastSaved.current = Date.now();
    const reach = el.scrollHeight - el.clientHeight;
    const percent = reach > 0 ? Math.min(99, Math.round((el.scrollTop / reach) * 100)) : 0;
    save.mutate({ status: 'IN_PROGRESS', percent, positionSec: Math.round(el.scrollTop) });
  }

  if (lesson.isLoading || outline.isLoading) {
    return (
      <div className="learn">
        <Skeleton h={420} className="sk-block" />
        <Skeleton h={420} className="sk-block" />
      </div>
    );
  }
  if (lesson.isError) return <ErrorState onRetry={() => void lesson.refetch()} />;
  if (!lesson.data) {
    return (
      <EmptyState
        title="Lesson unavailable"
        description="This lesson may not be published yet, or you are not enrolled in the course."
        action={<LinkButton to="/student/courses" variant="secondary" size="sm">Back to my courses</LinkButton>}
      />
    );
  }

  const l = lesson.data;
  const completed = l.progress?.status === 'COMPLETED';

  return (
    <div className="learn">
      {/* ── Curriculum ─────────────────────────────── */}
      <aside className="learn-nav">
        <div className="learn-nav-head">
          <Link to={`/student/courses/${courseId}`} className="section-link"><IconArrowLeft />Course</Link>
          <span className="t-caption t-muted t-num">{done} of {flat.length} complete</span>
        </div>
        <Progress value={flat.length ? (done / flat.length) * 100 : 0} tone="success" label="Course progress" size="sm" />
        <div className="learn-list">
          {(outline.data ?? []).map((m) => (
            <div key={m.id}>
              <div className="learn-module">{m.title}</div>
              {m.lessons.map((x) => (
                <Link
                  key={x.id}
                  to={`/student/learn/${courseId}/${x.id}`}
                  className={`learn-item ${x.id === lessonId ? 'is-current' : ''}`.trim()}
                  aria-current={x.id === lessonId ? 'page' : undefined}
                >
                  <span className={`learn-tick ${x.progress?.status === 'COMPLETED' ? 'is-done' : ''}`.trim()}>
                    {x.progress?.status === 'COMPLETED' ? <IconCheck size={11} /> : null}
                  </span>
                  <span className="grow t-clamp-2">{x.title}</span>
                  {x.durationMin ? <span className="learn-mins">{x.durationMin}m</span> : null}
                </Link>
              ))}
            </div>
          ))}
        </div>
      </aside>

      {/* ── Content ────────────────────────────────── */}
      <div className="learn-main">
        <div className="learn-head">
          <span className="t-caption t-muted">{l.module.title} · Lesson {index + 1} of {flat.length}{l.durationMin ? ` · ${l.durationMin} min` : ''}</span>
          <div className="learn-title-row">
            <h1>{l.title}</h1>
            {completed
              ? <Badge tone="success" dot>Completed</Badge>
              : l.progress ? <Badge tone="info" dot>In progress</Badge> : null}
          </div>
        </div>

        <div className="learn-body" ref={scroller} onScroll={onScroll}>
          {l.type === 'VIDEO' || l.type === 'EMBED' ? (
            l.url ? (
              <div className="learn-embed">
                <iframe src={l.url} title={l.title} allowFullScreen loading="lazy" />
              </div>
            ) : (
              <EmptyState row bare title="No media attached" description="Your teacher has not added the video for this lesson yet." />
            )
          ) : null}

          {l.body ? (
            <div className="learn-prose">
              {l.body.split('\n').filter(Boolean).map((para, i) => <p key={i}>{para}</p>)}
            </div>
          ) : l.type === 'TEXT' ? (
            <EmptyState row bare title="No content yet" description="Your teacher has not written this lesson's content." />
          ) : null}

          {l.resources.length > 0 && (
            <div className="learn-resources">
              <span className="t-label">Resources</span>
              <ul>
                {l.resources.map((r) => (
                  <li key={r.id}>
                    <a href={r.url} target="_blank" rel="noreferrer noopener">
                      <IconFile size={15} />
                      <span className="grow">{r.title}</span>
                      <IconArrowRight size={14} />
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="learn-foot">
          {prev
            ? <LinkButton to={`/student/learn/${courseId}/${prev.id}`} variant="secondary"><IconArrowLeft size={15} />Previous</LinkButton>
            : <span />}

          <div className="row-tight">
            {!completed && (
              <Button
                loading={save.isPending}
                onClick={() => {
                  save.mutate({ status: 'COMPLETED', percent: 100 });
                  toast.success('Lesson complete', next ? 'Moving you to the next one.' : 'That was the last lesson.');
                  if (next) navigate(`/student/learn/${courseId}/${next.id}`);
                }}
              >
                <IconCheckCircle size={15} />Mark complete
              </Button>
            )}
            {next
              ? <LinkButton to={`/student/learn/${courseId}/${next.id}`} variant={completed ? 'primary' : 'secondary'}>Next<IconArrowRight size={15} /></LinkButton>
              : null}
          </div>
        </div>
      </div>
    </div>
  );
}
