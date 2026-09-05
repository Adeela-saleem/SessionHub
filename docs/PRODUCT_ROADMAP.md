# SessionHub — Product Roadmap

**Status:** Audit complete. Implementation gated on one decision (see §0).
**Audited:** 2026-09-01, against the code that actually runs.

---

## 0. Blocking decision: which codebase is the product?

This repository contains two applications.

| | `legacy/` | `apps/` |
|---|---|---|
| Stack | Vanilla JS + Firebase | NestJS + Prisma + Postgres + React/Vite |
| Size | 28 files, ~5.3k JS | 104 files, ~10k TS |
| Auth | Firebase Auth | JWT + refresh rotation |
| Realtime | Firestore `onSnapshot` | Socket.IO |
| Security boundary | Firestore Rules | Nest guards + role decorators |
| Referenced by build/deploy | **no** | yes (`workspaces: apps/*`, docker-compose) |
| Firebase references | all of them | **zero** |

`docs/PROJECT-AUDIT.md` documents `legacy/` and is therefore stale. The
Firebase → Postgres migration happened before this roadmap was written.
`legacy/` is orphaned: nothing imports it, nothing serves it.

**Recommendation: build on `apps/`.** It is the deployed application, it
already has server-authoritative scoring and a typed schema, and the
LMS features below need relational integrity (enrolments, grades,
attempts, gradebooks) that Postgres gives directly.

Everything below assumes `apps/`. If the decision goes the other way,
the phases stay the same but every implementation note changes.

---

## 1. What exists today

### Working, end to end
- **Auth** — signup, login, refresh-token rotation, logout, `/me`;
  teacher accounts gated behind admin approval.
- **Users** — role/status filtered listing, stats, profile update,
  approval, delete.
- **Courses** — role-scoped listing, CRUD, roster, enrol/unenrol by email.
- **Live sessions** — create, join by room code, snapshot for late
  joiners, roster, heartbeat, auto-close after 30 min of silence.
- **Live quiz** — questions per session, open/close, answer, results.
  The answer key never leaves the server; scoring is server-side.
- **Polls** and **Q&A** — one row per vote, unique constraints prevent
  double-voting.
- **AI** — Groq-backed quiz generation into a review-then-broadcast flow.
- **Analytics** — student, teacher and admin endpoints from real data.
- **Web** — role-based shell, 19 routes, full design system, landing site.

### Schema present but unused
`ScheduleSlot` and `PaperFormat` are modelled with no service or endpoint.

### Known gaps
- Listings cap at 200 rows server-side; paging is client-side only.
- One test file in the whole repo (`quiz.service.spec.ts`).
- No file storage, notifications, audit log, or search.

---

## 2. Gap analysis against the target product

| Area | State | Work |
|---|---|---|
| Courses | flat: code, name, teacher | **Modules → Lessons → Resources** |
| Assignments | none | full lifecycle + submissions + grading |
| Assessments | live MCQ/short only | timed exams, 8 question types, attempts, pools |
| Question bank | none | reusable, tagged, AI-assisted |
| Gradebook | none | weighted categories, overrides, publish |
| Attendance | join/leave rows | durations, statuses, manual adjustment, export |
| Calendar | unused model | classes, deadlines, exams; month/week/agenda |
| Notifications | none | centre + preferences |
| Announcements / Discussions | none | per course |
| Academic structure | `department` string | Department → Program → Term → Section |
| Audit log | none | immutable, actor/action/target |
| Files | none | upload, validation, access-controlled |
| Search | none | global, role-scoped, ⌘K |
| Tests | 1 file | unit, integration, authz, E2E |

---

## 3. Phases

Each phase ships working software and updates
`docs/IMPLEMENTATION_STATUS.md`. No phase begins before the previous
one builds, runs and is exercised through the UI.

### Phase 1 — Foundation
Schema for academic structure and content; pagination made real
(cursor-based, `take`/`cursor` on every list); audit-log primitive;
permission layer beyond bare role checks; migration scripts that
preserve existing rows. **Nothing user-visible breaks.**

### Phase 2 — Core LMS
Modules, lessons, resources. Teacher course builder with ordering and
draft/published/scheduled/archived states. Student lesson player with
resumable progress.

### Phase 3 — Assessment
Assignments and submissions. Assessment engine: question types, timing,
attempts, pools. **Server-authoritative timers** — expiry decided by
database timestamp, never the browser. Question bank. Gradebook.

### Phase 4 — Classroom 2.0
Pause/resume, QR join, richer live question modes, engagement signals,
reconnect that restores state rather than restarting it. Attendance with
durations and statuses.

### Phase 5 — AI
Teacher workspace (quiz, exam, lesson, study material, question
improvement, feedback drafting). Student assistant scoped to enrolled
content and blocked from unreleased answer keys. Every output stays
draft-until-reviewed.

### Phase 6 — Analytics
Progress, performance, engagement, at-risk detection with **explainable**
reasons ("attendance below 70%", "3 assignments missing") — never an
opaque score.

### Phase 7 — Enterprise
Notifications, announcements, discussions, CSV/PDF export, bulk import
with validation, settings, system health.

---

## 4. Rules held throughout

- Existing data is migrated, never dropped.
- The API is the security boundary; the client is a convenience.
- No fabricated metrics — every number traces to a query.
- No dead buttons, no "coming soon" on core paths.
- Each phase leaves the app runnable.
