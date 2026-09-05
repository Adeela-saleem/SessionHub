import type { IconName } from '../icons';
import type { Role } from '../../lib/types';

export interface NavItem {
  to: string;
  label: string;
  icon: IconName;
  /** Matches nested routes; the index route matches exactly. */
  end?: boolean;
  /** Key into the counts map supplied by the layout. */
  badge?: 'pending' | 'live';
}

/** A group's label is optional: the first group of every rail is
    unlabelled, because "Overview" above one item is noise. */
export interface NavGroup { label?: string; items: NavItem[] }

/* ============================================================
   Navigation is data, grouped by what the person is trying to
   do — not by which API happens to serve it. Every entry here
   is a route that exists; nothing is aspirational.
   ============================================================ */
export const NAV: Record<Role, NavGroup[]> = {
  STUDENT: [
    { items: [
      { to: '/student', label: 'Overview', icon: 'home', end: true },
      { to: '/student/live', label: 'Live session', icon: 'broadcast', badge: 'live' },
    ] },
    { label: 'Learn', items: [
      { to: '/student/courses', label: 'My courses', icon: 'book' },
      { to: '/student/timetable', label: 'Schedule', icon: 'calendar' },
      { to: '/student/assignments', label: 'Assignments', icon: 'clipboard' },
    ] },
    { label: 'Insight', items: [
      { to: '/student/grades', label: 'Grades', icon: 'award2' },
      { to: '/student/progress', label: 'Analytics', icon: 'chart' },
    ] },
  ],
  TEACHER: [
    { items: [
      { to: '/teacher', label: 'Overview', icon: 'home', end: true },
      { to: '/teacher/live', label: 'Live classroom', icon: 'broadcast', badge: 'live' },
    ] },
    { label: 'Teach', items: [
      { to: '/teacher/courses', label: 'Courses', icon: 'book' },
      { to: '/teacher/timetable', label: 'Schedule', icon: 'calendar' },
      { to: '/teacher/assignments', label: 'Assignments', icon: 'clipboard' },
    ] },
    { label: 'Author', items: [
      { to: '/teacher/studio', label: 'Quiz studio', icon: 'sparkle' },
      { to: '/teacher/paper', label: 'Exam paper', icon: 'file' },
    ] },
    { label: 'Insight', items: [
      { to: '/teacher/gradebook', label: 'Gradebook', icon: 'award2' },
      { to: '/teacher/analytics', label: 'Analytics', icon: 'chart' },
    ] },
  ],
  ADMIN: [
    { items: [
      { to: '/admin', label: 'Overview', icon: 'home', end: true },
    ] },
    { label: 'Manage', items: [
      { to: '/admin/users', label: 'People', icon: 'users' },
      { to: '/admin/approvals', label: 'Approvals', icon: 'userCheck', badge: 'pending' },
      { to: '/admin/courses', label: 'Courses', icon: 'book' },
    ] },
    { label: 'Oversight', items: [
      { to: '/admin/analytics', label: 'Analytics', icon: 'pie' },
      { to: '/admin/audit', label: 'Audit log', icon: 'shield' },
    ] },
  ],
};

/** Pinned to the bottom of the rail, below the primary groups. */
export const SECONDARY_NAV: Record<Role, NavItem[]> = {
  STUDENT: [{ to: '/student/settings', label: 'Settings', icon: 'settings' }],
  TEACHER: [{ to: '/teacher/settings', label: 'Settings', icon: 'settings' }],
  ADMIN:   [{ to: '/admin/settings', label: 'Settings', icon: 'settings' }],
};

/** The four destinations that reach the thumb bar on a phone. */
export const MOBILE_NAV: Record<Role, NavItem[]> = {
  STUDENT: [
    { to: '/student', label: 'Home', icon: 'home', end: true },
    { to: '/student/live', label: 'Live', icon: 'broadcast', badge: 'live' },
    { to: '/student/courses', label: 'Courses', icon: 'book' },
    { to: '/student/assignments', label: 'Tasks', icon: 'clipboard' },
  ],
  TEACHER: [
    { to: '/teacher', label: 'Home', icon: 'home', end: true },
    { to: '/teacher/live', label: 'Live', icon: 'broadcast', badge: 'live' },
    { to: '/teacher/courses', label: 'Courses', icon: 'book' },
    { to: '/teacher/analytics', label: 'Analytics', icon: 'chart' },
  ],
  ADMIN: [
    { to: '/admin', label: 'Home', icon: 'home', end: true },
    { to: '/admin/users', label: 'People', icon: 'users' },
    { to: '/admin/courses', label: 'Courses', icon: 'book' },
    { to: '/admin/analytics', label: 'Analytics', icon: 'pie' },
  ],
};

export const ROLE_LABEL: Record<Role, string> = {
  STUDENT: 'Student', TEACHER: 'Teacher', ADMIN: 'Administrator',
};

/** Every routable item, primary and secondary, for search and breadcrumbs. */
export function allNavItems(role: Role): NavItem[] {
  return [...NAV[role].flatMap((g) => g.items), ...SECONDARY_NAV[role]];
}
