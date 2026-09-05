import { createContext, Suspense, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../../lib/auth';
import type { Role } from '../../lib/types';
import {
  ICONS, IconChevronDown, IconChevronLeft, IconChevronRight, IconLogout, IconMenu, IconSearch, IconSettings,
} from '../icons';
import { applySidebar, storedSidebar, type Sidebar } from '../../lib/theme';
import { Avatar, Breadcrumbs, IconButton, Menu, MenuItem, MenuSep, Skeleton } from '../ui';
import { ThemeToggle } from '../ThemeToggle';
import { CommandPalette } from './CommandPalette';
import { NotificationsBell } from './NotificationsBell';
import { allNavItems, MOBILE_NAV, NAV, ROLE_LABEL, type NavItem } from './nav';

/* ============================================================
   Shell context
   Detail pages announce their own title so the breadcrumb can
   name the record rather than repeating the section.
   ============================================================ */
interface ShellValue {
  setDetail: (label: string | null) => void;
  counts: Record<string, number | undefined>;
}
const ShellCtx = createContext<ShellValue>({ setDetail: () => {}, counts: {} });

/** Registers a breadcrumb leaf for as long as the page is mounted. */
export function usePageDetail(label: string | null | undefined) {
  const { setDetail } = useContext(ShellCtx);
  useEffect(() => {
    setDetail(label ?? null);
    return () => setDetail(null);
  }, [label, setDetail]);
}

function isTypingTarget(t: EventTarget | null) {
  const el = t as HTMLElement | null;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
}

export function AppShell({ role, counts = {} }: {
  role: Role;
  /** Badge values keyed by NavItem.badge — e.g. { pending: 3, live: 1 } */
  counts?: Record<string, number | undefined>;
}) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [mobileNav, setMobileNav] = useState(false);
  const [palette, setPalette] = useState(false);
  const [detail, setDetailState] = useState<string | null>(null);

  // Sidebar width. Null means automatic (the 1180px breakpoint decides);
  // a stored choice holds at every width. The effective state drives the
  // toggle's icon and the tooltips on icon-only links.
  const [sidebar, setSidebar] = useState<Sidebar | null>(() => storedSidebar());
  const [narrow, setNarrow] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia('(max-width: 1180px)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1180px)');
    const onChange = (e: MediaQueryListEvent) => setNarrow(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  const collapsed = sidebar ? sidebar === 'collapsed' : narrow;
  const toggleSidebar = () => {
    const next: Sidebar = collapsed ? 'expanded' : 'collapsed';
    applySidebar(next);
    setSidebar(next);
  };

  // ⌘K / Ctrl+K from anywhere; "/" when not typing.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPalette((p) => !p);
      } else if (e.key === '/' && !e.metaKey && !e.ctrlKey && !e.altKey && !isTypingTarget(e.target)) {
        e.preventDefault();
        setPalette(true);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const setDetail = useCallback((label: string | null) => setDetailState(label), []);
  const value = useMemo(() => ({ setDetail, counts }), [setDetail, counts]);

  // Navigating always closes the sheet — otherwise it covers the page
  // the person just asked for.
  useEffect(() => { setMobileNav(false); }, [location.pathname]);

  const groups = NAV[role];
  const flat = allNavItems(role);
  const home = flat[0]!;
  const current = [...flat]
    .sort((a, b) => b.to.length - a.to.length)
    .find((i) => (i.end ? location.pathname === i.to : location.pathname.startsWith(i.to)));

  // Location, not history: section, then the record inside it.
  const crumbs = [
    ...(current ? [{ label: current.label, to: current.to }] : [{ label: ROLE_LABEL[role], to: home.to }]),
    ...(detail ? [{ label: detail }] : []),
  ];
  const liveTo = `/${role.toLowerCase()}/live`;

  return (
    <ShellCtx.Provider value={value}>
      <div className="shell" data-mobile-nav={mobileNav ? 'true' : undefined}>
        <a href="#main" className="skip-link">Skip to main content</a>

        {mobileNav && (
          <div className="nav-scrim" onClick={() => setMobileNav(false)} aria-hidden="true" />
        )}

        <aside className="sidebar" aria-label="Primary">
          <Link to={home.to} className="sidebar-brand" aria-label="SessionHub home">
            <span className="brand-mark" aria-hidden="true">S</span>
            <span className="brand-word">SessionHub</span>
          </Link>

          {/* Workspace context: who you are here, and where. */}
          <div className="sidebar-context" aria-label="Workspace">
            <Avatar name={user?.name} size="sm" />
            <span className="sidebar-context-id">
              <span className="sidebar-context-name t-clamp-1">{user?.department || ROLE_LABEL[role]}</span>
              <span className="sidebar-context-role t-clamp-1">{user?.department ? ROLE_LABEL[role] : user?.email}</span>
            </span>
          </div>

          <div className="sidebar-scroll">
            {groups.map((group, gi) => (
              <nav className="nav-group" key={group.label ?? gi} aria-label={group.label ?? 'Main'}>
                {group.label && <div className="nav-group-label">{group.label}</div>}
                {group.items.map((item) => (
                  <SidebarLink key={item.to} item={item} count={counts[item.badge ?? '']} collapsed={collapsed} />
                ))}
              </nav>
            ))}
          </div>

          <div className="sidebar-foot">
            {/* Settings lives in the account menu below; it is not repeated here. */}
            <button
              type="button"
              className="nav-item sidebar-collapse"
              onClick={toggleSidebar}
              aria-pressed={collapsed}
              aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {collapsed ? <IconChevronRight size={16} /> : <IconChevronLeft size={16} />}
              <span>Collapse</span>
            </button>
            <Menu
              align="left"
              label={`Account menu for ${user?.name ?? 'your account'}`}
              triggerClassName="sidebar-user"
              trigger={
                <>
                  <Avatar name={user?.name} size="sm" />
                  <span className="sidebar-user-id grow">
                    <span className="sidebar-user-name t-clamp-1">{user?.name}</span>
                    <span className="sidebar-user-role t-clamp-1">{user?.email}</span>
                  </span>
                  <IconChevronDown size={14} className="sidebar-user-id sidebar-user-caret" />
                </>
              }
            >
              <div className="menu-head">
                <div className="t-sm" style={{ fontWeight: 500, color: 'var(--text)' }}>{user?.name}</div>
                <div className="t-caption t-muted">{ROLE_LABEL[role]}</div>
              </div>
              <Link to={`${home.to}/settings`} className="menu-item" role="menuitem">
                <IconSettings size={15} />Settings
              </Link>
              <MenuSep />
              <MenuItem danger icon={<IconLogout size={15} />} onClick={() => void logout()}>
                Log out
              </MenuItem>
            </Menu>
          </div>
        </aside>

        <div className="main">
          <header className="topbar">
            <IconButton
              label="Open navigation"
              className="sidebar-toggle"
              onClick={() => setMobileNav(true)}
            >
              <IconMenu size={18} />
            </IconButton>

            <Breadcrumbs items={crumbs} />

            <span className="grow" />

            {counts.live ? (
              <NavLink to={liveTo} className="topbar-live hide-sm" aria-label="A session is live — open it">
                <i aria-hidden="true" />Live
              </NavLink>
            ) : null}
            <button
              type="button"
              className="topbar-find"
              onClick={() => setPalette(true)}
              aria-label="Search (Ctrl+K)"
            >
              <IconSearch size={15} />
              <span>Search</span>
              <kbd className="cmdk-kbd">⌘K</kbd>
            </button>
            <NotificationsBell />
            <ThemeToggle />
          </header>

          {/* Keying on the path replays the page's entrance, which reads as
              a transition between destinations rather than a repaint. */}
          <main className="page" id="main" key={location.pathname}>
            <Suspense fallback={<PageSkeleton />}>
              <Outlet />
            </Suspense>
          </main>
        </div>

        <CommandPalette role={role} open={palette} onClose={() => setPalette(false)} />

        <nav className="tabbar" aria-label="Primary">
          {MOBILE_NAV[role].map((item) => {
            const Ico = ICONS[item.icon];
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) => `tabbar-item ${isActive ? 'is-active' : ''}`}
              >
                <Ico size={20} />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>
      </div>
    </ShellCtx.Provider>
  );
}

function SidebarLink({ item, count, collapsed }: { item: NavItem; count?: number; collapsed?: boolean }) {
  const Ico = ICONS[item.icon];
  // Icon-only links need the label somewhere: the native tooltip.
  const title = collapsed ? (count ? `${item.label} (${count})` : item.label) : undefined;
  return (
    <NavLink
      to={item.to}
      end={item.end}
      title={title}
      className={({ isActive }) => `nav-item ${isActive ? 'is-active' : ''}`}
    >
      <Ico size={16} />
      <span>{item.label}</span>
      {count ? (
        <span className={`nav-count ${item.badge === 'live' ? '' : 'nav-count-quiet'}`.trim()}>
          {count}
        </span>
      ) : null}
    </NavLink>
  );
}

/** Matches the rhythm of a loaded page so nothing jumps on arrival. */
function PageSkeleton() {
  return (
    <div className="col" aria-hidden="true">
      <Skeleton h={22} w="28%" />
      <Skeleton h={64} className="sk-block" />
      <Skeleton h={280} className="sk-block" />
    </div>
  );
}

export function useShellCounts() { return useContext(ShellCtx).counts; }
