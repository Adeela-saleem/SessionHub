# SessionHub — Design System

**Status:** Shipped. This document describes what is in `apps/web/src`, not a proposal.

The interface is built from one type scale, one accent, one foundation colour, a small set
of layout primitives and a fixed component kit. Nothing in a page file invents a colour, a
radius, a duration or a shadow — every value is a token, and every recurring pattern is a
component or a primitive.

The guiding sentence: **quiet, precise, dense, academic, trustworthy.** Composition is
restrained — one left edge, tables over card grids, compact controls — while every content
surface is a crafted panel with presence. Density and finish are both required.

---

## 1. Brand

| Role | Colour | Where it appears |
|---|---|---|
| **Foundation** | Navy `#071A33` | Navigation rail (navy finish), primary text, pagination current page |
| **Accent** | Yellow `#F5C400` | The page's one primary button, the active-nav tick, progress, selected answer |
| Ground | Warm off-white `#F7F7F5` | Page background |
| Surface | `#FFFFFF` | Tables, inputs, the live stage, the few remaining cards |

**Yellow never floods the interface.** It marks the one action that matters on a screen and
the one item that is currently selected. `--accent-ink` (`#7A6200`) is the text-safe
derivative. Status colours (`--success`, `--warning`, `--danger`, `--info`) are desaturated
and always ship with a word or an icon.

Both themes are complete palettes defined once with `light-dark()`; `[data-theme]` only
flips `color-scheme`. The rail has two finishes, chosen in Settings and stored beside the
theme: **navy** (default) and **light** (`[data-rail='light']`), sharing one geometry.

---

## 2. Type

**Inter**, one family. `.t-data` / `--font-mono` (12.5px) is reserved for room codes, course
codes, ids and times — anything read character by character.

| Token | Size | Used for |
|---|---|---|
| `--fs-display` | 36 → 56px fluid | Marketing headline only |
| `--fs-h1` | 20px | Page title |
| `--fs-h2` | 16px | Modal titles |
| `--fs-h3` | 14px semibold | Section and panel titles |
| `--fs-body` | 14px / 1.5 | Body copy, the question stage |
| `--fs-sm` | 13px | Interface text, tables, buttons, inputs |
| `--fs-caption` | 12px | Metadata, hints, footnotes |
| `--fs-label` | 11px caps, `0.05em` | Table headers, group labels |
| `--fs-metric` | 24px | KPI values |

Numbers are tabular everywhere they change (`.t-num`).

---

## 3. Space, radius, depth, motion, containers

- **Space** — 4px base, `--s-1` … `--s-12` (4 8 12 16 20 24 32 40 48 64 80 96).
- **Radius** — `3 / 4 / 6px` on controls and badges, `8px` on menus and strips, `10px` on
  panels, cards and modals. Nothing is rounder except the live pill and count marks.
- **Depth** — every content surface is a panel: white, 1px border, 10px radius and a
  contact shadow (`--shadow-panel`) so it sits on the off-white page rather than being
  drawn on it. Larger shadows only on things that float: menus, modals, drawers, toasts.
- **Motion** — 150 / 220 / 320ms with one easing; route change fades in; charts do not
  animate; `prefers-reduced-motion` disables everything.
- **Controls** — one height grid: 26 / 30 / 34 / 38 / 42. Buttons are 34 by default, 38 for
  the page's primary action, 30 in toolbars; inputs are 38 (42 on auth). Primary and
  secondary buttons carry a finish: a top highlight, a 1px shadow, a pressed inset.
- **Containers** — `--content-max` 1200 (dashboards), `--content-wide` 1440 (tables,
  gradebook, live classroom), `--content-reading` 760, `--content-form` 640. Page padding
  32 / 24 / 16 by breakpoint.

---

## 4. Layout primitives (`base.css`)

`.container[-wide|-reading|-form]`, `.section`, `.section-head` / `.section-title` /
`.section-sub` / `.section-link`, `.toolbar` / `.toolbar-end`, `.cluster`, `.stack`, `.grid`,
`.split` / `.split-rail`, `.kv` (definition rows), `.divided`, `.rule`. Every page is built
from these so the title, filters, primary button, tables and charts share one left edge.

---

## 5. Components (`src/components/ui`)

**Primitives** — `Button` (primary / foundation / secondary / tertiary / danger /
danger-solid; xs sm md lg xl; a disabled primary is grey, never washed yellow),
`LinkButton`, `IconButton`, `Badge` (20px), `Avatar`, `Tooltip`, `Spinner`.

**Forms** — `Field`, `TextField`, `TextareaField`, `PasswordField`, `SelectField`, `Input`
(`input-sm` / `input-lg`), `Textarea`, `Select`, `Checkbox`, `SearchInput`, `Segmented`;
`.form` / `.form-row` / `.form-actions` give every form one rhythm.

**Surfaces** — `Card` / `CardHead` / `CardBody` / `CardFoot` (10px radius, 16px padding),
`PanelRow`, `Stat` + `StatGrid` (one KPI panel with hairline-divided cells; `stat-grid-bare`
for use inside another panel), `Progress`, `Meter`, `Banner` (a 3px left-rule strip).

**Feedback** — `Skeleton`, `SkeletonText`, `SkeletonTable`, `EmptyState` (`row` and `bare`
variants for use directly under a section title), `ErrorState`, `ToastProvider` /
`useToast` (success · error · warning · info).

**Overlays** — `Modal` (sm 400 · md 560 · lg 800), `ConfirmDialog`, `Drawer`, `Menu`.

**Data** — `DataTable` (search, sort, selection, bulk actions, pagination, card layout below
860px) and `SimpleTable` (`bare` renders as its own panel under an external section title;
`compact` gives 32px rows). Rows are 40px, headers 32px in 11px caps, numbers right-aligned in
`.cell-num`, identifiers in `.cell-data`, two-line cells in `.cell-stack`. `.table-frame`
adds an edge where a table needs one.

**Navigation** — `Breadcrumbs`, `PageHeader` (title, one-line lede, actions), `SectionHead`,
`Tabs`, `RoomCode`.

**Charts** — `ChartFrame` (a chart panel under a section title), `ChartCard`, `TrendArea`,
`TrendLine`, `Bars`, `Donut`. Smooth monotone curves with a gradient fill, integer axes,
hairline grids, no entrance animation.

---

## 6. Shell

```
Desktop ≥1181px   232px rail + 52px header + bounded content column
Tablet  ≤1180px   rail collapses to a 56px icon rail
Mobile  ≤860px    rail becomes a sheet; four destinations move to a bottom bar
```

Rail: brand → workspace/context row (department, role) → primary groups (the first group is
unlabelled) → Settings → account menu. Items are 30px; the active item is a tonal plate with
a 2px accent tick at the rail edge. Header: section breadcrumb, then the live pill, search
(⌘K / Ctrl+K, or `/` when not typing — pages, courses, live sessions, assignments, people),
notifications, theme. Navigation is data in `components/shell/nav.ts`; the landing page's
product frames read the same file.

---

## 7. Page anatomy

Every dashboard is: `PageHeader` → optional `now-strip` (the one thing happening right now)
→ a `StatGrid` panel → a `split` of sections. A section is a `SectionHead` with the title
outside, and one panel beneath it: a `SimpleTable`, a `feed-list`, a `kv` list or a
`ChartFrame`. Titles sit on the page; content sits in panels. Admin lists are a `PageHeader`,
a `.toolbar`, and a `DataTable` in a `.table-frame`. Forms live in `.container-form`.

The **live classroom** is a control room: `LiveBar` (course, room-code tiles, in-room /
answered / questions / elapsed, actions), the stage (open question with key, or the result,
or what is up next), the queue as a table, a rail (participation `kv`, engagement chips,
Q&A), polls, and a sticky control bar with `O` open · `C` close & reveal · `P` poll. The
student room is one reading-width column with the question dominant.

---

## 8. States

| State | Treatment |
|---|---|
| Loading | Skeletons shaped like the content they replace |
| Empty | One sentence plus the action that resolves it; row-scale under section titles |
| Error | What happened, what it means, and a retry |
| Success | Toast for anything whose result is not visible on screen |

---

## 9. Accessibility

Body and interface text meet AA; focus is always visible and switches to yellow on navy
surfaces; overlays trap and return focus; colour is never the sole signal; tables have
captions and `aria-sort`; icon-only controls have names; reduced motion is honoured.
