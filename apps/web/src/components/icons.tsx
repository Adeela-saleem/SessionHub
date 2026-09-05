import type { SVGProps } from 'react';

/* ============================================================
   Icon set — one library, 24px grid, 1.75 stroke, currentColor.
   Icons are decorative by default; pass `title` to name one for
   assistive technology when it carries meaning on its own.
   ============================================================ */

export type IconProps = SVGProps<SVGSVGElement> & { size?: number; title?: string };

function Icon({ size = 18, title, children, ...rest }: IconProps) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={1.75}
      strokeLinecap="round" strokeLinejoin="round"
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
      focusable="false"
      {...rest}
    >
      {title && <title>{title}</title>}
      {children}
    </svg>
  );
}

/* ── Navigation & domain ────────────────────────────────── */
export const IconHome = (p: IconProps) => (
  <Icon {...p}><path d="M3 10.5 12 3l9 7.5" /><path d="M5.5 9.5V20h13V9.5" /><path d="M9.5 20v-6h5v6" /></Icon>
);
export const IconBroadcast = (p: IconProps) => (
  <Icon {...p}><circle cx="12" cy="12" r="2.5" /><path d="M7.8 16.2a6 6 0 0 1 0-8.4M16.2 7.8a6 6 0 0 1 0 8.4M4.9 19.1a10 10 0 0 1 0-14.2M19.1 4.9a10 10 0 0 1 0 14.2" /></Icon>
);
export const IconBook = (p: IconProps) => (
  <Icon {...p}><path d="M4 5a2 2 0 0 1 2-2h5v16H6a2 2 0 0 0-2 2z" /><path d="M20 5a2 2 0 0 0-2-2h-5v16h5a2 2 0 0 1 2 2z" /></Icon>
);
export const IconChart = (p: IconProps) => (
  <Icon {...p}><path d="M3 3v16.5A1.5 1.5 0 0 0 4.5 21H21" /><path d="M7 15l3.5-4.5 3 2.5L19 7" /></Icon>
);
export const IconPie = (p: IconProps) => (
  <Icon {...p}><path d="M21 15.5A9 9 0 1 1 8.5 3" /><path d="M21.2 11.5A9 9 0 0 0 12.5 2.8V11a.5.5 0 0 0 .5.5z" /></Icon>
);
export const IconUsers = (p: IconProps) => (
  <Icon {...p}><path d="M16 20v-1.5a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4V20" /><circle cx="9" cy="7" r="3.5" /><path d="M22 20v-1.5a4 4 0 0 0-3-3.9M16.5 3.6a4 4 0 0 1 0 6.8" /></Icon>
);
export const IconUserCheck = (p: IconProps) => (
  <Icon {...p}><path d="M14 20v-1.5a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4V20" /><circle cx="8" cy="7" r="3.5" /><path d="m16 11.5 2 2 4-4" /></Icon>
);
export const IconUser = (p: IconProps) => (
  <Icon {...p}><path d="M19 20v-1.5a5 5 0 0 0-5-5h-4a5 5 0 0 0-5 5V20" /><circle cx="12" cy="7" r="3.75" /></Icon>
);
export const IconSparkle = (p: IconProps) => (
  <Icon {...p}><path d="M12 3.5 13.7 8.3 18.5 10 13.7 11.7 12 16.5 10.3 11.7 5.5 10 10.3 8.3z" /><path d="M18 16.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z" /></Icon>
);
export const IconMessage = (p: IconProps) => (
  <Icon {...p}><path d="M21 11.5a7.5 7.5 0 0 1-7.5 7.5H8l-4 3v-4.6A7.5 7.5 0 0 1 3 11.5 7.5 7.5 0 0 1 10.5 4h3A7.5 7.5 0 0 1 21 11.5z" /></Icon>
);
export const IconCalendar = (p: IconProps) => (
  <Icon {...p}><rect x="3" y="5" width="18" height="16" rx="2.5" /><path d="M3 10h18M8 3v4M16 3v4" /></Icon>
);
export const IconSettings = (p: IconProps) => (
  <Icon {...p}><circle cx="12" cy="12" r="3" /><path d="M19.4 14a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V20a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 9 18.3a1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 4.6 9a1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z" /></Icon>
);
export const IconGrad = (p: IconProps) => (
  <Icon {...p}><path d="M2.5 8.5 12 4l9.5 4.5L12 13z" /><path d="M6.5 10.8V16c0 1.4 2.5 2.8 5.5 2.8s5.5-1.4 5.5-2.8v-5.2" /><path d="M21.5 8.5V14" /></Icon>
);
export const IconFile = (p: IconProps) => (
  <Icon {...p}><path d="M14 2H6.5A2.5 2.5 0 0 0 4 4.5v15A2.5 2.5 0 0 0 6.5 22h11a2.5 2.5 0 0 0 2.5-2.5V8z" /><path d="M14 2v6h6M8.5 13h7M8.5 17h4.5" /></Icon>
);
export const IconClipboard = (p: IconProps) => (
  <Icon {...p}><path d="M9 3.5h6a1 1 0 0 1 1 1V6H8V4.5a1 1 0 0 1 1-1z" /><path d="M16 5h2.5A1.5 1.5 0 0 1 20 6.5v13a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 19.5v-13A1.5 1.5 0 0 1 5.5 5H8" /><path d="M8.5 12h7M8.5 16h4.5" /></Icon>
);
export const IconBuilding = (p: IconProps) => (
  <Icon {...p}><path d="M4 21V5.5A1.5 1.5 0 0 1 5.5 4h7A1.5 1.5 0 0 1 14 5.5V21" /><path d="M14 10h4.5A1.5 1.5 0 0 1 20 11.5V21" /><path d="M2.5 21h19M7.5 8h3M7.5 12h3M7.5 16h3M17 14h.5M17 17.5h.5" /></Icon>
);

/* ── Direction ──────────────────────────────────────────── */
export const IconChevronRight = (p: IconProps) => (<Icon {...p}><path d="m9 5 7 7-7 7" /></Icon>);
export const IconChevronLeft  = (p: IconProps) => (<Icon {...p}><path d="m15 5-7 7 7 7" /></Icon>);
export const IconChevronDown  = (p: IconProps) => (<Icon {...p}><path d="m6 9 6 6 6-6" /></Icon>);
export const IconChevronUp    = (p: IconProps) => (<Icon {...p}><path d="m6 15 6-6 6 6" /></Icon>);
export const IconArrowRight   = (p: IconProps) => (<Icon {...p}><path d="M4 12h15M13 6l6 6-6 6" /></Icon>);
export const IconArrowLeft    = (p: IconProps) => (<Icon {...p}><path d="M20 12H5M11 6l-6 6 6 6" /></Icon>);
export const IconArrowUpRight = (p: IconProps) => (<Icon {...p}><path d="M7 17 17 7M8 7h9v9" /></Icon>);
export const IconSort = (p: IconProps) => (<Icon {...p}><path d="m8 8 4-4 4 4M8 16l4 4 4-4" /></Icon>);
export const IconTrendUp = (p: IconProps) => (<Icon {...p}><path d="M3 17l6-6 4 4 8-8" /><path d="M21 7h-5M21 7v5" /></Icon>);
export const IconTrendDown = (p: IconProps) => (<Icon {...p}><path d="M3 7l6 6 4-4 8 8" /><path d="M21 17h-5M21 17v-5" /></Icon>);
export const IconMinus = (p: IconProps) => (<Icon {...p}><path d="M5 12h14" /></Icon>);

/* ── Actions ────────────────────────────────────────────── */
export const IconSearch = (p: IconProps) => (<Icon {...p}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></Icon>);
export const IconPlus   = (p: IconProps) => (<Icon {...p}><path d="M12 5v14M5 12h14" /></Icon>);
export const IconClose  = (p: IconProps) => (<Icon {...p}><path d="M18 6 6 18M6 6l12 12" /></Icon>);
export const IconCheck  = (p: IconProps) => (<Icon {...p}><path d="M20 6 9 17l-5-5" /></Icon>);
export const IconMenu   = (p: IconProps) => (<Icon {...p}><path d="M4 7h16M4 12h16M4 17h16" /></Icon>);
export const IconMore   = (p: IconProps) => (<Icon {...p}><circle cx="5" cy="12" r="1.4" fill="currentColor" /><circle cx="12" cy="12" r="1.4" fill="currentColor" /><circle cx="19" cy="12" r="1.4" fill="currentColor" /></Icon>);
export const IconTrash  = (p: IconProps) => (<Icon {...p}><path d="M4 7h16M10 4h4a1 1 0 0 1 1 1v2H9V5a1 1 0 0 1 1-1z" /><path d="M6.5 7 7.4 19a2 2 0 0 0 2 1.9h5.2a2 2 0 0 0 2-1.9L17.5 7" /><path d="M10.5 11v6M13.5 11v6" /></Icon>);
export const IconEdit   = (p: IconProps) => (<Icon {...p}><path d="M4 20h4L20 8a2.5 2.5 0 0 0-3.5-3.5L4.5 16.5z" /><path d="m15 6 3 3" /></Icon>);
export const IconCopy   = (p: IconProps) => (<Icon {...p}><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M6 15H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v1" /></Icon>);
export const IconFilter = (p: IconProps) => (<Icon {...p}><path d="M3 5h18l-7 8v6l-4 2v-8z" /></Icon>);
export const IconRefresh= (p: IconProps) => (<Icon {...p}><path d="M20 11a8 8 0 0 0-14-4.5L3 9" /><path d="M3 4v5h5" /><path d="M4 13a8 8 0 0 0 14 4.5L21 15" /><path d="M21 20v-5h-5" /></Icon>);
export const IconSend   = (p: IconProps) => (<Icon {...p}><path d="M21 3 10.5 13.5" /><path d="M21 3 14.5 21l-4-7.5L3 9.5z" /></Icon>);
export const IconLogout = (p: IconProps) => (<Icon {...p}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="m16 17 5-5-5-5M21 12H9" /></Icon>);
export const IconPlay   = (p: IconProps) => (<Icon {...p}><path d="M7 4.5 19 12 7 19.5z" /></Icon>);
export const IconStop   = (p: IconProps) => (<Icon {...p}><rect x="5.5" y="5.5" width="13" height="13" rx="2" /></Icon>);
export const IconEye    = (p: IconProps) => (<Icon {...p}><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7z" /><circle cx="12" cy="12" r="3" /></Icon>);
export const IconEyeOff = (p: IconProps) => (<Icon {...p}><path d="M10.6 5.2A9.9 9.9 0 0 1 12 5c6.4 0 10 7 10 7a17.9 17.9 0 0 1-2.9 3.9M6.6 6.6A17.6 17.6 0 0 0 2 12s3.6 7 10 7a9.8 9.8 0 0 0 4.2-.9" /><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2M3 3l18 18" /></Icon>);
export const IconSun    = (p: IconProps) => (<Icon {...p}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></Icon>);
export const IconMoon   = (p: IconProps) => (<Icon {...p}><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" /></Icon>);

/* ── Status & feedback ──────────────────────────────────── */
export const IconBell = (p: IconProps) => (<Icon {...p}><path d="M18 9a6 6 0 1 0-12 0c0 5-2.5 6.5-2.5 6.5h17S18 14 18 9z" /><path d="M13.7 19a2 2 0 0 1-3.4 0" /></Icon>);
export const IconClock = (p: IconProps) => (<Icon {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7v5.2l3.4 2" /></Icon>);
export const IconCheckCircle = (p: IconProps) => (<Icon {...p}><circle cx="12" cy="12" r="9" /><path d="m8.5 12.2 2.4 2.4 4.6-5" /></Icon>);
export const IconAlert = (p: IconProps) => (<Icon {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7.5v5.2" /><circle cx="12" cy="16.3" r="0.9" fill="currentColor" stroke="none" /></Icon>);
export const IconWarning = (p: IconProps) => (<Icon {...p}><path d="M10.3 3.9 2.6 17.4A2 2 0 0 0 4.3 20.4h15.4a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /><path d="M12 9v4" /><circle cx="12" cy="16.6" r="0.9" fill="currentColor" stroke="none" /></Icon>);
export const IconInfo = (p: IconProps) => (<Icon {...p}><circle cx="12" cy="12" r="9" /><path d="M12 11v5.5" /><circle cx="12" cy="7.8" r="0.9" fill="currentColor" stroke="none" /></Icon>);
export const IconInbox = (p: IconProps) => (<Icon {...p}><path d="M22 12h-6l-2 3h-4l-2-3H2" /><path d="M5.5 5h13l3.5 7v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-6z" /></Icon>);
export const IconOffline = (p: IconProps) => (<Icon {...p}><path d="M3 3l18 18" /><path d="M8.6 15.3a5 5 0 0 1 6.8 0" /><path d="M5 11.8a10 10 0 0 1 3.4-2.2M19 11.8a10 10 0 0 0-6.6-2.6" /><path d="M1.8 8.5a15 15 0 0 1 4-2.7M22.2 8.5a15 15 0 0 0-9.3-3.4" /><circle cx="12" cy="19" r="0.9" fill="currentColor" stroke="none" /></Icon>);
export const IconLock = (p: IconProps) => (<Icon {...p}><rect x="4" y="10" width="16" height="11" rx="2.5" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></Icon>);
export const IconAward2 = (p: IconProps) => (<Icon {...p}><circle cx="12" cy="9" r="5.5" /><path d="m8.8 13.5-1.3 7 4.5-2.6 4.5 2.6-1.3-7" /></Icon>);
export const IconShield = (p: IconProps) => (<Icon {...p}><path d="M12 3l7.5 3v5.6c0 4.5-3 8-7.5 9.4-4.5-1.4-7.5-4.9-7.5-9.4V6z" /><path d="m9 12 2.2 2.2L15.4 10" /></Icon>);
export const IconTarget = (p: IconProps) => (<Icon {...p}><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="4.5" /><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" /></Icon>);
export const IconZap = (p: IconProps) => (<Icon {...p}><path d="M13.5 2 4 13.5h6.5L10 22l9.5-11.5H13z" /></Icon>);
export const IconAward = (p: IconProps) => (<Icon {...p}><circle cx="12" cy="9" r="6" /><path d="m8.2 14.2-1.4 7L12 18.6l5.2 2.6-1.4-7" /></Icon>);
export const IconPhone = (p: IconProps) => (
  <Icon {...p}><rect x="6.5" y="2" width="11" height="20" rx="2.5" /><path d="M10.5 5.4h3" /><path d="M11 18.6h2" /></Icon>
);
export const IconMail = (p: IconProps) => (<Icon {...p}><rect x="3" y="5" width="18" height="14" rx="2.5" /><path d="m3.6 6.5 7.3 5.5a2 2 0 0 0 2.2 0l7.3-5.5" /></Icon>);
export const IconHelp = (p: IconProps) => (<Icon {...p}><circle cx="12" cy="12" r="9" /><path d="M9.6 9.4a2.5 2.5 0 1 1 3.3 2.4c-.6.2-.9.8-.9 1.4v.5" /><circle cx="12" cy="16.6" r="0.9" fill="currentColor" stroke="none" /></Icon>);

/* Name → component, so nav definitions can stay plain data. */
export const ICONS = {
  home: IconHome, broadcast: IconBroadcast, book: IconBook, chart: IconChart,
  pie: IconPie, users: IconUsers, userCheck: IconUserCheck, user: IconUser,
  sparkle: IconSparkle, message: IconMessage, calendar: IconCalendar,
  settings: IconSettings, grad: IconGrad, file: IconFile, clipboard: IconClipboard,
  building: IconBuilding, target: IconTarget, award: IconAward, clock: IconClock,
  shield: IconShield, inbox: IconInbox, bell: IconBell, award2: IconAward2,
} as const;

export type IconName = keyof typeof ICONS;
