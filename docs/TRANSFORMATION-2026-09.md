# Transformation — September 2026

A product-wide pass that followed the forensic UI/UX audit. Everything below
is implemented and verified against the running app; nothing here is planned
or partial unless explicitly marked.

## Design system

- **One theme source.** All semantic tokens are defined once with
  `light-dark()` in `tokens.css`; `data-theme` only flips `color-scheme`.
  The previously triple-duplicated (and divergent) dark blocks are gone, and
  system-dark users now see exactly the same theme as toggle-dark users.
  Settings offers System / Light / Dark; a pre-paint script in `index.html`
  prevents the light flash on reload.
- **Type scale** tightened for enterprise density: page title 26, section 19,
  card title 16, body 14/1.55, small 13, caption 12, label 11 with a single
  caps tracking token (`--ls-label`, used by table headers too). Inter loads
  as a variable font (weights 400–700, so 550/650 render as real instances).
- **One control grid**: `--ctl-sm/md/lg` = 32/36/44. Buttons and inputs share
  36px; toolbars and form rows align by construction. The primary button is
  flat brand yellow (gradient, inset gloss and text-shadow removed).
- **Density**: cards 16/20 padding, panel rows 12/20, table cells 10px block
  padding (plus a `data-compact` 7px preset), stat values 24px, sidebar 256,
  topbar 56, nav items 36, content max 1280.
- Focus ring no longer reshapes rounded elements; reduced-motion also zeroes
  delays; route changes fade in 150ms instead of sliding; `live-pulse` moved
  to `base.css` where the app shell needs it.
- Removed dead CSS (`data-collapsed` rules, `.card-flush`, `.card-pad` misuse,
  `.avatar-stack`, `.sk-title/.sk-text`, unused topbar/search/dot styles) and
  the undefined `--fs-md` reference on the grade pill.

## Product fixes

- **Signup funnel**: every "Get started"/"Create an account" CTA deep-links to
  `/auth?mode=signup`; the auth page reads the param. The hero was tightened
  so the product frame sits above the fold at 1440×900. Demo counters render
  only inside a framed product panel (no marketing-layer statistics). The
  Institutions section now states the actual buyer case (approval workflow,
  automatic attendance, immutable audit log, code-based joining).
- **Time is visible everywhere**: session rows across dashboards and course
  detail pages carry real dates (`formatDayDate`); "Course created {today}"
  and "Last updated now" bugs are gone.
- **Dashboards are role-specific and content-aware**: a live-now banner when a
  session is actually live; teacher's main column leads with the deduplicated
  "Needs re-teaching" queue; admin leads with the approvals queue and a
  live-now rail; empty modules collapse to row-scale empty states instead of
  264px voids.
- **Live classroom**:
  - Teacher: stable stage height, a primary action strip for the current
    question (open next / close & reveal with live answered-count), `o`/`c`
    keyboard shortcuts, poll creation + live results, reaction counters.
  - Student: their answer is remembered through reveal ("Your answer" marker
    works now), short-answer questions get a designed reveal (own text +
    teacher's explanation), poll voting with live results, a connection
    strip ("Connection interrupted — reconnecting…"), anonymous
    confused/got-it reactions, and a 6px timer that steps up at ≤10s.
  - Realtime: new `session:react` gateway event; poll events already existed.
- **Gradebook** is a real matrix: compact rows, sticky header, frozen student
  column, honest letter-grade tones (a D is never green), toolbar inside the
  card, CSV export.
- **Quiz studio**: AI drafts are fully editable before broadcast (prompt,
  options, correct answer, explanation, marks); broadcast blocks with a
  warning while a draft is invalid.
- **Charts**: empty series render the designed empty state instead of bare
  axes; donuts carry a value legend; single-series legends are suppressed;
  analytics loading skeletons mirror the loaded layout.
- **Honest failure**: 429s surface as "the server is briefly rate-limiting
  requests" with automatic backoff retries; stat tiles show "—  Couldn't
  load" instead of fabricated zeros when their query fails.
- **⌘K command palette** over navigation, courses and role actions, plus a
  topbar search trigger.
- Admin users list gains CSV export of the filtered set.

## API bugs found by the audit loop and fixed

- `GET /users` returned 500 for every request (Nest passed the `take`/`skip`
  query strings through untyped, producing `NaN` for Prisma). The admin
  People page had never rendered. Fixed with `DefaultValuePipe` +
  `ParseIntPipe` in `users.controller.ts`.
- Strict refresh-token rotation logged out the slower of two tabs sharing
  one stored token (the first boot burned it; the second got 401).
  `auth.service.refresh` now allows a 30-second replay grace on a
  just-rotated token — theft protection outside the window is unchanged.

## Operations

- `THROTTLE_LIMIT` env raises the API rate limit for local demos (production
  default stays 120/min). `apps/api/.env` documents the direct-run
  configuration (DB on the docker-mapped port 5434).
- Auth payloads now include `createdAt` (Settings shows a real "Member
  since").

## Known gaps (deliberately not faked)

- Teacher analytics' re-teaching payload has no question id/course/date, so
  those rows cannot link deeper without an API change.
- Polls are single-choice and named-vote-unique by schema; multi-select and
  anonymous flags would need a migration.
- Short-answer reveal shows the teacher's explanation; the API has no model
  answer field.
- Users CSV export honours the role/status filters but not the free-text
  search (it lives inside the DataTable component).

---

# Second pass — full visual redesign (September 2026)

The first pass left the product looking like a generic dashboard template:
every role opened on a greeting, a coloured banner, a boxed four-stat strip
and a grid of cards; radii ran to 16px; the rail was 256px; charts were
splines. This pass replaced the visual system rather than polishing it.
Everything below is implemented and verified by screenshot at 1440, 1280,
1024, 768 and 390px in both themes.

## Design system

- **Scale**: page title 20, sections 14, body 14, interface 13, caption 12,
  label 11; KPI value 22. Controls 24/28/32/36/40 — buttons 32 by default,
  36 for the page's one primary action, inputs 36. Radius 3/4/6/8 only.
  Shadows only on menus, modals, toasts.
- **Shell**: 232px rail with a workspace/context row, unlabelled first
  group, Settings pinned above the account row; 52px header with a section
  breadcrumb, live pill, ⌘K / `/` search, bell, theme. Content max 1200,
  wide 1440 (tables, live classroom), reading 760, forms 640. The rail has
  a navy (default) and a light finish, chosen in Settings.
- **Layout primitives** in `base.css`: `container`, `section`, `section-head`,
  `toolbar`, `cluster`, `stack`, `grid`, `split`, `kv`, `divided`, `rule`.
- **Cards removed as a default.** `StatGrid` is a ruled KPI row, `Banner` a
  left-rule strip, dashboards are sections of bare `SimpleTable`s and lists.
  `.table-frame` adds an edge only where a table needs one.
- Charts: straight segments, integer axes, no entrance animation,
  `ChartFrame` for charts under a section title.
- Toasts gain a warning tone; modals have sm/md/lg (400/560/800); empty
  states have `row`/`bare` variants.

## Screens

- **Overviews** (student, teacher, admin): header + date, `now-strip` when
  something is live or blocked, ruled KPI row, then Today (from the
  timetable), Due soon / Needs re-teaching / Awaiting approval, and courses
  as tables; a rail of recent sessions, announcements, standing, audit
  activity, and preparation links.
- **Live classroom**: `LiveBar` (course, room-code tiles, in-room /
  answered / questions / elapsed timer, actions), stage (open question with
  its key, result distribution, or what is up next), queue table, rail
  (participation, engagement, Q&A), polls, and a sticky control bar with
  `O` / `C` / `P` shortcuts. Student room is a single reading-width column
  with compact 44px answer rows. The pre-live and join screens are forms
  in a 640px column with recent/live sessions beside them.
- **Student**: courses, assignments, grades, course detail, lesson player
  and analytics rebuilt on tables and sections.
- **Teacher**: courses, course detail, builder, assignments, grading drawer,
  gradebook (toolbar + framed matrix), schedule (`ttb-frame`), quiz studio
  (dense editable draft rows), exam paper, analytics.
- **Admin**: People, Approvals, Courses, Course detail, Audit log (now a
  table), Analytics — toolbar + framed `DataTable`, no KPI boxes.
- **Auth**: 40/60 split, 24px aside title, ruled demo-credentials list,
  tab-style mode switch that keeps the `?mode=signup` deep link.
- **Settings**: a form column with ruled sections; adds the rail finish.
- **Landing**: same scale as the product (display ≤56px, nav 60px); product
  frames rebuilt to mirror the shipped shell (rail from `nav.ts`, ruled KPI
  row, bare tables, live control room); new "What ships" ruled capability
  list per role and an Analytics section using the teacher analytics
  screen; institutions bento now shows the audit log fragment.

## Fixes found on the way

- The "Connected — you are back in the room" strip fired on every mount;
  it now only follows a real drop.
- Splines invented peaks between integer samples; chart axes showed
  fractional ticks for counts.
- Disabled primary buttons rendered as washed yellow.
- Audit log crashed on `timeStyle` in `toLocaleDateString`.
- `.cell-user span { display:block }` broke avatar centring.
- ~5.6KB of dead CSS from the card era removed.

## Known gaps (deliberately not faked)

- Teacher analytics difficulty rows carry no question id, so labels repeat
  and rows cannot link deeper without an API change.
- Users CSV export ignores the free-text search (it lives inside
  `DataTable`).
- The gradebook toolbar wraps "Export CSV" onto a second line at 768px.
- Quiz studio / exam paper "generated" states were verified by code review
  only (no Groq key in this environment).

### Surface correction (same day)

Review of the first cut: layout, spacing and alignment were right, but the
components had been stripped too far — hairline-only KPI rows, tables sitting
bare on the page, flat 32px buttons, unframed straight-line charts. Restored:
every content surface is now a panel (white, 1px border, 10px radius,
`--shadow-panel`), the KPI row is one panel, `SimpleTable bare` renders as its
own panel under the external title, lists and `kv` blocks are panels, charts sit
in a `ChartFrame` panel with smooth curves and a gradient fill, buttons carry a
top highlight and 1px shadow at 34/38px, inputs 38px. The section anatomy
(title outside, one panel beneath) and the shell are unchanged. The landing
page's product frames were updated to match.

### Craft pass (same day)

On top of the restored panels: KPI cells carry a tonal icon mark (six
tones: neutral, accent, success, warning, danger, info) chosen per metric
and per state; section titles fuse into their panel as a header row; the
live/blocked strip is tinted with its tone; list rows carry a small icon
mark; avatars take a stable colour per name; charts show data points on
smooth curves; the rail has a subtle vertical gradient and a lit brand
mark; the header bar is white on the off-white page; the live stage shows
a 3px accent bar while a question is open and a navy one on a result.
The landing page's product frames mirror the fused headers and boxed KPI
row.
