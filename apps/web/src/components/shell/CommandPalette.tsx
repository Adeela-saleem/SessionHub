import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import type { Assignment, ClassSession, Course, Role, User } from '../../lib/types';
import {
  ICONS, IconBook, IconBroadcast, IconClipboard, IconSearch, IconUser, IconUserCheck,
} from '../icons';
import { allNavItems } from './nav';

/* ============================================================
   Command palette — ⌘K / Ctrl+K, or "/" when not typing.
   Everything listed is a real destination: the role's pages,
   and the courses, sessions, assignments and people the server
   returns for this account. Nothing is indexed that the API did
   not return.
   ============================================================ */

interface Entry {
  id: string;
  group: string;
  label: string;
  hint?: string;
  to: string;
  icon: React.ComponentType<{ size?: number }>;
}

const COURSE_PATH: Record<Role, string> = {
  STUDENT: '/student/courses',
  TEACHER: '/teacher/courses',
  ADMIN: '/admin/courses',
};

const QUICK: Record<Role, Entry[]> = {
  STUDENT: [
    { id: 'q-join', group: 'Actions', label: 'Join a live session', to: '/student/live', icon: IconBroadcast },
  ],
  TEACHER: [
    { id: 'q-start', group: 'Actions', label: 'Start a live session', to: '/teacher/live', icon: IconBroadcast },
  ],
  ADMIN: [
    { id: 'q-approvals', group: 'Actions', label: 'Review teacher approvals', to: '/admin/approvals', icon: IconUserCheck },
  ],
};

export function CommandPalette({ role, open, onClose }: {
  role: Role; open: boolean; onClose: () => void;
}) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const courses = useQuery({
    queryKey: ['courses'],
    queryFn: () => api.get<Course[]>('/courses'),
    enabled: open,
    staleTime: 60_000,
  });
  const sessions = useQuery({
    queryKey: ['sessions'],
    queryFn: () => api.get<ClassSession[]>('/sessions'),
    enabled: open,
    staleTime: 60_000,
  });
  const people = useQuery({
    queryKey: ['users', 'palette'],
    queryFn: () => api.get<User[]>('/users?take=200'),
    enabled: open && role === 'ADMIN',
    staleTime: 60_000,
  });
  const myAssignments = useQuery({
    queryKey: ['my-assignments'],
    queryFn: () => api.get<Assignment[]>('/me/assignments'),
    enabled: open && role === 'STUDENT',
    staleTime: 60_000,
  });

  const entries = useMemo<Entry[]>(() => {
    const nav: Entry[] = allNavItems(role).map((i) => ({
      id: `n-${i.to}`, group: 'Go to', label: i.label, to: i.to, icon: ICONS[i.icon],
    }));
    const courseEntries: Entry[] = (courses.data ?? []).map((c) => ({
      id: `c-${c.id}`, group: 'Courses', label: c.name, hint: c.code,
      to: `${COURSE_PATH[role]}/${c.id}`, icon: IconBook,
    }));
    const liveTo = `/${role.toLowerCase()}/live`;
    const sessionEntries: Entry[] = (sessions.data ?? [])
      .filter((s) => s.status === 'LIVE')
      .map((s) => ({
        id: `s-${s.id}`, group: 'Live now', label: s.title ?? s.course?.name ?? 'Session',
        hint: s.roomCode, to: liveTo, icon: IconBroadcast,
      }));
    const assignmentEntries: Entry[] = (myAssignments.data ?? []).map((a) => ({
      id: `a-${a.id}`, group: 'Assignments', label: a.title, hint: a.course?.code,
      to: `/student/assignments/${a.id}`, icon: IconClipboard,
    }));
    const peopleEntries: Entry[] = (people.data ?? []).map((u) => ({
      id: `u-${u.id}`, group: 'People', label: u.name, hint: u.email,
      to: '/admin/users', icon: IconUser,
    }));
    return [...QUICK[role], ...nav, ...sessionEntries, ...courseEntries, ...assignmentEntries, ...peopleEntries];
  }, [role, courses.data, sessions.data, myAssignments.data, people.data]);

  const q = query.trim().toLowerCase();
  const results = useMemo(() => {
    if (!q) return entries.filter((e) => e.group !== 'People' && e.group !== 'Assignments').slice(0, 24);
    return entries.filter((e) =>
      e.label.toLowerCase().includes(q)
      || e.hint?.toLowerCase().includes(q)
      || e.group.toLowerCase().includes(q)).slice(0, 40);
  }, [entries, q]);

  // Reset per open; clamp the cursor when the result set shrinks.
  useEffect(() => {
    if (open) { setQuery(''); setActive(0); requestAnimationFrame(() => inputRef.current?.focus()); }
  }, [open]);
  useEffect(() => { setActive(0); }, [q]);

  useEffect(() => {
    if (!open) return;
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = overflow; };
  }, [open]);

  if (!open) return null;

  const go = (entry: Entry | undefined) => {
    if (!entry) return;
    onClose();
    navigate(entry.to);
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); onClose(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, results.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); go(results[active]); }
  };

  // Keep the active row in view while arrowing.
  const setRowRef = (i: number) => (el: HTMLButtonElement | null) => {
    if (el && i === active) el.scrollIntoView({ block: 'nearest' });
  };

  let lastGroup = '';

  return createPortal(
    <div
      className="scrim cmdk-scrim"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="cmdk" role="dialog" aria-modal="true" aria-label="Search">
        <div className="cmdk-input-row">
          <IconSearch size={16} />
          <input
            ref={inputRef}
            className="cmdk-input"
            placeholder={role === 'ADMIN' ? 'Search pages, courses and people…' : 'Search pages, courses and sessions…'}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKey}
            aria-label="Search"
          />
          <kbd className="cmdk-kbd">esc</kbd>
        </div>
        <div className="cmdk-list" ref={listRef} role="listbox">
          {results.length === 0 && (
            <div className="cmdk-none">Nothing matches “{query}”.</div>
          )}
          {results.map((entry, i) => {
            const header = entry.group !== lastGroup ? entry.group : null;
            lastGroup = entry.group;
            const Ico = entry.icon;
            return (
              <div key={entry.id}>
                {header && <div className="cmdk-group">{header}</div>}
                <button
                  ref={setRowRef(i)}
                  type="button"
                  role="option"
                  aria-selected={i === active}
                  className={`cmdk-item ${i === active ? 'is-active' : ''}`}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => go(entry)}
                >
                  <Ico size={15} />
                  <span className="grow t-clamp-1">{entry.label}</span>
                  {entry.hint && <span className="cmdk-hint t-data">{entry.hint}</span>}
                </button>
              </div>
            );
          })}
        </div>
        <div className="cmdk-foot" aria-hidden="true">
          <span><kbd className="cmdk-kbd">↑↓</kbd> Navigate</span>
          <span><kbd className="cmdk-kbd">↵</kbd> Open</span>
          <span><kbd className="cmdk-kbd">/</kbd> Search from anywhere</span>
        </div>
      </div>
    </div>,
    document.body,
  );
}
