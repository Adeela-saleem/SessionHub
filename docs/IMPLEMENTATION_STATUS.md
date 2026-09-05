# SessionHub — Implementation Status

**Updated:** 2026-09-01
**Phases delivered:** 1 (Foundation) · 2 (Core LMS) · 3 (Assignments, Gradebook, Communication, Timetable)
**Decision on record:** built on `apps/` (NestJS + Prisma + Postgres +
React). See `PRODUCT_ROADMAP.md` §0 — the brief targeted the orphaned
`legacy/` Firebase prototype, which nothing serves.

---

## Completed

### Phase 1 — Foundation

**Schema** (`apps/api/prisma/schema.prisma`) — 5 new models, 3 new
enums, **zero destructive changes**. Migration
`20260901…_add_course_content_and_audit_log` applied; row counts before
and after were identical (users 5, courses 1, sessions 12, answers 33).

| Model | Purpose |
|---|---|
| `Module` | Groups lessons; own publish state |
| `Lesson` | Five types; own publish state |
| `Resource` | Files/links attached to a lesson |
| `LessonProgress` | One row per student per lesson; `positionSec` drives resume |
| `AuditLog` | Append-only; actor, action, target, summary, metadata |

**Cursor pagination** (`common/pagination.ts`) — id-based cursors rather
than `skip`, so pages are stable under concurrent inserts and use the
index directly. `take` is clamped to 100. One extra row is fetched as
the "has more" probe, avoiding a second COUNT.

**Audit log** (`audit/`) — global module. `record()` never throws: a
failed audit write must not roll back the action it describes. Nothing
in the API updates or deletes a row.

### Phase 2 — Core LMS

**Content API** (`content/`) — 14 endpoints covering module and lesson
CRUD, transactional reordering, resources, and progress.

**Access rules, enforced in the query rather than the response:**
- Authoring requires course ownership (or ADMIN).
- Students see only content live *now* — `PUBLISHED`, or `SCHEDULED`
  with `publishAt` in the past. Unpublished rows never reach the
  serialiser.
- Progress is student-only; teachers are rejected.

**Course builder** (`/teacher/courses/:id/content`) — modules and
lessons with independent publish toggles, keyboard-reachable reordering,
drawer-based editing, cascade-aware delete confirmations.

**Lesson player** (`/student/learn/:courseId/:lessonId`) — curriculum
rail with per-lesson completion, prev/next, mark-complete. Reading
position is saved at most once every 5 s and restored on return.

**Also wired:** "Continue learning" on the student dashboard, curriculum
on the student course page, audit log at `/admin/audit`.

### Added after Phase 2

**Change password** (`POST /auth/change-password`) — requires the current
password, rejects reuse, enforces the signup password rule. Every refresh
token the account holds is revoked in the same transaction and a fresh
pair is issued, so the calling device stays signed in and every other
session ends. Surfaced as a **Security** tab in Settings for all three
roles.

**Exam paper generator** (`POST /ai/paper`, `/ai/papers` CRUD) — the
legacy `buildPaperPrompt` and `normalizePaperResponse` are carried over
unchanged, and `PaperPreview` reproduces the legacy `renderPaper` layout
and print stylesheet exactly. The teacher owns the marking scheme:
question numbers, CLO, BTL, subpart labels and marks are set in the UI
and rebuilt server-side, so a drifting model cannot re-weight a paper.
Papers save to the previously unused `PaperFormat` model.

---

## Tests performed

Verified against the running stack, not asserted:

| Check | Result |
|---|---|
| Draft module invisible to student | 0 modules returned |
| Module published, lessons still draft | module visible, 0 lessons |
| Both published | 1 module, 2 lessons |
| Progress save → resume | `40% @ 312s`, returned by `/me/continue` |
| Student authoring a module | **403** |
| Teacher writing progress | **403** |
| Student reading audit log | **403** |
| Admin reading audit log | **200**, 5 entries, `hasMore: true` |
| Builder renders | h1 "Course content", no errors |
| Player renders | h1 "Introduction to relations", no errors |
| API typecheck / web build | both clean |
| Change password — wrong current | **401** "Your current password is not correct" |
| Change password — weak new | **400** with the policy message |
| Change password — reuse same | **400** "Choose a password you have not used" |
| Change password — happy path | old password 401, new 200, pre-change refresh token **revoked** |
| Paper normaliser unit tests | **5 passed** (labels, marks, key fallbacks, empty reply) |
| Security tab renders | 3 password fields, correct labels |
| Paper generator renders | h1 "Exam paper", no errors |

---

## Known issues

- Reorder is move-up/move-down, not drag-and-drop. Deliberate: it is
  keyboard-reachable. Drag can be layered on later.
- `SCHEDULED` is honoured on read but there is no job that flips a row
  to `PUBLISHED` at its `publishAt`; the filter handles it instead.
- Lesson body renders as paragraphs, not Markdown.
- Cursor pagination exists and is used by the audit log; the older
  `/users` and `/courses` listings still use their 200-row cap.
- Test suite is two files (quiz scoring, paper normalisation). Phase 3
  should add timer specs before the assessment engine grows.
- `GROQ_API_KEY` is empty in `.env`, so both AI endpoints return 503
  until a key is set. The paper *format* is covered by unit tests that
  do not need the provider.

---

## Remaining (Phases 3–7)

**3 — Assessment.** Assignments + submissions; assessment engine with
8 question types, attempts and pools; **server-authoritative timers**
(expiry decided by database timestamp, never the browser); question
bank; gradebook.

**4 — Classroom 2.0.** Pause/resume, QR join, richer live modes,
attendance with durations and statuses.

**5 — AI.** Teacher workspace beyond quiz generation; student assistant
scoped to enrolled content and blocked from unreleased answer keys.

**6 — Analytics.** At-risk detection with explainable reasons.

**7 — Enterprise.** Notifications, announcements, discussions, CSV/PDF
export, bulk import, departments/programs/terms.

---

## Phase 3 — Assignments · Gradebook · Communication · Timetable (2026-09-01)

Delivered against the "Production-Grade SaaS LMS" brief; the full audit,
gap matrix, schema and security model live in `PLATFORM_BLUEPRINT.md`.

**Schema** — migration `20260831…_assignments_gradebook_announcements_notifications`,
additive only: `GradeCategory`, `Assignment`, `Submission` (unique
`(assignmentId, studentId)` — the DB rejects duplicate submissions),
`StoredFile`, `Announcement`, `Notification`, plus 4 enums.

**Assignments** (`api/src/assignments`, 14 endpoints)
- Draft → publish (publish notifies the roster), scheduled publishing shares
  the content `liveOnly` gating — students can never see drafts.
- Student flow: draft text autosaved on demand, file attachments (20 MB,
  MIME-allowlisted, random disk keys, authenticated download route),
  submit/resubmit with `submittedAt`/`isLate` set by the server clock.
- Grading desk: full-roster submission table, marks clamped to `maxMarks`
  server-side, feedback, grade → return two-step (GRADED is teacher-only;
  RETURNED releases it and notifies the student). All grading audit-logged.

**Gradebook** (`api/src/gradebook`)
- Weighted categories of three kinds: ASSIGNMENTS (graded work),
  LIVE_QUIZZES (earned/possible marks over closed session questions),
  ATTENDANCE (sessions attended/held). Computed on read from primary
  records — nothing cached to corrupt.
- Empty categories are excluded and weights re-normalised (`grade-calc.ts`,
  unit-tested: 11 cases). Teacher sees GRADED+RETURNED; students see
  RETURNED only. Letter scale A+ ≥ 90 … D ≥ 50, F below.

**Communication**
- Course announcements (priority, scheduled publish, roster fan-out).
- Per-user notification centre: fan-out rows at write time, indexed unread
  count, socket push to `user:{id}` rooms, bell UI with mark-read/read-all.
- Session start now notifies the roster with the room code.

**Timetable** (`api/src/timetable`)
- Slot CRUD on the existing `schedule_slots` table; overlap detection
  (`overlap.ts`, unit-tested) reports ROOM / TEACHER / STUDENTS clashes as
  structured warnings — never a silent allow or a hard block.
- Week views for students and teachers; teacher slot management drawer.

**Web** — 8 new pages (student Assignments/AssignmentDetail/Grades/
Timetable; teacher Assignments/AssignmentDetail/Gradebook/Timetable),
AnnouncementsCard on both course pages, Due-soon + announcement feed on
the student dashboard, NotificationsBell in the shell, nav regrouped.

**Verified** — 27 API unit tests green; curl end-to-end (publish → notify
→ draft → submit → duplicate-submit rejected → over-mark rejected → grade
→ return → weighted grade B+ 81.8% from real quiz/attendance data →
room-clash warning → 403 matrix); authenticated headless-Chrome
screenshots of all new screens at 1440px.

**Still open (designed, not built)** — question bank + async exam engine
(Phase 4), discussions/reactions, multi-tenant organizations
(`PLATFORM_BLUEPRINT.md` §9 records the deferral rationale), CSV export,
AI expansion (blocked on `GROQ_API_KEY`).
