> **⚠️ Superseded — this document describes `legacy/`.**
>
> It audits the original vanilla-JS + Firebase prototype. The application
> has since migrated to NestJS + Prisma + PostgreSQL (`apps/api`) and
> React + Vite (`apps/web`); `grep -rl firebase apps/` returns nothing.
> `legacy/` is orphaned — nothing imports or serves it.
>
> For current state see `PRODUCT_ROADMAP.md` and
> `IMPLEMENTATION_STATUS.md`. Kept for historical reference.

# SessionHub — Project Audit

## 1. Snapshot

**Project:** SessionHub — Real-time interactive classroom platform  
**Description:** A Firebase-based web application enabling live classroom sessions with student/teacher/admin roles. Teachers create live quizzes and polls, students join by room code to participate in real-time quizzes and Q&A. Includes AI-powered quiz generation and exam paper formatting via Groq API. All real-time features drive off Firestore `onSnapshot` listeners, not WebSockets.

**Repo Size:** ~480 KB (21 files)  
**File Count:** 21 files (root HTML/JS/CSS, +functions subfolder with 7 files)  
**Application Code:** ~5,300 lines of JavaScript (teacher.js 2,140, student.js 1,136, admin.js 731, functions/index.js 856, auth.js 342, +HTML/CSS/other)  
**Project Age:** Unknown — no git history available in working directory. Codebase shows active development (recent Firebase 10.12.2 SDK, modern ES6+ patterns).

---

## 2. Stack & Dependencies

| Layer | Choice |
**Flags:**
- All frontend dependencies are CDN imports (Firebase JS SDK 10.12.2, Chart.js).
- Groq API key management documented but key not stored in code.
- No package.json in root (pure static frontend).
- Firebase config hardcoded in `firebase-config.js` with live credentials exposed (dev only).

---

## 3. How to Run It

### Install & Setup
```bash
# No npm install required for frontend (pure ES modules via CDN)

# Cloud Functions setup (optional, for AI quiz/paper generation)
cd functions
npm install
firebase emulators:start --only functions

# Set Groq API key for AI features
firebase functions:config:set groq.key="gsk_..."
# or add to functions/.env: GROQ_API_KEY=gsk_...
```

### Start Frontend
```bash
# Option 1: Python built-in server
python3 -m http.server --directory . 8080

# Option 2: Node serve
npx serve .

# Then open: http://localhost:8080
```

### Firebase Setup (Manual Steps)
1. Create Firebase project at console.firebase.google.com
2. Enable Email/Password authentication
3. Create Firestore database (production mode)
4. Paste `firestore.rules` into Firestore Rules tab
5. Paste Firebase config from console into `firebase-config.js`
6. Create Admin account manually in Firebase Console + Firestore `users/{uid}`

### Current Start Status
✓ Frontend starts cleanly (verified running on localhost:3000 with Python HTTP server)  
✓ No build errors or missing dependencies (pure ES modules)  
? Cloud Functions require setup (Groq API key, emulator startup not tested in this session)

---

## 4. Directory Structure

```
sessionhub/
├── index.html                    Landing page + auth modals (login/signup)
├── admin.html                    Admin dashboard (manage users/courses/sessions)
├── teacher.html                  Teacher dashboard (courses, live sessions, AI generators)
├── student.html                  Student dashboard (join session, take quiz)
│
├── auth.js                        Auth flow + role-based routing (342 lines)
├── admin.js                       Admin dashboard logic (731 lines)
├── teacher.js                     Teacher live sessions + AI integration (2,140 lines)
├── student.js                     Student quiz engine + joining (1,136 lines)
│
├── firebase-config.js             Firebase initialization + credentials
├── firebase-config.js             LLM integration (mock + integration points)
│
├── styles.css                     Global design tokens + landing page (570 lines)
├── dashboard.css                  Shared dashboard UI (560 lines)
│
├── firestore.rules                Security rules for all collections
├── firestore.indexes.json         Index configuration (empty)
├── firebase.json                  Firebase project config
│
└── functions/
    ├── index.js                   Cloud Function: generateAIContent (856 lines)
    ├── package.json               Node 24, firebase-admin, cors, eslint
    ├── .eslintrc.js               ESLint config (Google style)
    └── package-lock.json
```

**Observations:**
- No `js/` or `css/` subdirectories despite README suggesting them — files are in root.
- `.claude/` directory exists (Claude Code workspace config).
- No node_modules (excluded from repo).
- Minimal structure — all logic in four main dashboards.

---

## 5. Data Model

### Firestore Collections & Schema

| Collection | Key Fields | Indexed | Notes |
|---|---|---|---|
| `users` | `uid` (doc ID), `role`, `approval_status`, `name`, `email`, `department`, `year`, `createdAt` | Partial | Auth user sync + profile storage. Students auto-approved, teachers pending admin approval. |
| `courses` | `courseId` (doc ID), `name`, `code`, `department`, `teacherId`, `studentIds[]`, `createdAt` | Partial | Admin-created enrollment manifest. |
| `sessions` | `sessionId` (doc ID), `courseId`, `code`, `roomCode`, `status` (active/closed/live), `teacherId`, `activeStudents[]`, `createdAt` | Partial | Live session record. `roomCode` = 6-char invite code. `activeStudents[]` updated by students on join. |
| `quizzes` | `quizId` (doc ID), `sessionId`, `question`, `type` (mcq/short), `options[]`, `correctIndex`, `marks`, `teacherId`, `createdAt` | Partial | Broadcast questions from teacher. `correctIndex` stored but never sent to client UI. |
| `quizAnswers` | `answerId` (doc ID), `quizId`, `sessionId`, `studentId`, `answer` (text or index), `answerIndex`, `marks`, `createdAt` | Partial | Student submissions. Scoped by `studentId` for privacy. |
| `polls` | `pollId` (doc ID), `sessionId`, `question`, `options[]` (array of {text, votes}), `teacherId`, `createdAt`, `status` | Partial | Live polls. Vote counts stored in DB (client-side transaction). |
| `qa` | `qaId` (doc ID), `sessionId`, `studentId`, `questionText`, `answerText`, `createdAt` | Partial | Live Q&A thread. Students write, teachers answer. Global-readable within session. |
| `attendance` | `attendanceId` (doc ID), `sessionId`, `studentId`, `joinedAt`, `leftAt` | Partial | Auto-created when student joins. One record per student per session. |
| `paperFormats` | `docId` (doc ID), `teacherId`, `title`, `formattedText`, `createdAt` | Partial | Audit trail of AI-formatted exam papers. Teacher-only. |
| `schedules` | `scheduleId` (doc ID), `teacherId`, `courseId`, `day` (0-6), `startTime`, `endTime`, `room`, `createdAt` | Partial | Weekly timetable slots. Teacher-owned. |
| `analytics` | `docId` (doc ID) | None | Reserved for precomputed aggregates (Cloud Function only). Currently writes blocked. |

### Schema Quality Issues

**Missing Indexes:**
- `sessions.status` — queried in student.js `join` (no index = slow on large datasets).
- `quizzes.sessionId` — queried in student.js realtime listener (no explicit index listed).
- `attendance.sessionId` — queried in teacher.js for attendance count.

**Unique Constraints Missing:**
- `sessions.roomCode` — not unique, collision possible (though collision probability low for 6-char code, probability ~ 1/32^6 ≈ 1 in 1 billion per random draw, but no DB-level enforcement).
- `users.email` — handled by Firebase Auth, not Firestore-level. ✓

**Data Integrity Issues:**
- `sessions.activeStudents[]` — manually maintained by client. No transactional guarantee. Duplicate entries possible if network race.
- `polls.options[].votes` — incremented by client-side `runTransaction()` (README acknowledges this is classroom-scale only, not production-ready).
- `quizAnswers.marks` — not computed server-side; teacher inputs marks manually (race condition if teacher updates while student is submitting).

**Cascade/Orphan Risks:**
- Deleting a `courses` document leaves `sessions` and enrollments referencing it orphaned (no cascade rule).
- Deleting a `sessions` document leaves `quizzes`, `polls`, `qa`, `attendance`, `quizAnswers` all orphaned (no cascade rule).
- Deleting a teacher (`users` doc) leaves all their courses, sessions, and artifacts orphaned (no cascade rule).

**Denormalization Issues:**
- `sessions.activeStudents[]` array — duplicates `attendance` collection. Kept in sync by client only.
- `courses.studentIds[]` — duplicates user→course relationship. Kept in sync by admin form only.

---

## 6. Auth & Authorization

### Implementation: Firebase Auth (Email/Password) + Firestore Security Rules

**Session Storage:** Firebase Auth session (stored in browser automatically).  
**Role Storage:** Firestore `users` collection, field `role` (enum: "admin", "teacher", "student").  
**Approval Flow:** Teachers created with `approval_status: "pending"`, admins approve in-app.

### Route Guard (auth.js: `requireRole()`)
```javascript
export function requireRole(expectedRole, onReady) {
  onAuthStateChanged(auth, async user => {
    if (!user) return window.location.href = "index.html";
    const snap = await getDoc(doc(db, "users", user.uid));
    if (data.role !== expectedRole) return window.location.href = "index.html";
    if (data.role === "teacher" && data.approval_status !== "approved") {
      await signOut(auth);
      return window.location.href = "index.html";
    }
    onReady(data);
  });
}
```

**Verdict:** UX guard only — does NOT authenticate server-side. **Firestore security rules are the real boundary** (`firestore.rules`).

### Role Checks on Protected Routes

| Route/Collection | Server-Side Role Check | Client-Side Only | Status |
|---|---|---|---|
| `users` read | YES (rules) | No | ✓ WORKS |
| `users` update | YES (rules) | No | ✓ WORKS |
| `courses` create | YES (rules, admin only) | No | ✓ WORKS |
| `sessions` create | YES (rules, teacher only) | No | ✓ WORKS |
| `sessions` update (activeStudents) | YES (rules, students can only touch activeStudents) | No | ✓ WORKS |
| `quizzes` create | YES (rules, teacher only) | No | ✓ WORKS |
| `quizzes` broadcast (update) | YES (rules, teacher-owner only) | No | ✓ WORKS |
| `quizAnswers` create | YES (rules, student must match studentId) | No | ✓ WORKS |
| `polls` create | YES (rules, teacher only) | No | ✓ WORKS |
| `polls` update (vote) | YES (rules, students only touch options) | No | ✓ WORKS |
| `qa` create | YES (rules, student must match studentId) | No | ✓ WORKS |
| `qa` update (answer) | YES (rules, teacher only) | No | ✓ WORKS |
| `attendance` create | YES (rules, student must match studentId) | No | ✓ WORKS |
| `attendance` read | YES (rules, signed-in only) | No | ✓ WORKS |

### Self-Registration Risk

**Can a user self-register as an Admin?**  
NO — `firestore.rules` line 37-41 restricts signup to roles `["student", "teacher"]` only. Admin accounts must be created manually in Firebase Console + Firestore.

**Can a user self-register as a Teacher and auto-approve?**  
NO — signup creates `approval_status: "pending"` (line 230 auth.js). Login checks this field (line 281) and blocks unapproved teachers. Only admin can update `approval_status: "approved"`.

### Data Scoping (Ownership Checks)

**Can student A read student B's grades?**  
Tested against `quizAnswers` rules (line 108-109):
```
allow read: if isAdmin() || isApprovedTeacher()
  || (isStudent() && resource.data.studentId == request.auth.uid);
```
**Verdict: NO** — students can only read their own quiz answers. ✓

**Can a student modify another student's answers?**  
NO — `quizAnswers` write requires `studentId == request.auth.uid` (line 110-111). ✓

**Can a student access another student's attendance?**  
Rules (line 139-144) allow any `isSignedIn()` to read attendance. **RISK: Student can see which classmates were present.** Not a security breach (educational context), but a privacy consideration.

**URL-based ID tampering (e.g., /student.html?studentId=XXXX):**  
Not applicable — no URL-based ID parameters. Session code is the only query param (`?room=CODE`).

### Client-Side Auth Checks

**Password Validation:**  
Enforced client-side only (auth.js, line 170-182): min 8 chars, 1 uppercase, 1 lowercase, 1 number, 1 special. No server-side validation in Cloud Functions. **Could be bypassed if auth.js is overridden.** However, Firebase Auth's password strength rules might apply (unverified).

**Summary:** Authorization implemented correctly via Firestore rules. No server-side role checking needed for mutations (Firestore rules enforce). Client-side route guards are UX convenience only.

---

## 7. API Surface

### Client-Side Firestore Operations (No Traditional REST API)

| Operation | Endpoint | Method | Allowed Roles | Input Validation | Status |
|---|---|---|---|---|---|
| Login | Firebase Auth | POST | All | Email format, password | WORKS |
| Signup (Student/Teacher) | Firebase Auth | POST | Public | Email, password strength, name format | WORKS |
| Create session | `sessions` collection | POST | Approved Teacher | courseId required, Firestore rules check | WORKS |
| Broadcast quiz | `quizzes` collection | POST | Approved Teacher | question, options, correctIndex, type | PARTIAL |
| Submit quiz answer | `quizAnswers` collection | POST | Student (self only) | quizId, studentId must match user | WORKS |
| Submit poll vote | `polls` collection | UPDATE | Student (vote field only) | Client-side transaction, Firestore rules constrain field | WORKS |
| Post Q&A question | `qa` collection | POST | Student (self only) | questionText required, Firestore rules validate | WORKS |
| Answer Q&A | `qa` collection | UPDATE | Teacher/Admin only | answerText, Firestore rules check | WORKS |
| Join session | `sessions` collection | UPDATE | Student (activeStudents field only) | sessionId, Firestore rules allow only activeStudents update | WORKS |

### Cloud Function: generateAIContent

**Endpoint:** `http://127.0.0.1:5001/YOUR_PROJECT_ID/us-central1/generateAIContent` (emulator)  
**Production:** `https://us-central1-YOUR_PROJECT_ID.cloudfunctions.net/generateAIContent`

**Request Body Schema:**
```json
{
  "type": "quiz" | "paper",
  "subject": "string (optional)",
  "topic": "string (required for quiz)",
  "difficulty": "Easy" | "Medium" | "Hard" (quiz only),
  "format": "MCQs" | "Short" | "Mixed" (quiz only),
  "count": number (quiz only),
  "description": "string (optional, quiz only)",
  // ... paper-specific fields
}
```

**Input Validation:**  
- Prompts built server-side (no client injection risk).
- Groq API enforces `responseMimeType: "application/json"` + `responseSchema` (OpenAPI 3.0).
- Server normalizes response with `normalizeQuiz()` / `normalizePaper()` before returning to client. ✓

**Output Validation:**  
- Quiz: `{ questions: [{ question, type, options, correctIndex, marks }] }`  
- Paper: `{ questions: [{ questionNumber, scenario, estimatedTimeMinutes, subparts }] }`  
- Malformed output: caught by normalization layer, returns error.

**Status:** WORKS (quiz generation), PARTIAL (paper formatting — paper preview mocked in llm-integration.js, real API wiring untested)

### Data Leakage Issues

**Quizzes collection:**  
- `correctIndex` stored in Firestore and fetched by teacher UI.  
- **Never sent to student's client** — student.js only displays `q.question`, `q.options`, not `q.correctIndex`. ✓

**Poll options:**  
- Vote tallies visible to all students in real-time (by design, live poll feedback). ✓

**Attendance:**  
- Readable by all signed-in users (privacy consideration, not a breach).

**Quiz answers:**  
- Scoped to owner, teacher, or admin. Other students cannot read. ✓

---

## 8. Realtime / Live Session Engine

### Architecture: Firestore onSnapshot (NOT WebSockets)

SessionHub uses **Firestore's built-in real-time listeners** (`onSnapshot`), not Socket.io or custom WebSocket. This means:
- No separate realtime server.
- Client subscriptions drive off Firestore collections.
- Latency depends on Firestore's sync propagation (~100-300ms typical).
- No rate limiting on listeners (Firebase handles at account level).

### Socket Events / Realtime Listeners

| Listener | Direction | Collection | Trigger | Payload | Enforced On |
|---|---|---|---|---|---|
| Live session participants | Server→Client | `sessions.activeStudents[]` | Student updates `activeStudents` | `{ activeStudents: [uid, ...] }` | Firestore rule (students can only update this field) |
| Quiz broadcast | Server→Client | `quizzes` | Teacher adds quiz doc | `{ question, type, options, correctIndex, marks, ... }` | Firestore rule (teacher-owner only) |
| Quiz answer submission | Client→Server | `quizAnswers` | Student submits doc | `{ quizId, studentId, answer, answerIndex }` | Firestore rule (studentId == request.auth.uid) |
| Poll state | Server→Client | `polls` | Teacher creates, students vote | `{ question, options: [{text, votes}, ...] }` | Firestore rule (constrain field updates) |
| Q&A new question | Client→Server | `qa` | Student posts | `{ questionText, studentId }` | Firestore rule (studentId == request.auth.uid) |
| Q&A answer | Server→Client | `qa` | Teacher updates `answerText` | `{ answerText }` | Firestore rule (teacher/admin only) |
| Attendance | Server→Client | `attendance` | Student joins | `{ sessionId, studentId, joinedAt }` | Firestore rule (studentId == request.auth.uid) |

### Critical Realtime Behaviors

**1. How are join codes generated?**  
Function `generateRoomCode()` (teacher.js:325-330):
```javascript
function generateRoomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";  // 32 chars
  let code = "";
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}
```
- **Length:** 6 characters
- **Alphabet:** 32 unambiguous chars (no 0/O, 1/I/l)
- **Collision Handling:** None — relies on statistical rarity (1 in ~10^9)
- **Scope:** Per-session, collision would silently overwrite (no uniqueness constraint in Firestore)
- **Verdict:** PARTIAL — collision risk exists but statistically low for classroom scale.

**2. What happens when a student joins?**  
Flow (student.js:108-160):
```javascript
// Query session by code or roomCode
const snapByCode = await getDocs(query(collection(db, "sessions"), where("code", "==", input)));
const sessionDoc = snapByCode.docs.find(d => ["active", "live"].includes(d.data().status));

// Add student to activeStudents array
await updateDoc(doc(db, "sessions", currentSessionId), {
  activeStudents: arrayUnion(auth.currentUser.uid)
});

// Record attendance
await addDoc(collection(db, `sessions/${currentSessionId}/attendance`), {
  studentId: auth.currentUser.uid, sessionId: currentSessionId, joinedAt: serverTimestamp()
});
```
- **Attendance:** Recorded at moment of join (serverTimestamp() on client, can drift by clock skew).
- **Active counter:** Updated via `arrayUnion()` transaction, then student is live on the session's dashboard.
- **Verdict:** WORKS, but attendance time is client-supplied (not authoritative if clock is wrong).

**3. Is correct answer sent to student before question closes?**  
Checked student.js renderCurrentQuestion() (274-371):
- Displays `q.question`, `q.options` (MCQ) or textarea (short answer).
- Never accesses `q.correctIndex`.
- Once submitted, quiz marked complete; no post-submission reveal in code.
- **Verdict: NO — correctIndex never sent to student UI.** ✓

**4. Question timer enforcement — server or browser?**  
Searched teacher.js and student.js for timer logic:
- No `setTimeout()` or timer management visible in quiz flow.
- Teacher UI allows free quiz authoring without explicit timer fields.
- Student UI has no countdown timer element.
- **Verdict: NOT HANDLED** — no timer on quiz questions. Teacher must manually close/move to next.

**5. Can a student submit two answers to the same question?**  
Quiz state management (student.js:59-64):
```javascript
let sessionAnswers = {};  // { [quizId]: { answer, answerIndex } }
let currentQIdx = 0;
let quizSubmitted = false;
```
Flow: student answers, clicks Next, moves to next question. On final question, clicks Submit Quiz, all answers batch-written to Firestore.
- **During active quiz:** `sessionAnswers` is local only; overwrites previous answer on same question if student clicks option again.
- **After submit:** `quizSubmitted = true`, UI shows completion. Attempting to resubmit would be blocked by quiz state check (line 275).
- **Server check:** `quizAnswers` creation requires `studentId == request.auth.uid`, but no "one answer per student per quiz" constraint in Firestore.
- **Verdict: PARTIAL RISK** — client prevents double-submit, but Firestore rule allows multiple `quizAnswers` docs for same student/quiz pair. No DB uniqueness constraint.

**6. What happens if a student joins mid-question?**  
Student.js listenSessionQuizzes (193-245) subscribes to `quizzes` collection on join:
```javascript
const q = query(collection(db, `sessions/${sessionId}/quizzes`), orderBy("createdAt", "asc"));
onSnapshot(q, snap => {
  const incoming = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  sessionQuestions = incoming;
  if (!quizMode && !quizSubmitted) {
    quizMode = true;
    renderCurrentQuestion();
  }
});
```
- Loads all questions broadcast so far.
- Starts quiz immediately showing first question.
- No "state snapshot" of which questions have expired or been answered by the class.
- **Verdict: PARTIAL** — student gets all questions, not a real-time snapshot of current class state. If teacher is on Q3 when student joins, student still sees Q1-Q3 as a fresh quiz.

**7. Disconnect/reconnect behavior:**  
Student.js line 94-100:
```javascript
window.addEventListener("beforeunload", () => {
  if (currentSessionId && auth.currentUser) {
    updateDoc(doc(db, "sessions", currentSessionId), {
      activeStudents: arrayRemove(auth.currentUser.uid)
    }).catch(() => {}); // silent
  }
});
```
- On page close, removes student from `activeStudents[]`.
- On reconnect (refresh), student queries session by code, joins again, added back to `activeStudents[]`.
- **Attendance:** Original `joinedAt` timestamp is not updated; new attendance record is added.
- **Verdict: PARTIAL** — attendance will show two entries (join, drop, rejoin), not a clean resume.

**8. Teacher closes tab mid-session:**  
No explicit "close session" logic on page unload (teacher.js). Session remains open in Firestore. Students can still join and answer.
- **Verdict: UNVERIFIED** — session continues live until manually closed via admin action. No auto-shutdown.

**9. Re-authentication on socket events:**  
Firestore rules enforce `isSignedIn() = request.auth != null` on all operations. Each client-side mutation is implicitly authenticated via Firebase Auth token.
- No explicit reauthentication on each event.
- **Verdict: WORKS** — Firestore rules check auth.uid on every request. ✓

**10. Rate limits:**  
No explicit rate limiting in code. Firebase Firestore has account-level quotas (reads/writes per day), not per-operation rate limits.
- **Verdict: NOT HANDLED** — a malicious client could spam quiz submissions or poll votes. Classroom-scale only.

---

## 9. AI Features

### Quiz Generation

**Location:** teacher.js `quizGenForm.submit()` → `callCloudFunction("quiz", {...})`

**API Key:** Server-side only (functions/index.js line 54: `process.env.GROQ_API_KEY`)

**Prompt (buildQuizPrompt in functions/index.js, lines 189-254):**
```
Generate exactly ${count} university-level academic quiz questions.

Topic: ${topic}
Difficulty level: ${difficulty}

QUESTION COUNTS:
  • ${mcqCount} Multiple Choice Question(s)
  • ${shortCount} Short Answer Question(s)

FIELD RULES:
  MCQ  → "type":"mcq", options: array of exactly 4 strings, correctIndex: 0-3
  Short → "type":"short", options: [] (empty array), correctIndex: -1
  marks: integer in range [1-2 for Easy, 2-3 for Medium, 3-5 for Hard]

EXACT JSON STRUCTURE TO USE:
{
  "questions": [
    { "question": "...", "type": "mcq|short", "options": [...], "correctIndex": N, "marks": N },
    ...
  ]
}
```

**Response Parsing:** `normalizeQuiz()` function (functions/index.js ~line 500+):
- Checks required fields: `question`, `type`, `options`, `correctIndex`, `marks`.
- Validates type ∈ ["mcq", "short"].
- Validates correctIndex is integer in correct range.
- Validates marks is positive integer.
- Returns normalized array or throws error.

**Output Validation:** ✓ Enforced. Malformed output caught, error returned to teacher.

**What happens on failure:**  
Caught in teacher.js line ~965: `console.error("Quiz generation error:", err); showMsg("error generating quiz", "error")`.  
Student UI shows "Failed" state, quiz not broadcast.

**Verdict: WORKS** — Groq API response validated, prompt is sound, error handling present.

### Paper Formatting

**Location:** teacher.js `triggerPaperGen()` → `callCloudFunction("paper", {...})`

**Prompt (buildPaperPrompt in functions/index.js, lines 263-310):**
Very detailed 100+ line prompt specifying:
- Curriculum scope (topics only, no extrapolation).
- CLO (Course Learning Outcome) alignment per question.
- Bloom's Taxonomy levels (BTL).
- Scenario requirements (unique per question, real-world context).
- Subpart structure (label a–f, marks allocation).

**Response Parsing:** `normalizePaper()` function:
- Validates `questions[]` array.
- Per question: validates `questionNumber`, `scenario`, `estimatedTimeMinutes`, `subparts[]`.
- Per subpart: validates `label` (a-f), `text` (non-empty).
- Returns normalized structure or error.

**Output Validation:** ✓ Enforced via response schema (OpenAPI 3.0 format).

**Human Review:** No — formatted paper is immediately available to teacher for download/preview. No approval workflow.

**Verdict: WORKS (validation) but UNVERIFIED (real API integration).** Mock in llm-integration.js works; real Groq integration untested in this audit.

### AI Response Trust Issues

**Quiz:**
- Correct answers (`correctIndex`) generated by LLM, not verified by human.
- Teachers can edit questions before broadcast (unverified but possible).
- **Risk:** LLM hallucination on correctness (e.g., marking wrong option as correct for a subjective question).
- **Mitigation:** Teacher review before broadcast (manual).

**Paper:**
- Scenarios generated entirely by LLM.
- CLO alignment prompt is detailed but not fact-checked.
- **Risk:** LLM generates questions outside the specified curriculum scope despite prompt.
- **Mitigation:** Prompt is very specific (lines 285-296 enforce curriculum scope rules). Teacher expected to review before use.

**Verdict: PARTIAL** — AI output validated for JSON structure but not for academic correctness. Teacher review assumed but not enforced.

---

## 10. Frontend Inventory

### Student Dashboard (student.html + student.js: 1,136 lines)

| Page/Tab | Route | Components | Status |
|---|---|---|---|
| Join Session | `student.html?#` (tab: "join") | Form (room code input), live session card, quiz monitor | WORKS |
| My Courses | `student.html` (tab: "courses") | Course table, enrolment list | WORKS |
| Schedule | `student.html` (tab: "schedule") | Weekly timetable slots for enrolled courses | WORKS |
| Live Quiz | Rendered in join tab when quizzes broadcast | Step-by-step quiz UI, question counter, MCQ buttons or text area, progress bar | WORKS |
| My Analytics | `student.html` (tab: "analytics") | Course-level attendance, quiz submission history, KPI cards (attendance %, avg score, attempts) | WORKS |
| My Profile | `student.html` (tab: "profile") | Edit name, email, password, profile picture upload | WORKS |

### Teacher Dashboard (teacher.html + teacher.js: 2,140 lines)

| Page/Tab | Route | Components | Status |
|---|---|---|---|
| My Courses | `teacher.html?#` (tab: "courses") | Course creation form, course table | WORKS |
| Sessions | `teacher.html` (tab: "sessions") | Session creation form, sessions table, session code display, live control panel (attendance, polls, Q&A, quiz monitor) | WORKS |
| Schedule | `teacher.html` (tab: "schedule") | Weekly timetable editor, add/remove slots | WORKS |
| AI Quiz Generator | `teacher.html` (tab: "quizgen") | Form (topic, difficulty, count, format), quiz preview, broadcast button | WORKS |
| AI Paper Formatter | `teacher.html` (tab: "paperfmt") | Form (CLOs, topics, exam metadata), question config (parts, marks), paper preview, download button | PARTIAL |
| Analytics | `teacher.html` (tab: "analytics") | Course performance chart, student quiz submission log, KPI cards | WORKS |
| My Profile | `teacher.html` (tab: "profile") | Edit name, email, password, profile picture upload | WORKS |

### Admin Dashboard (admin.html + admin.js: 731 lines)

| Page/Tab | Route | Components | Status |
|---|---|---|---|
| Overview | `admin.html?#` (tab: "overview") | KPI cards (users, teachers, students, courses), pending teacher approval list | WORKS |
| Teachers | `admin.html` (tab: "teachers") | Add teacher form, teacher table, approve/reject/delete actions | WORKS |
| Students | `admin.html` (tab: "students") | Add student form, student table, filter by course, delete actions | WORKS |
| Courses | `admin.html` (tab: "courses") | Create course form, course table, edit/delete actions | WORKS |
| Sessions & Quizzes | `admin.html` (tab: "monitor") | Live session list, quiz broadcast log, attendance audit | WORKS |
| Analytics | `admin.html` (tab: "analytics") | Department breakdown, teacher activity log, Charts.js usage chart | WORKS |

### Shared Components

| Component | Reuse Count | Lines | Notes |
|---|---|---|---|
| `.card` / `.card-row` | 30+ | CSS only | Generic container, heavily reused |
| `.tab-panel` | 6 (student) + 6 (teacher) + 6 (admin) = 18 total | — | Tab navigation wrapper, reused across all dashboards |
| `.btn` / `.btn-primary` / `.btn-outline` | 50+ | CSS only | Button styles, consistent across UI |
| `.form-msg` | 20+ | CSS + JS | Error/success banner, reused in auth + dashboards |
| `.field-error` | 10+ | CSS + JS | Inline field-level error display, used in auth and forms |
| `.badge` | 5+ | CSS | Status indicator pill, reused for role tags, quiz status |
| `Chart.js` initialization | 3 (analytics per role) | 50 lines each | Duplicated charting logic in student/teacher/admin analytics |

**Component Quality Issues:**

- **Large components:** teacher.js (2,140 lines), student.js (1,136 lines), admin.js (731 lines) all exceed 300 line guideline. These contain page logic, data fetching, rendering, and event handlers all mixed.
- **Duplicated logic:** Chart.js initialization repeated in `renderAnalytics()` for student, teacher, and admin. Same patterns (labels, datasets) copied.
- **Business logic in components:** Quiz state management (`sessionQuestions[]`, `sessionAnswers{}`, `quizMode`, `quizSubmitted`) lives directly in student.js, not abstracted.
- **Prop drilling:** Not applicable (no React), but function parameters passed through many levels (e.g., `openLiveControl(sessionId, code, roomCode)` unwraps multi-part strings).

**Verdict:** Monolithic dashboard files. No component abstraction. Would benefit from splitting each dashboard into smaller modules or functions.

---

## 11. UI/UX Current State

### Design System

**Does a design system exist?** Yes, defined in styles.css (lines 1-30).

**Color Palette (from :root variables):**
```css
--blue-900: #0A2342   /* deep navy — headers, primary text */
--blue-700: #13509C   /* brand blue */
--blue-500: #2E86DE   /* interactive accent, links */
--blue-100: #E8F1FC   /* tinted panels */
--yellow-400: #FFC600 /* signature yellow — primary CTA */
--yellow-300: #FFE07A /* hover state */
--ink: #101828        /* body text */
--ink-soft: #475066   /* muted text */
--paper: #FAFBFF      /* background */
--paper-raised: #FFFFFF /* cards */
--line: #E2E8F4       /* borders */
--green: #1E9E63      /* success */
--red: #D64545        /* error */
```

**Consistency:** Applied reasonably consistently across buttons, cards, forms. Hardcoded colors appear in some edge cases (e.g., inline styles on badges).

**Typography:**
- **Display:** Space Grotesk (h1-h4, headers)
- **Body:** Inter (paragraphs, form text)
- **Mono:** JetBrains Mono (codes, session codes, timestamps)

**Type Scale:** Implicit (no formal scale document):
- h1: `clamp(2.3rem, 4vw, 3.4rem)` (landing only)
- h2: `clamp(1.7rem, 2.6vw, 2.3rem)`
- h3: (responsive, no clamp)
- p: `1rem` base
- small/code: `.78rem` to `.92rem`

**Spacing:** CSS variables for radius + shadow, but gaps/padding mostly hardcoded:
- `.card` padding: `20px` (hardcoded, should be token)
- gaps in grids: `24px`, `30px`, `60px` (mixed hardcoding and consistency)

**Verdict:** Functional design system exists but incomplete. Colors and typography consistent; spacing and sizing ad-hoc.

### Responsiveness

**Tested on mobile (simulated viewport 375px):**
- **Landing page:** Responsive (hero grid stacks, layout reflows).
- **Student join tab:** Works (input full-width, buttons stack).
- **Live quiz:** Input textarea and option buttons wrap, but option buttons remain horizontal (not stacked). **Minor issue:** narrow viewport shows 4 MCQ options in one line, wraps awkwardly.
- **Admin table:** Scrolls horizontally (overflow-x: auto), readable.
- **Teacher live control:** Quiz monitor table scrolls horizontally, readable.

**Verdict: PARTIAL** — most pages are mobile-functional, but quiz options on narrow viewport are cramped. No explicit mobile-first breakpoints; relies on flex/grid flexibility.

### Dark Mode

**Status:** NOT IMPLEMENTED. All colors hardcoded for light theme.

**Verdict: MISSING**

### Loading States

**Student quiz:** Initially shows `<p class="empty-state">No quiz posted yet. Hang tight.</p>`. No skeleton or spinner.  
**Course tables:** Rely on `onSnapshot()` to populate. While loading, table shows no rows. No skeleton loader.  
**Quiz/paper generation:** Brief button state change (`btn.disabled = true; btn.textContent = "Generating..."`). No progress indicator.  
**Verdict: PARTIAL** — minimal feedback, no skeletons, spinners present only as button text.

### Empty States

**Student dashboard:**
- No courses enrolled: `<p class="empty-state">You are not enrolled in any courses yet.</p>` ✓
- No sessions joined: `<p class="empty-state">No quiz posted yet. Hang tight.</p>` ✓
- No schedule: `<p class="empty-state">No timetable entries found...</p>` ✓

**Teacher/Admin dashboards:** Similar text-only empty states.  
**Verdict: WORKS** — empty states are text-only, not visually designed.

### Error States

**Auth errors:** Routed to field-level or global banner messages (auth.js lines 101-122).  
**Firestore errors:** Caught and logged with `console.error()`, not user-visible in most cases.  
**Quiz generation failure:** Shows error banner (`showMsg("error generating quiz", "error")`).  
**Verdict: PARTIAL** — errors shown to user in some flows, silently logged in others (e.g., activeStudents update on join).

### Accessibility

**Keyboard Navigation:** ✓ Form fields are tab-navigable. Buttons are focusable. No obvious keyboard traps.  
**Focus Indicators:** ✓ Applied via `focus-visible` outline (yellow-400, styles.css line 56-59).  
**Form Labels:** ✓ Present on all input fields (HTML `<label>` tags).  
**Alt Text:** MISSING — no images with alt attributes (logo, icons have no alt text).  
**ARIA on Live Regions:** MISSING — `onSnapshot` listeners update quiz/poll states without ARIA `aria-live` or `aria-atomic`.  
**Color Contrast:** Spot-check shows good contrast (blue-900 on white, etc.). No automated audit performed.  
**Verdict: PARTIAL** — keyboard + focus OK, labels OK, but missing alt text and ARIA on dynamic content.

### Overall Visual Impression

SessionHub presents a **clean, modern, corporate-style interface** with a cohesive color palette (navy + signature yellow). Typography is professional. Dashboards are card-based and scannable. No superfluous animations or clutter.

**Verdict:** Looks like a **shipped product** (not a prototype), but lacks polish in dark mode, mobile responsiveness, and loading state feedback. Design is functional and professional.

---

## 12. Code Quality

### TypeScript

**Not used.** Project is vanilla JavaScript. No `.ts` files, no `tsconfig.json`.

**Verdict: UNVERIFIED** (TypeScript strictness N/A)

### Linting & Formatting

**ESLint config:** Present in `functions/.eslintrc.js` (Google style guide). Frontend has no linter config.

**Codebase pass:** UNVERIFIED (no lint run performed in audit).

**Verdict: PARTIAL** — linting configured for Cloud Functions only, not frontend.

### Largest Files by Line Count

| File | Lines | Contains |
|---|---|---|
| teacher.js | 2,140 | Dashboard UI rendering, course/session/quiz/poll/QA/attendance listeners, AI quiz/paper generation, analytics |
| student.js | 1,136 | Dashboard UI rendering, join/quiz/poll/QA/analytics logic, step-by-step quiz engine |
| functions/index.js | 856 | Quiz + paper schema, prompt builders, Groq API call, normalization, Cloud Function handler |
| admin.js | 731 | Dashboard UI rendering, user/course/session/audit log management, analytics |
| auth.js | 342 | Login/signup forms, password validation, role-based redirect, route guard |

### Code Smells

**Duplicated Logic:**

1. **Analytics rendering:** `renderAnalytics()` repeated in student.js, teacher.js, admin.js (50+ lines each). Same Chart.js initialization, similar dataset patterns.
2. **Chart.js setup:** Reinitialize chart on every `renderAnalytics()` call. Destroy + recreate pattern used but not documented.
3. **Tab navigation:** Identical tab-click handlers in student/teacher/admin (lines 27-42 of each).
4. **Error handling:** `console.error()` logged but not centralized; error strings ad-hoc.
5. **Form validation:** Email/password rules defined in auth.js but duplicated logic for field-level error display.

**Business Logic in Components:**
- Quiz state (`sessionQuestions[]`, `sessionAnswers{}`, `quizMode`, `quizSubmitted`) lives directly in student.js, not abstracted.
- Attendance recording mixed with UI rendering.
- No separation of concerns between data fetching, state, and rendering.

**Verdict: POOR SEPARATION OF CONCERNS** — monolithic files with interleaved logic.

### Error Handling

**Async patterns:**
```javascript
try {
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  // ...
} catch (err) {
  routeSignupError(err);  // maps Firebase error codes to user messages
}
```

**Silent failures:**
```javascript
window.addEventListener("beforeunload", () => {
  updateDoc(...).catch(() => {});  // silent catch
});
```

**Unhandled errors:**
```javascript
err => { console.warn("Live alert listener:", err.message); }  // no user-facing error
```

**Verdict: INCONSISTENT** — some errors mapped to user, others logged silently.

### Console Statements in Production

Found in production paths (not dev-only):
- `console.error("startLiveClass error:", err)` (teacher.js)
- `console.error("Quiz generation error:", err)` (teacher.js)
- `console.warn("activeStudents update blocked...", permErr.message)` (student.js)
- `console.error("QA submit failed:", err)` (student.js)
- `console.error("loadAnalytics error:", err)` (student.js)

**Verdict: PRESENT** — console statements left in code (not removed for production).

### Dead Code / Commented Blocks

**Not found in main files.** Some commented explanations in HTML (intentional documentation).

**Verdict: CLEAN**

### TODO / FIXME / HACK Comments

```javascript
// firebase-config.js line 18:
// TODO: replace with your project's config
```

**Verdict: One legitimate TODO (credential placeholder).** No FIXMEs or HACKs found.

---

## 13. Tests

**Status: MISSING**

No test files found (no `.test.js`, `.spec.js`, no `jest.config.js`, no `mocha.opts`).

**Verdict:** Zero test coverage. Codebase untested.

---

## 14. Performance & Data Access

### N+1 Query Patterns

**Teacher dashboard:**
```javascript
listenMyCourses();  // onSnapshot(query(collection(db, "courses"), where("teacherId", "==", me.uid)))
```
Then in renderSessions():
```javascript
const [courseId, courseName, courseCode] = ...;  // from coursesTable click
// Session creation uses this courseId
```
No N+1 observed; courseId is pre-loaded.

**Admin dashboard:**
```javascript
listenUsers();     // onSnapshot(query(collection(db, "users")))
listenCourses();   // onSnapshot(query(collection(db, "courses")))
listenSessions();  // onSnapshot(query(collection(db, "sessions")))
listenQuizzes();   // onSnapshot(query(collection(db, "quizzes")))
```
Multiple independent listeners; no nested queries. **No N+1 risk**, but aggressive listener subscription.

**Verdict: CLEAN** — no N+1 patterns detected.

### Pagination

**Course table:** Loads all enrolled courses (likely <100 for a typical teacher).  
**Quiz submissions:** Loads all submissions for a quiz (unverified, likely classroom-scale <1000).  
**Sessions table:** Loads all teacher's sessions (unverified, could grow unbounded).  
**Verdict: MISSING** — no pagination or `limit()` clauses on large queries.

### Large Payloads

**Firestore rules allow full document reads:**
- `sessions` doc contains `activeStudents[]` array (large for big classes).
- `quizzes` doc contains full `options[]` and `correctIndex` (not leaked to student).
- `polls` doc contains full `options[]` with vote tallies (by design).

**Verdict: PARTIAL** — no unnecessary fields leaked, but `activeStudents` array grows linearly.

### Client Components That Should Be Server

**Not applicable** — no SSR or server components. Pure client-side app.

**Verdict: N/A**

### Unoptimized Images

No images in audit (logo, icons are inline SVG or CSS).

**Verdict: N/A**

### Fetched on Every Render

**Quiz generation:** Cloud Function called on form submit, not on every render. ✓  
**Analytics chart:** `renderAnalytics()` called on tab switch, not on every state change. ✓  
**Listeners:** `onSnapshot()` subscriptions are set up once, not on every render. ✓

**Verdict: OPTIMIZED**

---

## 15. Config & Environment

### Environment Variables Used

| Variable | Used In | Purpose | Fallback | Status |
|---|---|---|---|---|
| `GROQ_API_KEY` | functions/index.js line 54 | Groq API authentication for quiz/paper generation | `null` (API call fails if missing) | Required for AI features |
| `FIREBASE_CONFIG_*` | firebase-config.js | Firebase project credentials (apiKey, authDomain, projectId, etc.) | Hardcoded in file | Required, embedded in source |

**firebase-config.js Line 19-27:**
```javascript
const firebaseConfig = {
  apiKey: "YOUR_FIREBASE_API_KEY",  // ← EXPOSED
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT.firebasestorage.app",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "1:YOUR_SENDER_ID:web:YOUR_APP_ID",
  measurementId: "G-84RH49F7QK"
};
```

**Security Issue:** Firebase API keys are safe to expose (they're intended for client-side use). However, projectId + appId can be used to target this specific project. **Verdict: NOT A BREACH** (Firebase public keys are meant for frontend), but good practice to regenerate if repo is made public.

### .env.example

**Status: MISSING** — no `.env.example` file. Setup requires manual credential replacement in source file.

**Verdict: MISSING** — hampers onboarding.

---

## 16. The Honest List

### Broken

1. **Paper formatter cloud integration (UNVERIFIED):** `callCloudFunction("paper", {...})` wired in teacher.js, but real Groq API integration for paper format untested. llm-integration.js still contains mock fallback. Likely works (same architecture as quiz), but not verified in this audit.

2. **Quiz timer (NOT HANDLED):** No countdown timer on quiz questions. Students can take unlimited time. Teachers must manually move to next question.

3. **Session auto-close (NOT HANDLED):** If teacher closes browser tab, session remains open indefinitely. Students can still join and answer. No automatic cleanup.

### Fake

1. **Analytics aggregates (PARTIAL):** `analytics` collection is read-only (`allow write: if false`), but no Cloud Function populates it. Charts are computed client-side on demand, not precomputed server-side as intended.

2. **Rate limiting (MISSING):** No rate limits on quiz submission, poll voting, or session joining. A malicious client could spam requests.

3. **Attendance accuracy (UNVERIFIED):** `joinedAt` timestamp is client-supplied (could be spoofed). No server-side validation that clock is correct.

### Missing

1. **Tests:** Zero test coverage. No unit, integration, or e2e tests.

2. **Pagination:** No pagination on large queries (sessions, quizzes, submissions). Scales linearly with data.

3. **Dark mode:** No dark theme implementation.

4. **Quiz timer:** No countdown timer on questions.

5. **Session auto-close:** No automatic session termination when teacher leaves.

6. **Multi-language support:** UI is English-only.

7. **Audit logging:** No immutable audit trail (paperFormats collection is close but not comprehensive).

8. **Export functionality:** No bulk export of quiz results, attendance, analytics to CSV or PDF (except ad-hoc paper download).

9. **Backup/restore:** No data export/import for disaster recovery.

10. **Rate limiting:** No protection against abuse (spam submissions, voting, joining).

---

## 17. Known Issues

**From README Section 5 ("What's intentionally out of scope"):**
- Poll vote-counting should move from client-side transaction to Cloud Function (strength against tampering).
- Real LLM API calls should be in Cloud Functions, not browser (addressed via `generateAIContent` endpoint, but integration not fully tested).
- Rate limiting / abuse protection needed on session-code generation and joining.
- Firestore security rules need automated testing (Firebase Rules Unit Testing library mentioned).

**From code audit:**
- Firebase credentials hardcoded in `firebase-config.js`. Safe for public keys but bad practice.
- No `.env.example` template for setup guidance.
- Console errors present in production paths (should be dev-only).
- Monolithic dashboard files (2,000+ lines) difficult to maintain and test.
- No error recovery for network failures (e.g., quiz submission fails, no retry).

**From feature testing:**
- Quiz questions have no timeout. Students can take 1 hour on a 1-minute question without consequence.
- Disconnect/reconnect creates duplicate attendance records (join, drop, rejoin = 2 records, not one resume).
- Paper formatter prompt is highly detailed but no human-in-the-loop review before deployment to students.

---

## Summary

**Line Count:** 1,247 lines  
**Most Serious Problems:**
1. **No rate limiting** — spammable quiz/poll endpoints.
2. **No tests** — untested, risky refactors possible.
3. **Timer not implemented** — quiz questions have no time limit.

**Unverified Items:**
- Paper formatter cloud integration (likely works, not tested live).
- Cloud Functions deployment status (functions scripts present, not verified to run).
- Firestore security rules audit (manual rules review OK, no automated test suite).
