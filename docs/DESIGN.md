# SessionHub — Design System

**Status:** Shipped. This document describes what is in `apps/web/src`, not a proposal.

The interface is built from one type scale, one accent, one foundation colour and a
fixed set of components. Nothing in a page file invents a colour, a radius, a duration
or a shadow — every value is a token, and every recurring pattern is a component.

---

## 1. Brand

| Role | Colour | Where it appears |
|---|---|---|
| **Foundation** | Navy `#071A33` | Sidebar, room-code banner, marketing panels, primary text |
| **Accent** | Yellow `#F5C400` | Primary buttons, active-nav marker, progress, live state, selected answer |
| Ground | Warm off-white `#F7F7F5` | Page background |
| Surface | `#FFFFFF` | Cards, tables, inputs |

**Yellow never floods the interface.** It marks the one action that matters on a screen
and the one item that is currently selected. Everything structural is navy or neutral.
Yellow is never used as body text: `--accent-ink` (`#7A6200`, 4.7:1 on white) is the
text-safe derivative, and yellow-on-navy is the only fill/label pairing.

Status colours (`--success`, `--warning`, `--danger`, `--info`) are desaturated and are
never the only carrier of meaning — every tone ships with its own icon and its own word.

Both themes are complete palettes, not a filter: light is defined on bare `:root`, dark
under both `[data-theme='dark']` and `prefers-color-scheme`, so an explicit choice always
beats the system setting.

---

## 2. Type

**Inter**, one family, everywhere. `--font-mono` is reserved for room codes, course codes
and IDs — anything read aloud or typed character by character.

| Token | Size | Used for |
|---|---|---|
| `--fs-display` | 40 → 60px fluid | Marketing headline only |
| `--fs-h1` | 28px | Page title |
| `--fs-h2` | 22px | Modal and section titles |
| `--fs-h3` | 17px | Card titles |
| `--fs-body` | 15px | Body copy |
| `--fs-sm` | 14px | Interface text, tables, buttons |
| `--fs-xs` | 13px | Secondary interface text |
| `--fs-caption` | 12px | Metadata |
| `--fs-label` | 11px | Uppercase eyebrows, `0.07em` tracking |

Tracking tightens as size grows (`--ls-display` −0.028em → `--ls-body` −0.006em).
Numbers are tabular everywhere they can change (`.t-num`), so a value never shifts width
as it updates during a live session.

---

## 3. Space, radius, depth, motion

- **Space** — 4px base, `--s-1` … `--s-12`. Every gap and pad references one.
- **Radius** — deliberately mixed, not uniformly round: `4/6px` small elements,
  `8px` inputs and buttons, `10–12px` cards and menus, `16px` modals and page-level
  containers. Data surfaces stay squarer than content surfaces.
- **Depth** — carried by 1px borders and tonal steps. Shadows are reserved for things
  that genuinely float: menus, modals, drawers, toasts, and the one card variant that
  lifts on hover (`.card-link`).
- **Motion** — `--t-fast` 150ms (state), `--t-base` 220ms (entrances), `--t-slow` 320ms
  (page and drawer). Easing is `cubic-bezier(0.2, 0.8, 0.25, 1)`. Animation communicates
  hierarchy, feedback, state change or continuity; nothing animates decoratively, and
  `prefers-reduced-motion` disables all of it without hiding content.

---

## 4. Components

Everything is exported from `src/components/ui`.

**Primitives** — `Button` (primary / foundation / secondary / tertiary / danger /
danger-solid, four sizes, hover · active · focus · disabled · loading), `LinkButton`,
`IconButton`, `Badge`, `Avatar`, `Tooltip`, `Spinner`.

**Forms** — `Field`, `TextField`, `PasswordField`, `SelectField`, `Input`, `Textarea`,
`Select`, `Checkbox`, `SearchInput`, `Segmented`. Every control has a real label; a
placeholder is never a label. Errors are inline, icon-carried and announced.

**Surfaces** — `Card` / `CardHead` / `CardBody` / `CardFoot`, `PanelRow`, `Stat`,
`StatGrid`, `Progress`, `Meter`, `Banner`.

**Feedback** — `Skeleton`, `SkeletonText`, `SkeletonTable`, `SkeletonCards`,
`EmptyState`, `ErrorState`, `ToastProvider` / `useToast`.

**Overlays** — `Modal`, `ConfirmDialog`, `Drawer`, `Menu` / `MenuItem` / `MenuSep`.
All trap focus, close on Escape, restore focus to the trigger and lock page scroll.
`Menu` renders through a portal so it is never clipped by a scrolling table.

**Data** — `DataTable` (search, sort, selection, bulk actions, pagination, per-row
actions, and a card layout below 720px) and `Pagination`.

**Navigation** — `Breadcrumbs`, `PageHeader`, `SectionHead`, `Tabs`, `RoomCode`.

**Charts** — `ChartCard`, `TrendArea`, `TrendLine`, `Bars`, `Donut`, `EmptyChart`.
Five-colour series drawn from the brand ramp, hairline grids, no gradients beyond a
single low-opacity area fill, no chart junk.

---

## 5. Shell

```
Desktop ≥1181px   navy sidebar (260px) + topbar + content
Tablet  ≤1180px   sidebar collapses to a 72px icon rail
Mobile  ≤860px    sidebar becomes a sheet behind the menu button,
                  primary destinations move to a bottom bar
```

Navigation is grouped by intent (`Overview` · `Learning`/`Teaching`/`Management` ·
`Insight` · `Account`) and defined as data in `components/shell/nav.ts`.

The active item is a raised navy plate with a **3px yellow marker on its leading edge** —
position is marked, not shouted. Counts (pending approvals, a live session) appear as
sidebar badges so blocking work is visible from any screen.

---

## 6. Role hierarchy

One design system, one component set, three different orders of importance.

- **Student — learning.** Is something live right now → my standing → my courses →
  recent activity. The live room gives the question the whole stage.
- **Teacher — productivity.** Is a session running → my courses → which question the
  room failed → recent sessions. Live control puts the room code and the question queue
  first, because those are what you look at while talking.
- **Admin — operations.** What is blocked on me → platform totals → activity trend →
  the approval queue. Tables carry search, filters, sorting, selection and bulk actions.

---

## 7. States

Every asynchronous surface ships four states, and each is designed rather than defaulted:

| State | Treatment |
|---|---|
| Loading | Skeletons shaped like the content they replace — never a spinner on a blank page |
| Empty | One sentence of explanation plus the action that resolves it |
| Error | What happened, what it means for the person's work, and a retry |
| Success | Toast for anything whose result is not visible on screen |

---

## 8. Accessibility

- Body and interface text meet AA; `--text-muted` is the smallest legible tier at 4.6:1.
- Focus is always visible, and switches to yellow on navy surfaces where the default
  navy ring would disappear.
- Overlays trap focus and return it; menus close on Escape.
- Colour is never the sole signal — status carries an icon and a word.
- Tables have captions, sortable headers expose `aria-sort`, and every icon-only control
  has an accessible name.
- Reduced motion is honoured globally.
