# SessionHub — Platform Blueprint

*Produced 2026-09-01 in response to the "Production-Grade SaaS LMS" brief.*
*This document is the audit, gap matrix, architecture, schema, security model
and roadmap the brief asked for — mapped onto the stack the product actually
runs on.*

---

## 0. One correction to the brief, up front

The brief describes a Firebase/Firestore application. That application exists
only as an orphaned prototype in `legacy/` — nothing imports it. The real
product (by explicit earlier decision, recorded in `docs/PRODUCT_ROADMAP.md §0`)
is:

| Layer | Technology |
|---|---|
| API | NestJS 10, global JWT guard, role guard, Socket.IO gateway |
| Database | PostgreSQL 16 via Prisma (docker `sessionhub-db`, host port 5434) |
| Web | React 18 + Vite + TypeScript, React Router, TanStack Query |
| Auth | argon2 + rotating single-use refresh tokens |

Every Firestore concept in the brief translates directly, and usually more
strongly:

| Brief says | We implement as |
|---|---|
| Firestore collections | Prisma models with real foreign keys + cascades |
| Firestore security rules | Server-side guards + per-query ownership checks (nothing is client-trusted) |
| Cloud Functions | NestJS services running in the API process |
| Firestore indexes | Postgres indexes declared in the schema |
| Firebase Storage | Local disk store behind an authenticated download route (S3-compatible later) |
| Realtime listeners | Socket.IO rooms fed by server-side emitters |

---

## 1. Current architecture assessment

**Sound and kept as-is:**

- Modular NestJS API: `auth, users, courses, sessions, quiz, polls, qa,
  content, ai, analytics, audit, realtime, health` — no god-files.
- Security posture is already server-authoritative: answer keys live in a
  separate `question_keys` table never joined by student queries; duplicate
  answers/votes are rejected by unique DB constraints; question timing is
  server-side (`closesAt`), the browser countdown is decoration; every route is
  authenticated by default (`@Public()` is opt-in).
- Append-only `audit_logs` with an admin browser.
- Cursor pagination helper with take-clamping (`common/pagination.ts`).
- Web app: typed API client with in-memory access token + persisted rotating
  refresh token; a real component kit (tables, drawers, toasts, skeletons,
  empty/error states); navigation as data (`shell/nav.ts`); light/dark
  semantic tokens.
- Live classroom loop works end-to-end: room codes, presence, attendance with
  reconnect-safe `secondsPresent`, live MCQ/short questions, polls, Q&A,
  teacher heartbeat auto-close.
- Course content: Module → Lesson → Resource with DRAFT/PUBLISHED/SCHEDULED/
  ARCHIVED gating enforced in the Prisma `where`, per-lesson progress with
  resume position, continue-learning endpoint.

**Weak or missing (the gaps this brief targets):** see §2.

**Broken/fake functionality found:** none in `apps/` — earlier passes removed
it. `legacy/` remains reference-only. AI endpoints return 503 until
`GROQ_API_KEY` is set (documented dependency, not fake UI).

---

## 2. Feature gap matrix

| Brief § | Feature | Status before | Plan |
|---|---|---|---|
| 4 | Roles STUDENT/TEACHER/ADMIN + approval flow | ✅ exists | keep; finer roles deferred (§9 below) |
| 5 | Student home | ✅ basic | extend: due assignments, notifications |
| 6 | Timetable | ⚠️ `schedule_slots` table exists, **no API/UI** | **build now**: week view, slot CRUD, conflict detection |
| 7/27 | Calendar | ❌ | merged agenda: slots + due dates + sessions |
| 8 | Modules/lessons/materials/progress | ✅ exists | keep |
| 9 | Course announcements | ❌ | **build now** |
| 10–11 | Assignments + submissions + grading | ❌ | **build now** (files, drafts, late, resubmit, grade/return) |
| 12–14 | Question bank / exam mode | ❌ | designed (§8 schema), next phase |
| 15 | Live classroom | ✅ core | keep; reactions deferred |
| 16–18 | Attendance + live analytics | ✅ | keep |
| 19–20 | Gradebook, weighted categories, student grades | ❌ | **build now** |
| 21–22 | Teacher/admin analytics | ✅ basic | keep |
| 23–24 | AI tools | ⚠️ quiz + paper exist (need GROQ key) | keep; more generators later |
| 25 | Discussions | ❌ | deferred, designed |
| 26 | Notification center | ❌ | **build now** (bell, unread, mark read, fan-out) |
| 28 | File management | ❌ | **build now** (validated upload, authed download) |
| 29–31 | Admin console, enrollment, roster | ✅ | keep |
| 34 | Audit log | ✅ | extended to new mutations |
| 38–41 | Dark mode, design system | ✅ | keep |
| 44 | Demo data | ✅ seed | extend for new features |
| 46 | Quiz reliability | ✅ live path | async exam engine next phase |
| 52 | Testing | ⚠️ quiz + paper specs | add grade-calc + conflict specs |
| 3 | Multi-tenant organizations | ❌ | **deliberately deferred** — see §9 |

---

## 3. Proposed architecture (unchanged shape, new modules)

```
apps/api/src/
├── assignments/    ← NEW  assignment CRUD, submissions, grading
├── gradebook/      ← NEW  categories, weighted computation, scales
├── announcements/  ← NEW  course announcements, scheduled publish
├── notifications/  ← NEW  per-user notification fan-out + bell API
├── timetable/      ← NEW  slot CRUD + conflict detection + merged agenda
├── files/          ← NEW  disk-backed upload/download with permission checks
└── (existing modules unchanged)

apps/web/src/pages/
├── student/  Assignments, AssignmentDetail, Grades, Timetable
├── teacher/  Assignments, AssignmentGrading, Gradebook, Timetable
└── shared/   NotificationsBell (in AppShell)
```

## 4. Schema additions (Prisma — see `schema.prisma` for the authority)

```
GradeCategory   courseId, name, kind(ASSIGNMENTS|LIVE_QUIZZES|ATTENDANCE),
                weightPct, order
Assignment      courseId, categoryId?, title, instructions, maxMarks, dueAt,
                availableFrom?, status(ContentStatus), allowLate,
                latePenaltyPct, resubmissions
Submission      assignmentId+studentId unique, attempt, text, status
                (DRAFT|SUBMITTED|GRADED|RETURNED), isLate, marksAwarded,
                feedback, gradedById, timestamps
StoredFile      owner, name, mime, size, purpose, on-disk key; linked from
                assignments (attachments) and submissions (uploads)
Announcement    courseId, authorId, title, body, priority, status, publishAt
Notification    userId, type, title, body, link, readAt
```

Grade computation (server-side only):
- category score = mean of item percentages (assignments: `marksAwarded/maxMarks`
  of GRADED/RETURNED items; live quizzes: earned/possible marks across the
  course's closed questions; attendance: attended/held sessions)
- course grade = Σ(category score × weight) / Σ(weights of categories that
  have data) — categories with no data yet don't drag the grade to zero
- letter scale: fixed default (A ≥ 85, B+ ≥ 80, B ≥ 75, C+ ≥ 70, C ≥ 65,
  D ≥ 50, F), unit-tested

## 5. Security model

- Global JWT guard; `@Roles()` per route; **every** service method re-checks
  ownership (teacher owns course / student enrolled) inside the query itself,
  not after fetching.
- Students can never read: another student's submission, unpublished
  assignments/announcements, marks before grading, answer keys.
- Marks, late flags, submission timestamps are computed server-side; the
  client sends only text/file references.
- File downloads go through `/api/files/:id` which re-derives permission from
  the file's linkage (submission owner / course teacher / admin / enrolled
  student for assignment attachments). No public static serving; the uploads
  directory sits outside version control.
- Upload validation: size ≤ 20 MB, allowlisted MIME classes, random disk
  names — the original filename is metadata only.
- All new mutations that affect academic records (grade, publish, override)
  write to `audit_logs`.
- Rate limiting stays global (Nest throttler) with tighter buckets on AI.

## 6. Implementation roadmap

| Phase | Scope | State |
|---|---|---|
| 1–2 | Architecture, auth, live classroom, content, audit | ✅ shipped previously |
| **3a** | Files + Assignments + submissions + grading | **this pass** |
| **3b** | Gradebook (categories, weights, letters, student view) | **this pass** |
| **3c** | Announcements + Notification center | **this pass** |
| **3d** | Timetable (slot CRUD, conflicts, week view, agenda) | **this pass** |
| 4 | Question bank + scheduled/async assessments + exam mode (attempt rows, autosave, server deadline, reconnect recovery) | designed, next |
| 5 | Discussions, reactions, parent portal | designed |
| 6 | Organizations/multi-tenancy | deferred — §9 |
| 7 | Observability, backups, CSV/PDF export | partial (paper PDF exists) |

## 9. Deliberate deferrals (documented, not pretended)

- **Multi-tenancy (brief §3)**: adding `organizationId` to every table is a
  breaking migration touching every query. For a single-institution
  deployment it adds risk without user-visible value. The schema is designed
  (Organization → Department → Semester; `orgId` FK on User/Course; unique
  constraints scoped by org) and the migration is additive-possible
  (single default org backfill), so it can land later without data loss.
  Decision point for the product owner.
- **Granular permission strings (§4)**: three roles + ownership checks cover
  every current screen; a permission table with no second tenant is
  speculative. Revisit with multi-tenancy.
- **Exam engine (§14, §46)**: needs its own attempt/answer tables and a
  reconnect protocol; scheduled as Phase 4 rather than shipped half-safe.
- **AI expansion (§23–24)**: blocked on `GROQ_API_KEY` being present at all;
  existing quiz/paper generators are the pattern to extend.
