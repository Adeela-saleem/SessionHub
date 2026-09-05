import { createContext, Suspense, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../../lib/auth';
import type { Role } from '../../lib/types';
import { ICONS, IconChevronDown, IconLogout, IconMenu, IconSettings } from '../icons';
import { Avatar, Badge, Breadcrumbs, IconButton, Menu, MenuItem, MenuSep, Skeleton } from '../ui';
import { ThemeToggle } from '../ThemeToggle';
import { MOBILE_NAV, NAV, ROLE_LABEL, type NavItem } from './nav';

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

export function AppShell({ role, counts = {} }: {
  role: Role;
  /** Badge values keyed by NavItem.badge — e.g. { pending: 3, live: 1 } */
  counts?: Record<string, number | undefined>;
}) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [mobileNav, setMobileNav] = useState(false);
  const [detail, setDetailState] = useState<string | null>(null);

  const setDetail = useCallback((label: string | null) => setDetailState(label), []);
  const value = useMemo(() => ({ setDetail, counts }), [setDetail, counts]);

  // Navigating always closes the sheet — otherwise it covers the page
  // the person just asked for.
  useEffect(() => { setMobileNav(false); }, [location.pathname]);

  const groups = NAV[role];
  const flat = groups.flatMap((g) => g.items);
  const current = [...flat]
    .sort((a, b) => b.to.length - a.to.length)
    .find((i) => (i.end ? location.pathname === i.to : location.pathname.startsWith(i.to)));

  const crumbs = [
    { label: 'SessionHub', to: flat[0]!.to },
    ...(current ? [{ label: current.label, to: current.to }] : []),
    ...(detail ? [{ label: detail }] : []),
  ];

  return (
    <ShellCtx.Provider value={value}>
      <div className="shell" data-mobile-nav={mobileNav ? 'true' : undefined}>
        <a href="#main" className="skip-link">Skip to main content</a>

        {mobileNav && (
          <div className="nav-scrim" onClick={() => setMobileNav(false)} aria-hidden="true" />
        )}

        <aside className="sidebar" aria-label="Primary">
          <div className="sidebar-brand">
            <span className="brand-mark" aria-hidden="true">S</span>
            <span className="brand-word">SessionHub</span>
          </div>

          <div className="sidebar-scroll">
            {groups.map((group) => (
              <nav className="nav-group" key={group.label} aria-label={group.label}>
                <div className="nav-group-label">{group.label}</div>
                {group.items.map((item) => (
                  <SidebarLink key={item.to} item={item} count={counts[item.badge ?? '']} />
                ))}
              </nav>
            ))}
          </div>

          <div className="sidebar-foot">
            {/* The trigger is the row itself, so the whole strip is the
                hit target rather than a 34px square in the corner. */}
            <Menu
              align="left"
              label={`Account menu for ${user?.name ?? 'your account'}`}
              triggerClassName="sidebar-user"
              trigger={
                <>
                  <Avatar name={user?.name} size="sm" />
                  <span className="sidebar-user-id grow">
                    <span className="sidebar-user-name t-clamp-1">{user?.name}</span>
                    <span className="sidebar-user-role">{ROLE_LABEL[role]}</span>
                  </span>
                  <IconChevronDown size={14} className="sidebar-user-id sidebar-user-caret" />
                </>
              }
            >
              <div className="menu-head">
                <div className="t-sm" style={{ fontWeight: 600, color: 'var(--text)' }}>{user?.name}</div>
                <div className="t-caption t-muted">{user?.email}</div>
              </div>
              <Link to={`${flat[0]!.to}/settings`} className="menu-item" role="menuitem">
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
              <NavLink to={`/${role.toLowerCase()}/live`} className="hide-sm">
                <Badge tone="live">Session live</Badge>
              </NavLink>
            ) : null}
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
                <Ico size={19} />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>
      </div>
    </ShellCtx.Provider>
  );
}

function SidebarLink({ item, count }: { item: NavItem; count?: number }) {
  const Ico = ICONS[item.icon];
  return (
    <NavLink
      to={item.to}
      end={item.end}
      className={({ isActive }) => `nav-item ${isActive ? 'is-active' : ''}`}
    >
      <Ico size={17} />
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
      <Skeleton h={28} w="32%" />
      <Skeleton h={88} className="sk-block" />
      <Skeleton h={300} className="sk-block" />
    </div>
  );
}

export function useShellCounts() { return useContext(ShellCtx).counts; }
