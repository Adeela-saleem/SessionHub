import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import type { Course, StudentAnalytics } from '../../lib/types';
import {
  Badge, EmptyState, ErrorState, LinkButton, PageHeader, Progress,
  SearchInput, Segmented, Skeleton,
} from '../../components/ui';
import { IconArrowRight, IconBook, IconUsers } from '../../components/icons';

/* ============================================================
   My courses
   A catalogue view: what am I in, who teaches it, and how am I
   tracking. Filtering is one control, not a filter panel.
   ============================================================ */
export default function StudentCourses() {
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
        eyebrow="Learning"
        title="My courses"
        lede="Every course you are enrolled in, with your attendance in each."
      />

      <div className="toolbar-row">
        <SearchInput
          value={query}
          onValueChange={setQuery}
          placeholder="Search by code, title or teacher"
          className="toolbar-search"
        />
        <Segmented
          label="Sort courses"
          value={sort}
          onChange={setSort}
          options={[{ value: 'code', label: 'By code' }, { value: 'attendance', label: 'By attendance' }]}
        />
      </div>

      {courses.isLoading ? (
        <div className="course-grid">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} h={168} className="sk-block" />)}
        </div>
      ) : courses.isError ? (
        <ErrorState onRetry={() => void courses.refetch()} />
      ) : !courses.data?.length ? (
        <EmptyState
          icon={<IconBook size={20} />}
          title="You are not enrolled in anything yet"
          description="Courses appear here once an administrator or your teacher adds you to them. This usually happens in the first week of term."
        />
      ) : !list.length ? (
        <EmptyState
          tight
          title={`No courses match “${query}”`}
          description="Try a course code such as CS-204, or clear the search."
        />
      ) : (
        <div className="course-grid">
          {list.map((c) => {
            const stat = rateFor.get(c.code);
            return (
              <Link to={`/student/courses/${c.id}`} key={c.id} className="card card-link course-card">
                <div className="course-card-top">
                  <span className="course-code">{c.code}</span>
                  {c.department && <Badge tone="neutral">{c.department}</Badge>}
                </div>
                <h3 className="course-name t-clamp-2">{c.name}</h3>
                <p className="course-teacher">
                  <IconUsers size={14} />
                  {c.teacher?.name ?? 'Teacher not assigned'}
                </p>

                <div className="course-progress">
                  <div className="row-between">
                    <span className="t-caption t-muted">Attendance</span>
                    <span className="t-caption t-num">
                      {stat ? `${stat.attended} of ${stat.total} sessions` : 'No sessions yet'}
                    </span>
                  </div>
                  <Progress
                    value={stat?.rate ?? 0}
                    tone={!stat ? 'foundation' : stat.rate >= 75 ? 'success' : stat.rate >= 45 ? 'warning' : 'danger'}
                    label={`${c.code} attendance`}
                  />
                </div>

                <span className="course-cta">Open course<IconArrowRight size={14} /></span>
              </Link>
            );
          })}
        </div>
      )}

      {!!list.length && (
        <div className="section">
          <LinkButton to="/student/progress" variant="secondary" size="sm">
            See your full progress report
          </LinkButton>
        </div>
      )}
    </>
  );
}
