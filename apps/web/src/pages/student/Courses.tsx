import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../../lib/api';
import type { Course, StudentAnalytics } from '../../lib/types';
import {
  EmptyState, ErrorState, PageHeader, Progress, SearchInput, Segmented, SimpleTable, Skeleton,
} from '../../components/ui';

/* ============================================================
   My courses
   A register: what am I in, who teaches it, how am I tracking.
   One table, one search, one sort — no card grid.
   ============================================================ */
export default function StudentCourses() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<'code' | 'attendance'>('code');

  const courses = useQuery({ queryKey: ['courses'], queryFn: () => api.get<Course[]>('/courses') });
  const analytics = useQuery({
    queryKey: ['analytics', 'me'],
    queryFn: () => api.get<StudentAnalytics>('/analytics/me'),
  });

  const rateFor = useMemo(() => {
    const map = new Map<string, { rate: number; attended: number; total: number }>();
    analytics.data?.perCourse.forEach((c) => map.set(c.course, c));
    return map;
  }, [analytics.data]);

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = (courses.data ?? []).filter((c) =>
      !q || `${c.code} ${c.name} ${c.teacher?.name ?? ''}`.toLowerCase().includes(q));
    return sort === 'code'
      ? [...base].sort((a, b) => a.code.localeCompare(b.code))
      : [...base].sort((a, b) => (rateFor.get(b.code)?.rate ?? 0) - (rateFor.get(a.code)?.rate ?? 0));
  }, [courses.data, query, sort, rateFor]);

  return (
    <>
      <PageHeader
        title="My courses"
        lede={courses.data ? `${courses.data.length} enrolled` : undefined}
      />

      <div className="toolbar">
        <SearchInput
          value={query}
          onValueChange={setQuery}
          placeholder="Search by code, title or teacher"
        />
        <div className="toolbar-end">
          <Segmented
            label="Sort courses"
            value={sort}
            onChange={setSort}
            options={[{ value: 'code', label: 'By code' }, { value: 'attendance', label: 'By attendance' }]}
          />
        </div>
      </div>

      {courses.isLoading ? (
        <Skeleton h={160} className="sk-block" />
      ) : courses.isError ? (
        <ErrorState onRetry={() => void courses.refetch()} />
      ) : !courses.data?.length ? (
        <EmptyState
          row bare
          title="You are not enrolled in anything yet"
          description="Courses appear here once an administrator or your teacher adds you to them."
        />
      ) : !list.length ? (
        <EmptyState
          row bare
          title={`No courses match “${query}”`}
          description="Try a course code such as CS-204, or clear the search."
        />
      ) : (
        <SimpleTable
          bare
          className="tbl-wide"
          rows={list}
          getRowId={(c) => c.id}
          onRowClick={(c) => navigate(`/student/courses/${c.id}`)}
          caption="Courses you are enrolled in"
          columns={[
            { key: 'code', header: 'Code', width: 96, cell: (c) => <span className="cell-data">{c.code}</span> },
            { key: 'name', header: 'Course', cell: (c) => (
              <span className="cell-stack">
                <Link to={`/student/courses/${c.id}`} className="cell-primary t-clamp-1">{c.name}</Link>
                {c.department && <span className="cell-sub">{c.department}</span>}
              </span>
            ) },
            { key: 'teacher', header: 'Teacher', width: 180, secondary: true, cell: (c) => c.teacher?.name ?? <span className="cell-muted">Unassigned</span> },
            { key: 'sessions', header: 'Sessions', width: 110, align: 'right', cell: (c) => {
              const s = rateFor.get(c.code);
              return s ? <span className="t-num">{s.attended} of {s.total}</span> : <span className="cell-muted">—</span>;
            } },
            { key: 'attendance', header: 'Attendance', width: 190, cell: (c) => {
              const s = rateFor.get(c.code);
              return s ? (
                <span className="cell-progress">
                  <Progress value={s.rate} tone={s.rate >= 75 ? 'success' : s.rate >= 45 ? 'warning' : 'danger'} label={`${c.code} attendance`} />
                  <span className="t-num">{s.rate}%</span>
                </span>
              ) : <span className="cell-muted">No sessions yet</span>;
            } },
          ]}
        />
      )}
    </>
  );
}
