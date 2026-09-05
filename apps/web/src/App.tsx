import { lazy, Suspense, type ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './lib/auth';
import { homeFor } from './lib/routes';
import type { Role } from './lib/types';
import { Skeleton } from './components/ui';

import Landing from './pages/landing/Landing';
import AuthPage from './pages/AuthPage';
import NotFound from './pages/NotFound';
import Settings from './pages/shared/Settings';

import StudentLayout from './pages/student/StudentLayout';
import StudentDashboard from './pages/student/Dashboard';
import StudentLiveSession from './pages/student/LiveSession';
import StudentCourses from './pages/student/Courses';
import StudentCourseDetail from './pages/student/CourseDetail';
import LessonPlayer from './pages/student/LessonPlayer';
import StudentAssignments from './pages/student/Assignments';
import StudentAssignmentDetail from './pages/student/AssignmentDetail';
import StudentGrades from './pages/student/Grades';
import TimetablePage from './pages/shared/TimetablePage';

import TeacherLayout from './pages/teacher/TeacherLayout';
import TeacherDashboard from './pages/teacher/Dashboard';
import TeacherLiveControl from './pages/teacher/LiveControl';
import TeacherCourses from './pages/teacher/Courses';
import TeacherCourseDetail from './pages/teacher/CourseDetail';
import CourseBuilder from './pages/teacher/CourseBuilder';
import TeacherAssignments from './pages/teacher/Assignments';
import TeacherAssignmentDetail from './pages/teacher/AssignmentDetail';
import TeacherGradebook from './pages/teacher/Gradebook';
import TeacherTimetable from './pages/teacher/Timetable';

import AdminLayout from './pages/admin/AdminLayout';
import AdminDashboard from './pages/admin/Dashboard';
import AdminUsers from './pages/admin/Users';
import AdminApprovals from './pages/admin/Approvals';
import AdminCourses from './pages/admin/Courses';
import AdminCourseDetail from './pages/admin/CourseDetail';
import AdminAuditLog from './pages/admin/AuditLog';

/* Chart-heavy screens pull in Recharts, so they load on demand. */
const StudentProgress = lazy(() => import('./pages/student/Progress'));
const TeacherAnalytics = lazy(() => import('./pages/teacher/Analytics'));
const TeacherQuizStudio = lazy(() => import('./pages/teacher/QuizStudio'));
const PaperGenerator = lazy(() => import('./pages/teacher/PaperGenerator'));
const AdminAnalytics = lazy(() => import('./pages/admin/Analytics'));

/** Client-side routing is a convenience. The API enforces every rule. */
function Protected({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <BootSkeleton />;
  if (!user) return <Navigate to="/auth" replace />;
  if (!roles.includes(user.role)) return <Navigate to={homeFor(user.role)} replace />;
  return <>{children}</>;
}

function BootSkeleton() {
  return (
    <div className="boot">
      <div className="boot-mark" aria-hidden="true">S</div>
      <Skeleton w={180} h={10} radius={999} />
      <span className="sr-only">Loading SessionHub</span>
    </div>
  );
}

function PageFallback() {
  return (
    <div className="col" aria-hidden="true">
      <Skeleton h={28} w="30%" />
      <Skeleton h={96} className="sk-block" />
      <Skeleton h={280} className="sk-block" />
    </div>
  );
}

export default function App() {
  const { user } = useAuth();

  return (
    <Suspense fallback={<PageFallback />}>
      <Routes>
        <Route path="/" element={user ? <Navigate to={homeFor(user.role)} replace /> : <Landing />} />
        <Route path="/auth" element={user ? <Navigate to={homeFor(user.role)} replace /> : <AuthPage />} />

        {/* ── Student ─────────────────────────────────── */}
        <Route path="/student" element={<Protected roles={['STUDENT']}><StudentLayout /></Protected>}>
          <Route index element={<StudentDashboard />} />
          <Route path="live" element={<StudentLiveSession />} />
          <Route path="courses" element={<StudentCourses />} />
          <Route path="courses/:id" element={<StudentCourseDetail />} />
          <Route path="learn/:courseId/:lessonId" element={<LessonPlayer />} />
          <Route path="assignments" element={<StudentAssignments />} />
          <Route path="assignments/:id" element={<StudentAssignmentDetail />} />
          <Route path="grades" element={<StudentGrades />} />
          <Route path="timetable" element={<TimetablePage />} />
          <Route path="progress" element={<StudentProgress />} />
          <Route path="settings" element={<Settings />} />
          <Route path="*" element={<NotFound />} />
        </Route>

        {/* ── Teacher ─────────────────────────────────── */}
        <Route path="/teacher" element={<Protected roles={['TEACHER']}><TeacherLayout /></Protected>}>
          <Route index element={<TeacherDashboard />} />
          <Route path="live" element={<TeacherLiveControl />} />
          <Route path="courses" element={<TeacherCourses />} />
          <Route path="courses/:id" element={<TeacherCourseDetail />} />
          <Route path="courses/:id/content" element={<CourseBuilder />} />
          <Route path="assignments" element={<TeacherAssignments />} />
          <Route path="assignments/:id" element={<TeacherAssignmentDetail />} />
          <Route path="gradebook" element={<TeacherGradebook />} />
          <Route path="timetable" element={<TeacherTimetable />} />
          <Route path="studio" element={<TeacherQuizStudio />} />
          <Route path="paper" element={<PaperGenerator />} />
          <Route path="analytics" element={<TeacherAnalytics />} />
          <Route path="settings" element={<Settings />} />
          <Route path="*" element={<NotFound />} />
        </Route>

        {/* ── Admin ───────────────────────────────────── */}
        <Route path="/admin" element={<Protected roles={['ADMIN']}><AdminLayout /></Protected>}>
          <Route index element={<AdminDashboard />} />
          <Route path="users" element={<AdminUsers />} />
          <Route path="approvals" element={<AdminApprovals />} />
          <Route path="courses" element={<AdminCourses />} />
          <Route path="courses/:id" element={<AdminCourseDetail />} />
          <Route path="audit" element={<AdminAuditLog />} />
          <Route path="analytics" element={<AdminAnalytics />} />
          <Route path="settings" element={<Settings />} />
          <Route path="*" element={<NotFound />} />
        </Route>

        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  );
}
