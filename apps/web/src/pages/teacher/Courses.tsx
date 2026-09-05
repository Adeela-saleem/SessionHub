import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import type { ClassSession, Course } from '../../lib/types';
import {
  Badge, EmptyState, ErrorState, LinkButton, PageHeader, Skeleton,
} from '../../components/ui';
import { IconArrowRight, IconBook, IconBroadcast, IconUsers } from '../../components/icons';

/* ============================================================
   Courses you teach
   Each card answers the two questions a teacher has before a
   class: how many students, and is anything running.
   ============================================================ */
export default function TeacherCourses() {
  const courses = useQuery({ queryKey: ['courses'], queryFn: () => api.get<Course[]>('/courses') });
  const sessions = useQuery({ queryKey: ['sessions'], queryFn: () => api.get<ClassSession[]>('/sessions') });

  const liveByCourse = new Set(
    sessions.data?.filter((s) => s.status === 'LIVE').map((s) => s.courseId) ?? [],
  );

  return (
    <>
      <PageHeader
        eyebrow="Teaching"
        title="My courses"
        lede="Every course assigned to you, with enrolment and session history."
        actions={<LinkButton to="/teacher/live"><IconBroadcast size={16} />Start a session</LinkButton>}
      />

      {courses.isLoading ? (
        <div className="course-grid">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} h={168} className="sk-block" />)}
        </div>
      ) : courses.isError ? (
        <ErrorState onRetry={() => void courses.refetch()} />
      ) : !courses.data?.length ? (
        <EmptyState
          icon={<IconBook size={20} />}
          title="No courses assigned to you"
          description="An administrator assigns teachers to courses. Once you are assigned, the course appears here and you can start running sessions."
        />
      ) : (
        <div className="course-grid">
          {courses.data.map((c) => (
            <Link key={c.id} to={`/teacher/courses/${c.id}`} className="card card-link course-card">
              <div className="course-card-top">
                <span className="course-code">{c.code}</span>
                {liveByCourse.has(c.id) ? <Badge tone="live">Live</Badge>
                  : c.department ? <Badge tone="neutral">{c.department}</Badge> : null}
              </div>
              <h3 className="course-name t-clamp-2">{c.name}</h3>

              <dl className="course-facts">
                <div>
                  <dt><IconUsers size={13} />Students</dt>
                  <dd className="t-num">{c._count?.enrollments ?? 0}</dd>
                </div>
                <div>
                  <dt><IconBroadcast size={13} />Sessions</dt>
                  <dd className="t-num">{c._count?.sessions ?? 0}</dd>
                </div>
              </dl>

              <span className="course-cta">Manage course<IconArrowRight size={14} /></span>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
