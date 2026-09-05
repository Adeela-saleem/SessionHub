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

export interface NavGroup { label: string; items: NavItem[] }

/* ============================================================
   Navigation is data, grouped by what the person is trying to
   do — not by which API happens to serve it.
   ============================================================ */
export const NAV: Record<Role, NavGroup[]> = {
  STUDENT: [
    { label: 'Overview', items: [
      { to: '/student', label: 'Dashboard', icon: 'home', end: true },
    ] },
    { label: 'Learning', items: [
      { to: '/student/live', label: 'Live session', icon: 'broadcast', badge: 'live' },
      { to: '/student/courses', label: 'My courses', icon: 'book' },
      { to: '/student/progress', label: 'My progress', icon: 'chart' },
    ] },
    { label: 'Account', items: [
      { to: '/student/settings', label: 'Settings', icon: 'settings' },
    ] },
  ],
  TEACHER: [
    { label: 'Overview', items: [
      { to: '/teacher', label: 'Dashboard', icon: 'home', end: true },
    ] },
    { label: 'Teaching', items: [
      { to: '/teacher/live', label: 'Live control', icon: 'broadcast', badge: 'live' },
      { to: '/teacher/courses', label: 'My courses', icon: 'book' },
      { to: '/teacher/studio', label: 'Quiz studio', icon: 'sparkle' },
    ] },
    { label: 'Insight', items: [
      { to: '/teacher/analytics', label: 'Analytics', icon: 'chart' },
    ] },
    { label: 'Account', items: [
      { to: '/teacher/settings', label: 'Settings', icon: 'settings' },
    ] },
  ],
  ADMIN: [
    { label: 'Overview', items: [
      { to: '/admin', label: 'Dashboard', icon: 'home', end: true },
    ] },
    { label: 'Management', items: [
      { to: '/admin/users', label: 'People', icon: 'users' },
      { to: '/admin/approvals', label: 'Approvals', icon: 'userCheck', badge: 'pending' },
      { to: '/admin/courses', label: 'Courses', icon: 'book' },
    ] },
    { label: 'Insight', items: [
      { to: '/admin/analytics', label: 'Analytics', icon: 'pie' },
    ] },
    { label: 'Account', items: [
      { to: '/admin/settings', label: 'Settings', icon: 'settings' },
    ] },
  ],
};

/** The four destinations that reach the thumb bar on a phone. */
export const MOBILE_NAV: Record<Role, NavItem[]> = {
  STUDENT: [
    { to: '/student', label: 'Home', icon: 'home', end: true },
    { to: '/student/live', label: 'Live', icon: 'broadcast', badge: 'live' },
    { to: '/student/courses', label: 'Courses', icon: 'book' },
    { to: '/student/progress', label: 'Progress', icon: 'chart' },
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
    { to: '/admin/analytics', label: 'Insight', icon: 'pie' },
  ],
};

export const ROLE_LABEL: Record<Role, string> = {
  STUDENT: 'Student', TEACHER: 'Teacher', ADMIN: 'Administrator',
};
