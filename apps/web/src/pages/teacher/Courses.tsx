import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../../lib/api';
import type { ClassSession, Course } from '../../lib/types';
import {
  Badge, EmptyState, ErrorState, LinkButton, PageHeader, SectionHead, SimpleTable, Skeleton,
} from '../../components/ui';
import { IconArrowRight, IconBroadcast } from '../../components/icons';

/* ============================================================
   Courses you teach
   One row per course: how many students, how many sessions,
   and whether anything is running right now.
   ============================================================ */
export default function TeacherCourses() {
  const navigate = useNavigate();
  const courses = useQuery({ queryKey: ['courses'], queryFn: () => api.get<Course[]>('/courses') });
  const sessions = useQuery({ queryKey: ['sessions'], queryFn: () => api.get<ClassSession[]>('/sessions') });

  const liveByCourse = new Set(
    sessions.data?.filter((s) => s.status === 'LIVE').map((s) => s.courseId) ?? [],
  );
  const list = [...(courses.data ?? [])].sort((a, b) => a.code.localeCompare(b.code));
  const students = list.reduce((n, c) => n + (c._count?.enrollments ?? 0), 0);

  return (
    <>
      <PageHeader
        title="Courses"
        lede={courses.data ? `${list.length} ${list.length === 1 ? 'course' : 'courses'} · ${students} enrolled students` : 'Every course assigned to you.'}
        actions={<LinkButton to="/teacher/live" size="lg"><IconBroadcast size={15} />Start a session</LinkButton>}
      />

      <section>
        <SectionHead title="Assigned to you" />
        {courses.isLoading ? (
          <Skeleton h={160} className="sk-block" />
        ) : courses.isError ? (
          <ErrorState onRetry={() => void courses.refetch()} />
        ) : !list.length ? (
          <EmptyState
            row bare
            title="No courses assigned to you"
            description="An administrator assigns teachers to courses. Once assigned, the course appears here and you can run sessions."
          />
        ) : (
          <SimpleTable
            bare
            rows={list}
            getRowId={(c) => c.id}
            onRowClick={(c) => navigate(`/teacher/courses/${c.id}`)}
            caption="Courses you teach"
            columns={[
              { key: 'code', header: 'Code', width: 96, cell: (c) => <span className="cell-data">{c.code}</span> },
              { key: 'name', header: 'Course', cell: (c) => <Link to={`/teacher/courses/${c.id}`} className="cell-primary">{c.name}</Link> },
              { key: 'dept', header: 'Department', width: 170, secondary: true, cell: (c) => c.department ?? <span className="cell-muted">—</span> },
              { key: 'students', header: 'Students', width: 96, align: 'right', cell: (c) => c._count?.enrollments ?? 0 },
              { key: 'sessions', header: 'Sessions', width: 96, align: 'right', cell: (c) => c._count?.sessions ?? 0 },
              { key: 'status', header: 'Status', width: 90, cell: (c) => (
                liveByCourse.has(c.id) ? <Badge tone="live">Live</Badge> : <span className="cell-muted">Idle</span>
              ) },
              { key: 'go', header: '', width: 100, align: 'right', cell: (c) => (
                <Link to={`/teacher/courses/${c.id}`} className="section-link">Manage<IconArrowRight /></Link>
              ) },
            ]}
          />
        )}
      </section>
    </>
  );
}
