import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../../lib/api';
import type { ClassSession, Course, CourseModule, Lesson, StudentAnalytics } from '../../lib/types';
import { usePageDetail } from '../../components/shell/AppShell';
import {
  Badge, EmptyState, ErrorState, LinkButton, PageHeader, SectionHead, SimpleTable, Skeleton,
  Stat, StatGrid,
} from '../../components/ui';
import { IconBroadcast, IconCheck } from '../../components/icons';
import { formatDayDate } from '../../lib/format';
import { AnnouncementsCard } from '../../features/announcements/AnnouncementsCard';

/** The sessions endpoint returns the full record; the shared type
    omits its timestamps, so they are re-declared here. */
type SessionRecord = ClassSession & { startedAt?: string | null; createdAt?: string };
type LessonRow = Lesson & { moduleTitle: string; index: number };

/* ============================================================
   Course detail
   What it is, who teaches it, how I am tracking, the curriculum
   as a table, and every session held so far.
   ============================================================ */
export default function StudentCourseDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const courses = useQuery({ queryKey: ['courses'], queryFn: () => api.get<Course[]>('/courses') });
  const sessions = useQuery({ queryKey: ['sessions'], queryFn: () => api.get<SessionRecord[]>('/sessions') });
  const analytics = useQuery({
    queryKey: ['analytics', 'me'],
    queryFn: () => api.get<StudentAnalytics>('/analytics/me'),
  });
  const outline = useQuery({
    queryKey: ['outline', id],
    queryFn: () => api.get<CourseModule[]>(`/courses/${id}/outline`),
    enabled: !!id,
  });

  const course = courses.data?.find((c) => c.id === id);
  usePageDetail(course?.code);

  const courseSessions = sessions.data?.filter((s) => s.courseId === id) ?? [];
  const stat = analytics.data?.perCourse.find((c) => c.course === course?.code);

  if (courses.isLoading) {
    return (
      <>
        <Skeleton h={22} w="40%" style={{ marginBottom: 'var(--s-4)' }} />
        <Skeleton h={200} className="sk-block" />
      </>
    );
  }
  if (courses.isError) return <ErrorState onRetry={() => void courses.refetch()} />;
  if (!course) {
    return (
      <EmptyState
        title="Course not found"
        description="This course may have been removed, or you are no longer enrolled in it."
        action={<LinkButton to="/student/courses" variant="secondary" size="sm">Back to my courses</LinkButton>}
      />
    );
  }

  const live = courseSessions.find((s) => s.status === 'LIVE');
  const lessons: LessonRow[] = (outline.data ?? []).flatMap((m) =>
    m.lessons.map((l) => ({ ...l, moduleTitle: m.title, index: 0 })))
    .map((l, i) => ({ ...l, index: i + 1 }));
  const resumeLesson = lessons.find((l) => l.progress?.status === 'IN_PROGRESS');
  const firstLesson = resumeLesson ?? lessons.find((l) => l.progress?.status !== 'COMPLETED') ?? lessons[0];
  const doneCount = lessons.filter((l) => l.progress?.status === 'COMPLETED').length;

  return (
    <>
      <PageHeader
        title={course.name}
        lede={[course.code, course.teacher?.name ?? 'Teacher not assigned', course.department].filter(Boolean).join(' · ')}
        actions={
          <>
            {firstLesson && (
              <LinkButton to={`/student/learn/${id}/${firstLesson.id}`} variant={live ? 'secondary' : 'primary'} size="lg">
                {resumeLesson ? 'Resume learning' : 'Start learning'}
              </LinkButton>
            )}
            {live && (
              <LinkButton to="/student/live" size="lg"><IconBroadcast size={15} />Join the live session</LinkButton>
            )}
          </>
        }
      />

      {live && (
        <div className="now-strip">
          <span className="now-dot" aria-hidden="true" />
          <div className="grow">
            <span className="now-title">A session is live in this course</span>
            <span className="now-meta">{live.title ?? course.name} · room <span className="t-data">{live.roomCode}</span></span>
          </div>
        </div>
      )}

      <StatGrid>
        <Stat label="Attendance" value={stat ? `${stat.rate}%` : '—'} foot={stat ? `${stat.attended} of ${stat.total} sessions` : 'No sessions yet'} />
        <Stat label="Sessions held" value={courseSessions.length} foot="In this course" />
        <Stat label="Questions asked" value={courseSessions.reduce((n, s) => n + (s._count?.questions ?? 0), 0)} foot="All sessions" />
        <Stat label="Lessons" value={lessons.length ? `${doneCount}/${lessons.length}` : '—'} foot={lessons.length ? 'Completed' : 'None published'} />
      </StatGrid>

      <div className="split section">
        <div>
          {/* ── Curriculum ─────────────────────────────── */}
          <section>
            <SectionHead
              title="Curriculum"
              sub={outline.data?.length ? `${lessons.length} lessons across ${outline.data.length} modules` : undefined}
            />
            {outline.isLoading ? (
              <Skeleton h={80} className="sk-block" />
            ) : !lessons.length ? (
              <EmptyState
                row bare
                title="No published content yet"
                description="Your teacher has not published lessons for this course. Live sessions can still run without them."
              />
            ) : (
              <SimpleTable
                bare
                className="tbl-wide"
                rows={lessons}
                getRowId={(l) => l.id}
                onRowClick={(l) => navigate(`/student/learn/${id}/${l.id}`)}
                caption="Lessons in this course"
                columns={[
                  { key: 'n', header: '#', width: 40, cell: (l) => <span className="cell-data">{l.index}</span> },
                  { key: 'title', header: 'Lesson', cell: (l) => (
                    <span className="lesson-cell">
                      <span className={`learn-tick ${l.progress?.status === 'COMPLETED' ? 'is-done' : ''}`.trim()}>
                        {l.progress?.status === 'COMPLETED' ? <IconCheck size={11} /> : null}
                      </span>
                      <span>
                        <Link to={`/student/learn/${id}/${l.id}`} className="cell-primary t-clamp-1">{l.title}</Link>
                        <span className="cell-sub">{l.moduleTitle}</span>
                      </span>
                    </span>
                  ) },
                  { key: 'type', header: 'Type', width: 90, secondary: true, cell: (l) => <span className="cell-muted">{l.type[0] + l.type.slice(1).toLowerCase()}</span> },
                  { key: 'mins', header: 'Length', width: 80, align: 'right', cell: (l) => l.durationMin ? `${l.durationMin} min` : <span className="cell-muted">—</span> },
                  { key: 'status', header: 'Progress', width: 110, align: 'right', cell: (l) => (
                    l.progress?.status === 'COMPLETED' ? <Badge tone="success">Done</Badge>
                    : l.progress?.status === 'IN_PROGRESS' ? <Badge tone="info">{l.progress.percent}% read</Badge>
                    : <span className="cell-muted">Not started</span>
                  ) },
                ]}
              />
            )}
          </section>

          {/* ── Sessions ───────────────────────────────── */}
          <section className="section">
            <SectionHead title="Session history" sub={courseSessions.length ? `${courseSessions.length} held` : undefined} />
            {sessions.isLoading ? (
              <Skeleton h={80} className="sk-block" />
            ) : !courseSessions.length ? (
              <EmptyState
                row bare
                title="No sessions yet"
                description="When your teacher runs the first live session for this course it is recorded here."
              />
            ) : (
              <SimpleTable
                bare
                className="tbl-wide"
                rows={courseSessions}
                getRowId={(s) => s.id}
                caption="Sessions held in this course"
                columns={[
                  { key: 'title', header: 'Session', cell: (s) => <span className="cell-primary t-clamp-1">{s.title ?? course.name}</span> },
                  { key: 'date', header: 'Date', width: 130, cell: (s) => formatDayDate(s.startedAt ?? s.createdAt) },
                  { key: 'q', header: 'Questions', width: 96, align: 'right', cell: (s) => s._count?.questions ?? 0 },
                  { key: 'att', header: 'Attended', width: 96, align: 'right', secondary: true, cell: (s) => s._count?.attendance ?? 0 },
                  { key: 'status', header: 'Status', width: 96, align: 'right', cell: (s) => (
                    s.status === 'LIVE' ? <Badge tone="live">Live</Badge>
                    : s.status === 'SCHEDULED' ? <Badge tone="info">Scheduled</Badge>
                    : <span className="cell-muted">Finished</span>
                  ) },
                ]}
              />
            )}
          </section>
        </div>

        <div>
          <AnnouncementsCard courseId={id!} canPost={false} />
        </div>
      </div>
    </>
  );
}
