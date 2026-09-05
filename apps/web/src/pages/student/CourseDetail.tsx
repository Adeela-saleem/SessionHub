import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { api } from '../../lib/api';
import type { ClassSession, Course, StudentAnalytics } from '../../lib/types';
import { usePageDetail } from '../../components/shell/AppShell';
import {
  Badge, Card, CardBody, CardHead, EmptyState, ErrorState, LinkButton,
  PageHeader, PanelRow, Skeleton, Stat, StatGrid,
} from '../../components/ui';
import { IconBroadcast, IconClock, IconUser } from '../../components/icons';
import { formatDate } from '../../lib/format';

/* ============================================================
   Course detail
   The course is the hero: what it is, who teaches it, how the
   person is tracking, and every session held so far.
   ============================================================ */
export default function StudentCourseDetail() {
  const { id } = useParams<{ id: string }>();

  const courses = useQuery({ queryKey: ['courses'], queryFn: () => api.get<Course[]>('/courses') });
  const sessions = useQuery({ queryKey: ['sessions'], queryFn: () => api.get<ClassSession[]>('/sessions') });
  const analytics = useQuery({
    queryKey: ['analytics', 'me'],
    queryFn: () => api.get<StudentAnalytics>('/analytics/me'),
  });

  const course = courses.data?.find((c) => c.id === id);
  usePageDetail(course?.code);

  const courseSessions = sessions.data?.filter((s) => s.courseId === id) ?? [];
  const stat = analytics.data?.perCourse.find((c) => c.course === course?.code);

  if (courses.isLoading) {
    return (
      <>
        <Skeleton h={28} w="40%" style={{ marginBottom: 'var(--s-4)' }} />
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

  return (
    <>
      <PageHeader
        eyebrow={course.department ?? 'Course'}
        title={course.name}
        lede={
          <span className="row-tight" style={{ flexWrap: 'wrap' }}>
            <Badge tone="accent">{course.code}</Badge>
            <span className="row-tight t-sm"><IconUser size={14} />{course.teacher?.name ?? 'Teacher not assigned'}</span>
          </span>
        }
        actions={live
          ? <LinkButton to="/student/live"><IconBroadcast size={16} />Join the live session</LinkButton>
          : undefined}
      />

      <StatGrid>
        <Stat label="Attendance" value={stat ? `${stat.rate}%` : '—'} foot={stat ? `${stat.attended} of ${stat.total} sessions` : 'No sessions yet'} />
        <Stat label="Sessions held" value={courseSessions.length} foot="In this course" />
        <Stat label="Questions asked" value={courseSessions.reduce((n, s) => n + (s._count?.questions ?? 0), 0)} foot="Across all sessions" />
        <Stat label="Status" value={live ? 'Live now' : 'Idle'} foot={live ? `Room ${live.roomCode}` : 'No session running'} />
      </StatGrid>

      <div className="section">
        <Card>
          <CardHead title="Session history" sub="Every class held in this course" />
          {sessions.isLoading ? (
            <CardBody><Skeleton h={80} className="sk-block" /></CardBody>
          ) : !courseSessions.length ? (
            <EmptyState
              tight
              icon={<IconClock size={20} />}
              title="No sessions yet"
              description="When your teacher runs the first live session for this course it will be recorded here."
            />
          ) : (
            <div>
              {courseSessions.map((s) => (
                <PanelRow key={s.id}>
                  <div className="grow" style={{ minWidth: 0 }}>
                    <div className="record-title t-clamp-1">{s.title ?? `${course.code} session`}</div>
                    <div className="record-meta">
                      Room {s.roomCode} · {s._count?.questions ?? 0} questions · {s._count?.attendance ?? 0} attended
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
        Enrolled since {formatDate(new Date())} · Contact your teacher for anything missing from this page.
      </p>
    </>
  );
}
