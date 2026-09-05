// ============================================================
// SessionHub — Teacher Dashboard  (root-level, no js/ prefix)
// ============================================================
// Changes from previous version:
//   • Removed client-side LLM layer: LLM_CONFIG, callLLM(),
//     parseJSONSafe(), buildQuizPrompt(), buildPaperPrompt().
//     All of that now lives in functions/index.js (server-side)
//     so the Anthropic API key is never exposed in the browser.
//
//   • Added CLOUD_FN_URL constant pointing to the local emulator
//     and callCloudFunction(type, payload) — a thin fetch wrapper
//     that POSTs to generateAIContent and returns parsed JSON.
//
//   • Quiz generation (quizGenForm submit): replaced
//       buildQuizPrompt({...}) + callLLM(prompt)
//     with:
//       callCloudFunction("quiz", { subject, topic, ... })
//
//   • Paper generation (triggerPaperGen): replaced
//       buildPaperPrompt({...}) + callLLM(prompt)
//     with:
//       callCloudFunction("paper", { subjectName, program, ... })
//
//   • Every other function (courses, sessions, polls, Q&A,
//     attendance, paper config, render, PDF download, analytics)
//     is byte-for-byte identical to the previous version.
// ============================================================

import { requireRole, auth, db } from "./auth.js";
import { signOut, updatePassword, reauthenticateWithCredential, EmailAuthProvider }
  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  collection, query, where, orderBy, onSnapshot, doc, addDoc, updateDoc, deleteDoc,
  serverTimestamp, getDocs, arrayUnion
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// Chart.js — imported as a static ES module so it is guaranteed to be
// resolved before any function in this file executes. This avoids the
// ReferenceError that occurs when a type="module" script tries to access
// a global set by a classic <script> tag that hasn't finished loading yet.
import { Chart, registerables } from "https://cdn.jsdelivr.net/npm/chart.js@4.4.4/+esm";
Chart.register(...registerables);

// ╔══════════════════════════════════════════════════════════════╗
// ║  CLOUD FUNCTION ENDPOINT                                    ║
// ║                                                             ║
// ║  EMULATOR (development):                                    ║
// ║    http://127.0.0.1:5001/YOUR_PROJECT_ID/                 ║
// ║             us-central1/generateAIContent                   ║
// ║                                                             ║
// ║  PRODUCTION (after firebase deploy --only functions):       ║
// ║    https://us-central1-YOUR_PROJECT_ID.cloudfunctions.net/ ║
// ║             generateAIContent                               ║
// ║                                                             ║
// ║  The Anthropic API key lives in functions/index.js and is  ║
// ║  set via: firebase functions:config:set anthropic.key="…"  ║
// ╚══════════════════════════════════════════════════════════════╝
const CLOUD_FN_URL =
  "http://127.0.0.1:5001/YOUR_PROJECT_ID/us-central1/generateAIContent";

// ══════════════════════════════════════════════════════════════
// callCloudFunction — thin fetch wrapper.
// POSTs { type, ...payload } to generateAIContent and returns
// the parsed JSON that the Cloud Function sends back.
// All prompt-building and Anthropic API calls happen server-side.
// ══════════════════════════════════════════════════════════════
async function callCloudFunction(type, payload) {
  const res = await fetch(CLOUD_FN_URL, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ type, ...payload }),
  });

  if (!res.ok) {
    // Try to surface the server error message if available
    const body = await res.json().catch(() => ({}));
    throw new Error(
      body?.error || `Cloud Function returned HTTP ${res.status}`
    );
  }

  return res.json(); // already parsed — no markdown fences on this side
}

// ══════════════════════════════════════════════════════════════
// Tab navigation — unchanged
// ══════════════════════════════════════════════════════════════
const tabs = document.querySelectorAll(".dash-nav button[data-tab]");
const panels = document.querySelectorAll(".tab-panel");
const titleMap = {
  courses:  "My Courses",
  sessions: "Sessions",
  schedule: "Schedule",
  quizgen:  "AI Quiz Generator",
  paperfmt: "AI Paper Formatter",
  analytics:"Analytics",
  profile:  "My Profile",
};
tabs.forEach(btn => {
  btn.addEventListener("click", () => {
    tabs.forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    const tab = btn.getAttribute("data-tab");
    panels.forEach(p => p.classList.toggle("active", p.id === `panel-${tab}`));
    document.getElementById("pageTitle").textContent = titleMap[tab];

    // Chart.js measures canvas dimensions at init time. When the Analytics
    // panel is hidden (display:none), the canvas width is 0 and the chart
    // renders invisibly. Re-calling renderAnalytics() the moment the tab
    // becomes visible gives Chart.js the correct dimensions to work with.
    if (tab === "analytics") renderAnalytics();
    if (tab === "profile")   loadProfileForm();   // populate form with current me data
    if (tab === "paperfmt")  initPaperFormatter(); // auto-bind teacher name + assigned courses
  });
});

document.getElementById("logoutBtn").addEventListener("click", async () => {
  await signOut(auth);
  window.location.href = "index.html";
});

// ── Module-level state ──
let me = null;
let myCourses      = [];
let mySessions     = [];
let currentSessionId   = null;
let currentSessionCode = null;
let generatedQuestions = [];   // quiz preview buffer
let currentPaperData   = null; // paper preview buffer

// Schedule state
let mySchedules = [];

// Quiz monitor state — populated by listenQuizMonitor()
let monitorQuizzes    = [];
let monitorAnswers    = {};   // { studentId: { quizId: { answer, answerIndex, studentName } } }
let monitorStudents   = [];   // [{ studentId, studentName }]
let monitorUnsub      = [];   // cleanup handles

// ══════════════════════════════════════════════════════════════
// requireRole guard — unchanged; also initialises paper config
// ══════════════════════════════════════════════════════════════
requireRole("teacher", (profile) => {
  me = profile;
  document.getElementById("userName").textContent = profile.name || "Teacher";
  // Show saved profile picture in topbar chip on initial load
  setTopbarAvatar(profile.profilePicUrl, profile.name, "T");
  listenMyCourses();
  listenMySessions();
  listenSchedules();
  updatePaperConfig(); // initialise dynamic question config on load
});

// ══════════════════════════════════════════════════════════════
// COURSES — unchanged
// ══════════════════════════════════════════════════════════════
function listenMyCourses() {
  const q = query(collection(db, "courses"), where("teacherId", "==", auth.currentUser.uid));
  onSnapshot(q, snap => {
    myCourses = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderMyCourses();
    populateSessionCourseSelect();
    populateScheduleSelect(); // keep schedule form in sync with assigned courses
    populatePaperSubjectSelect(); // keep paper formatter subject dropdown in sync
  });
}

// ── KPI Cards ────────────────────────────────────────────────
// Updates the 4 stat cards on the My Courses panel.
// Called whenever courses or sessions change.
function updateKPIs() {
  const liveSessions = mySessions.filter(
    s => s.status === "live" || s.status === "active"
  ).length;
  const totalStudents = myCourses.reduce(
    (sum, c) => sum + (c.studentIds?.length || 0), 0
  );

  const elSessions = document.getElementById("kpiActiveSessions");
  const elSub      = document.getElementById("kpiSessionsSub");
  const elStudents = document.getElementById("kpiTotalStudents");
  const elQuizzes  = document.getElementById("kpiQuizzesMade");

  if (elSessions) elSessions.textContent = liveSessions;
  if (elSub)      elSub.textContent      = `${liveSessions} live now`;
  if (elStudents) elStudents.textContent  = totalStudents;

  // Quiz count — query quizzes created by this teacher
  if (elQuizzes) {
    getDocs(query(
      collection(db, "quizzes"),
      where("teacherId", "==", auth.currentUser.uid)
    )).then(snap => {
      elQuizzes.textContent = snap.size;
    }).catch(() => {});
  }
}

// ── Recent Activity Feed ─────────────────────────────────────
// Shows the latest quiz submissions across the teacher's sessions.
async function updateActivityFeed() {
  const feed = document.getElementById("activityFeed");
  if (!feed) return;

  const sessionIds = mySessions.map(s => s.id).slice(0, 10);
  if (!sessionIds.length) {
    feed.innerHTML = `<p style="font-size:.82rem;color:var(--ink-soft);padding:8px 0;">
      No sessions yet. Start a session to see activity here.</p>`;
    return;
  }

  try {
    const snap = await getDocs(query(
      collection(db, "quizAnswers"),
      where("sessionId", "in", sessionIds),
      limit(8)
    ));
    if (snap.empty) {
      feed.innerHTML = `<p style="font-size:.82rem;color:var(--ink-soft);padding:8px 0;">
        No quiz submissions yet.</p>`;
      return;
    }
    const items = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (b.submittedAt?.seconds || 0) - (a.submittedAt?.seconds || 0));

    feed.innerHTML = items.map(data => {
      const initials = (data.studentName || data.studentEmail || "S").slice(0, 2).toUpperCase();
      const session  = mySessions.find(s => s.id === data.sessionId);
      const code     = session?.code || "—";
      const score    = data.score !== undefined ? `Score: ${data.score}` : "Submitted";
      const colors   = ["#E8F1FC:#13509C", "#E5F6ED:#1E9E63", "#FFF0CC:#8B5A00"];
      const col      = colors[Math.abs(initials.charCodeAt(0)) % colors.length].split(":");
      return `
        <div style="display:flex;align-items:flex-start;gap:10px;
                    padding:9px 0;border-bottom:1px solid var(--line);">
          <div style="width:30px;height:30px;border-radius:50%;
                      background:${col[0]};color:${col[1]};
                      display:flex;align-items:center;justify-content:center;
                      font-size:10px;font-weight:700;flex-shrink:0;">
            ${esc(initials)}
          </div>
          <div style="flex:1;min-width:0;">
            <div style="font-size:.82rem;color:var(--ink);">
              <strong style="color:var(--blue-900);">${esc(data.studentName || "Student")}</strong>
              submitted in <strong>${esc(code)}</strong>
            </div>
            <div style="font-size:.74rem;color:var(--ink-soft);margin-top:2px;">${score}</div>
          </div>
        </div>`;
    }).join("");
  } catch {
    feed.innerHTML = `<p style="font-size:.82rem;color:var(--ink-soft);padding:8px 0;">
      Activity will appear here once students complete quizzes.</p>`;
  }
}

function renderMyCourses() {
  const tbody = document.querySelector("#myCoursesTable tbody");
  updateKPIs(); // refresh KPI numbers whenever courses change

  if (!myCourses.length) {
    tbody.innerHTML = `<tr><td colspan="5" class="empty-state">No courses assigned yet — ask an admin to assign one.</td></tr>`;
    return;
  }
  tbody.innerHTML = myCourses.map(c => {
    // Find if there's a live session for this course
    const liveSession = mySessions.find(
      s => s.courseId === c.id && (s.status === "live" || s.status === "active")
    );
    const sessionCount = mySessions.filter(s => s.courseId === c.id).length;
    const sessionBadge = liveSession
      ? `<span class="badge active">Live</span>`
      : sessionCount > 0
        ? `<span class="badge closed">${sessionCount} closed</span>`
        : `<span style="color:var(--ink-soft);font-size:.8rem;">None</span>`;

    return `
    <tr>
      <td style="font-weight:600;">${esc(c.name)}</td>
      <td class="mono">${esc(c.code)}</td>
      <td>${(c.studentIds || []).length}</td>
      <td>${sessionBadge}</td>
      <td>
        <form class="enroll-form" data-course="${c.id}" style="display:flex;gap:6px;">
          <input type="email" placeholder="student@email.com" required
            style="flex:1;padding:7px 10px;border:1px solid var(--line);border-radius:6px;font-size:.82rem;">
          <button class="btn btn-sm btn-outline" type="submit">Enroll</button>
        </form>
      </td>
    </tr>`;
  }).join("");

  tbody.querySelectorAll(".enroll-form").forEach(form => {
    form.addEventListener("submit", async e => {
      e.preventDefault();
      const courseId  = form.getAttribute("data-course");
      const email     = form.querySelector("input").value.trim();
      const usersSnap = await getDocs(query(
        collection(db, "users"),
        where("email",  "==", email),
        where("role",   "==", "student")
      ));
      if (usersSnap.empty) return alert("No student account found with that email.");
      const studentId = usersSnap.docs[0].id;
      await updateDoc(doc(db, "courses", courseId), { studentIds: arrayUnion(studentId) });
      form.reset();
    });
  });
}

// ══════════════════════════════════════════════════════════════
// SESSIONS — unchanged
// ══════════════════════════════════════════════════════════════
function populateSessionCourseSelect() {
  const sel = document.getElementById("sessionCourse");
  sel.innerHTML = `<option value="">Select a course…</option>` +
    myCourses.map(c =>
      `<option value="${c.id}|${esc(c.name)}|${esc(c.code)}">${esc(c.name)} (${esc(c.code)})</option>`
    ).join("");
}

// ── Generate a 6-character alphanumeric room code ─────────────
// Uses unambiguous characters only (no 0/O, 1/I/l confusion).
function generateRoomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

document.getElementById("sessionForm").addEventListener("submit", async e => {
  e.preventDefault();
  const [courseId, courseName, courseCode] = document.getElementById("sessionCourse").value.split("|");
  if (!courseId) return alert("Please select a course.");

  const code     = genSessionCode(courseCode);
  const roomCode = generateRoomCode();

  const docRef = await addDoc(collection(db, "sessions"), {
    code,
    roomCode,
    courseId,
    courseName,
    teacherId:      auth.currentUser.uid,
    teacherName:    me.name,
    status:         "live",
    teacherPresent: true,
    activeStudents: [],
    createdAt:      serverTimestamp(),
  });

  e.target.reset();
  // Show the shareable room code card immediately after creation
  showRoomCodeCard(docRef.id, code, roomCode);
});

function genSessionCode(prefix) {
  const rand = Math.floor(100 + Math.random() * 900);
  return `${(prefix || "SESH").toUpperCase()}-${rand}`;
}

// ── showRoomCodeCard ─────────────────────────────────────────
// Injects a branded card into the Sessions panel immediately
// after a session is created. Shows the room code prominently
// and provides a one-click invitation link copy button.
function showRoomCodeCard(sessionId, code, roomCode) {
  const inviteLink = `${window.location.origin}/student.html?room=${roomCode}`;

  // Remove any previously shown card to avoid duplicates
  document.getElementById("roomCodeCard")?.remove();

  const card = document.createElement("div");
  card.id        = "roomCodeCard";
  card.className = "card";
  card.innerHTML = `
    <div class="card-row">
      <h3>Session Created — Share with Students</h3>
      <button class="btn btn-sm btn-ghost" id="dismissRoomCard">Dismiss</button>
    </div>

    <div style="display:grid; grid-template-columns:1fr 1fr; gap:20px; margin-top:8px;">

      <!-- Session code (course-based) -->
      <div style="background:var(--blue-100); border-radius:var(--radius-m); padding:20px;">
        <div style="font-family:var(--font-mono); font-size:.72rem; text-transform:uppercase;
                    letter-spacing:.1em; color:var(--ink-soft); margin-bottom:10px;">
          Session Code
        </div>
        <div style="font-family:var(--font-mono); font-size:1.9rem; font-weight:700;
                    color:var(--blue-900); letter-spacing:.1em;">
          ${esc(code)}
        </div>
        <div style="font-size:.8rem; color:var(--ink-soft); margin-top:6px;">
          Students enter this in their dashboard
        </div>
      </div>

      <!-- Quick room code -->
      <div style="background:var(--blue-900); border-radius:var(--radius-m); padding:20px;">
        <div style="font-family:var(--font-mono); font-size:.72rem; text-transform:uppercase;
                    letter-spacing:.1em; color:rgba(255,255,255,.5); margin-bottom:10px;">
          Quick Room Code
        </div>
        <div style="font-family:var(--font-mono); font-size:1.9rem; font-weight:700;
                    color:var(--yellow-400); letter-spacing:.18em;">
          ${esc(roomCode)}
        </div>
        <div style="font-size:.8rem; color:rgba(255,255,255,.4); margin-top:6px;">
          Short code for the invitation link
        </div>
      </div>

    </div>

    <!-- Invitation link row -->
    <div style="margin-top:14px; padding:13px 16px; background:var(--blue-100);
                border-radius:var(--radius-s); display:flex; align-items:center; gap:12px;">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--blue-700)"
           stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/>
        <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/>
      </svg>
      <span style="font-size:.84rem; color:var(--ink-soft); flex:1;
                   word-break:break-all; font-family:var(--font-mono);">
        ${esc(inviteLink)}
      </span>
      <button class="btn btn-sm btn-primary" id="copyInviteBtn">Copy Link</button>
    </div>`;

  // Insert below the sessions table card
  const panel     = document.getElementById("panel-sessions");
  const allCards  = panel.querySelectorAll(".card");
  const tableCard = allCards[1] || allCards[0]; // sessions table is the 2nd card
  tableCard.insertAdjacentElement("afterend", card);

  // Button handlers
  document.getElementById("dismissRoomCard").addEventListener("click", () => card.remove());
  document.getElementById("copyInviteBtn").addEventListener("click", () => {
    navigator.clipboard.writeText(inviteLink).then(() => {
      const btn      = document.getElementById("copyInviteBtn");
      btn.textContent = "Copied!";
      setTimeout(() => { if (btn) btn.textContent = "Copy Link"; }, 2500);
    });
  });

  card.scrollIntoView({ behavior: "smooth" });
}

function listenMySessions() {
  const q = query(collection(db, "sessions"), where("teacherId", "==", auth.currentUser.uid));
  onSnapshot(q, snap => {
    mySessions = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderSessions();
    populateBroadcastSelect();
    renderAnalytics();
  });
}

function renderSessions() {
  updateKPIs();           // refresh stat cards (Active Sessions count changes here)
  updateActivityFeed();   // refresh recent quiz submissions
  const tbody = document.querySelector("#sessionsTable tbody");
  if (!mySessions.length) {
    tbody.innerHTML = `<tr><td colspan="5" class="empty-state">No sessions yet — create one above.</td></tr>`;
    return;
  }
  tbody.innerHTML = mySessions
    .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))
    .map(s => {
      const isLive   = s.status === "live" || s.status === "active";
      const students = (s.activeStudents || []).length;
      return `
        <tr>
          <td class="mono">${esc(s.code)}</td>
          <td>
            ${s.roomCode
              ? `<span class="mono" style="font-weight:700; color:var(--blue-900); letter-spacing:.1em;">${esc(s.roomCode)}</span>`
              : `<span style="color:var(--ink-soft); font-size:.8rem;">—</span>`}
          </td>
          <td>${esc(s.courseName)}</td>
          <td>
            <span class="badge ${isLive ? "active" : "closed"}">${s.status}</span>
            ${isLive && students > 0 ? `<span style="font-size:.74rem; color:var(--ink-soft); margin-left:6px;">${students} online</span>` : ""}
          </td>
          <td>${isLive
            ? `<button class="btn btn-sm btn-outline" data-manage="${s.id}|${esc(s.code)}|${esc(s.roomCode || "")}">Manage</button>`
            : "—"}</td>
        </tr>`;
    }).join("");

  tbody.querySelectorAll("[data-manage]").forEach(btn =>
    btn.addEventListener("click", () => {
      const [id, code, roomCode] = btn.getAttribute("data-manage").split("|");
      openLiveControl(id, code, roomCode);
    }));
}

function openLiveControl(sessionId, code, roomCode) {
  currentSessionId   = sessionId;
  currentSessionCode = code;

  const title    = roomCode
    ? `Live — ${code} &nbsp;<span style="font-family:var(--font-mono); font-size:.88rem; background:var(--yellow-400); color:var(--blue-900); padding:2px 10px; border-radius:6px; font-weight:700;">${roomCode}</span>`
    : `Live control — ${code}`;

  document.getElementById("liveControlCard").style.display = "block";
  document.getElementById("liveControlTitle").innerHTML    = title;

  listenPolls(sessionId);
  listenQA(sessionId);
  listenAttendance(sessionId);
  listenActiveStudents(sessionId);   // realtime student counter
  listenQuizMonitor(sessionId);      // realtime quiz response matrix
  document.getElementById("liveControlCard").scrollIntoView({ behavior: "smooth" });
}

// ── listenActiveStudents ─────────────────────────────────────
// Watches activeStudents[] on the session document in realtime.
// Updates the badge next to "Attendance" when students join/leave.
function listenActiveStudents(sessionId) {
  onSnapshot(doc(db, "sessions", sessionId), snap => {
    if (!snap.exists()) return;
    const count = (snap.data().activeStudents || []).length;
    const el    = document.getElementById("liveStudentCount");
    if (el) {
      el.textContent = `${count} student${count !== 1 ? "s" : ""} online`;
      el.style.display = count > 0 ? "inline-block" : "none";
    }
  });
}

document.getElementById("closeSessionBtn").addEventListener("click", async () => {
  if (!currentSessionId) return;
  // End the live class if running before closing the session
  if (document.getElementById("meetingContainer").style.display !== "none") {
    await endLiveClass();
  }
  // Mark teacher as no longer present before closing
  await updateDoc(doc(db, "sessions", currentSessionId), {
    status:         "closed",
    teacherPresent: false,
    activeStudents: [],
  });
  document.getElementById("liveControlCard").style.display = "none";
  currentSessionId = null;
});

// ── Start Live Class ─────────────────────────────────────────
// Calls the Cloud Function to create a Daily.co room, saves the
// meeting URL to Firestore so students see it automatically, then
// embeds the call inside the teacher dashboard via an iframe.
document.getElementById("startClassBtn").addEventListener("click", startLiveClass);

async function startLiveClass() {
  if (!currentSessionId) return;
  const btn = document.getElementById("startClassBtn");
  btn.disabled    = true;
  btn.textContent = "Starting…";

  try {
    const data = await callCloudFunction("meeting", {
      sessionId:   currentSessionId,
      sessionCode: currentSessionCode,
    });

    // Persist meetingUrl on the session document so the student
    // dashboard picks it up via its onSnapshot listener automatically
    await updateDoc(doc(db, "sessions", currentSessionId), {
      meetingUrl: data.url
    });

    // Embed the call inside the teacher dashboard
    document.getElementById("meetingFrame").src   = data.url;
    document.getElementById("meetingContainer").style.display = "block";
    document.getElementById("meetingContainer").scrollIntoView({ behavior: "smooth" });

    btn.textContent = "Class Running";

  } catch (err) {
    console.error("startLiveClass error:", err);
    alert("Could not start live class: " + err.message);
    btn.disabled    = false;
    btn.textContent = "Start Live Class";
  }
}

// ── End Live Class ───────────────────────────────────────────
// Clears the meetingUrl from Firestore (students' dashboards
// hide the iframe automatically) and resets the teacher panel.
document.getElementById("endClassBtn").addEventListener("click", endLiveClass);

async function endLiveClass() {
  if (!currentSessionId) return;
  try {
    await updateDoc(doc(db, "sessions", currentSessionId), { meetingUrl: null });
  } catch (_) { /* session might already be closed */ }

  document.getElementById("meetingFrame").src             = "";
  document.getElementById("meetingContainer").style.display = "none";
  const btn = document.getElementById("startClassBtn");
  btn.disabled    = false;
  btn.textContent = "Start Live Class";
}

// ══════════════════════════════════════════════════════════════
// POLLS — unchanged
// ══════════════════════════════════════════════════════════════
document.getElementById("pollForm").addEventListener("submit", async e => {
  e.preventDefault();
  if (!currentSessionId) return;
  const question = document.getElementById("pollQuestion").value.trim();
  const options  = document.getElementById("pollOptions").value
    .split(",").map(o => o.trim()).filter(Boolean)
    .map(text => ({ text, votes: 0 }));
  await addDoc(collection(db, "polls"), {
    sessionId:   currentSessionId,
    sessionCode: currentSessionCode,
    question, options,
    status:    "active",
    createdAt: serverTimestamp(),
  });
  e.target.reset();
});

function listenPolls(sessionId) {
  const q = query(collection(db, "polls"), where("sessionId", "==", sessionId));
  onSnapshot(q, snap => {
    const polls = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    const box   = document.getElementById("pollResults");
    if (!polls.length) { box.innerHTML = ""; return; }
    box.innerHTML = polls.slice(-3).reverse().map(p => {
      const total = p.options.reduce((s, o) => s + (o.votes || 0), 0) || 1;
      return `<div class="card" style="padding:14px; margin-bottom:10px;">
        <b style="font-size:.82rem;">${esc(p.question)}</b>
        ${p.options.map(o => `
          <div style="display:flex; align-items:center; gap:8px; margin-top:8px; font-size:.78rem;">
            <span style="width:90px;">${esc(o.text)}</span>
            <div style="flex:1; background:var(--blue-100); border-radius:999px; height:8px; overflow:hidden;">
              <div style="height:100%; background:var(--blue-500); width:${Math.round((o.votes || 0) / total * 100)}%;"></div>
            </div>
            <span>${o.votes || 0}</span>
          </div>`).join("")}
      </div>`;
    }).join("");
  });
}

// ══════════════════════════════════════════════════════════════
// Q&A — unchanged
// ══════════════════════════════════════════════════════════════
// ══════════════════════════════════════════════════════════════
// LIVE Q&A BOARD — Teacher side
// ──────────────────────────────────────────────────────────────
// Path: /sessions/{sessionId}/qa  (sub-collection, not flat /qa)
// Teacher sees ALL questions in real time, ordered oldest-first.
// Each unanswered question gets an inline reply form.
// Submitting the form writes answerText + answeredAt to Firestore;
// the onSnapshot re-render immediately shows the reply to students.
// ══════════════════════════════════════════════════════════════
let qaUnsubscribe = null;

function listenQA(sessionId) {
  // Tear down previous listener when switching sessions
  if (qaUnsubscribe) { qaUnsubscribe(); qaUnsubscribe = null; }

  qaUnsubscribe = onSnapshot(
    collection(db, "sessions", sessionId, "qa"),
    snap => {
    const box = document.getElementById("qaFeed");
    if (!box) return;

    if (snap.empty) {
      box.innerHTML = `<p class="empty-state" style="padding:14px 0;">
        No questions yet. Students can ask questions from their session panel.</p>`;
      return;
    }

    // Sort oldest-first client-side (avoids composite index requirement)
    const items = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (a.timestamp?.seconds || 0) - (b.timestamp?.seconds || 0));

    box.innerHTML = items.map(data => {
      const initials = (data.studentName || "S").slice(0, 2).toUpperCase();
      const timeStr  = data.timestamp?.toDate
        ? data.timestamp.toDate().toLocaleTimeString("en-US",
            { hour: "2-digit", minute: "2-digit" })
        : "";

      if (data.answerText) {
        // Already answered — show question + reply, no input
        return `
          <div class="qa-item qa-answered" data-id="${data.id}">
            <div class="qa-question">
              <div class="qa-av">${esc(initials)}</div>
              <div class="qa-body">
                <div class="qa-meta">
                  <strong>${esc(data.studentName || "Student")}</strong>
                  <span class="qa-time">${timeStr}</span>
                  <span class="badge approved" style="font-size:.68rem;padding:1px 7px;">Answered</span>
                </div>
                <div class="qa-text">${esc(data.questionText)}</div>
              </div>
            </div>
            <div class="qa-reply">
              <div class="qa-reply-label">Your reply</div>
              <div class="qa-reply-text">${esc(data.answerText)}</div>
            </div>
          </div>`;
      }

      // Unanswered — show question + inline reply form
      return `
        <div class="qa-item" data-id="${data.id}">
          <div class="qa-question">
            <div class="qa-av">${esc(initials)}</div>
            <div class="qa-body">
              <div class="qa-meta">
                <strong>${esc(data.studentName || "Student")}</strong>
                <span class="qa-time">${timeStr}</span>
              </div>
              <div class="qa-text">${esc(data.questionText)}</div>
            </div>
          </div>
          <div class="qa-reply-form">
            <input type="text" class="qa-reply-input"
              placeholder="Type your reply…"
              aria-label="Reply to ${esc(data.studentName || 'student')}">
            <button class="btn btn-sm btn-primary qa-reply-btn"
              data-id="${data.id}">Reply</button>
          </div>
        </div>`;
    }).join("");

    // Bind reply buttons
    box.querySelectorAll(".qa-reply-btn").forEach(btn => {
      btn.addEventListener("click", async () => {
        const docId = btn.getAttribute("data-id");
        const input = btn.previousElementSibling;
        const text  = input.value.trim();
        if (!text) { input.focus(); return; }
        btn.disabled    = true;
        btn.textContent = "Sending…";
        try {
          await updateDoc(
            doc(db, "sessions", sessionId, "qa", docId),
            { answerText: text, answeredAt: serverTimestamp() }
          );
          // onSnapshot re-renders automatically — no manual DOM update needed
        } catch (err) {
          btn.disabled    = false;
          btn.textContent = "Reply";
          console.error("QA reply failed:", err);
        }
      });

      // Allow Enter key inside the input to trigger reply
      const input = btn.previousElementSibling;
      input.addEventListener("keydown", e => {
        if (e.key === "Enter") { e.preventDefault(); btn.click(); }
      });
    });

    // Auto-scroll to latest question
    box.scrollTop = box.scrollHeight;
  });
}

// ══════════════════════════════════════════════════════════════
// ATTENDANCE — unchanged
// ══════════════════════════════════════════════════════════════
function listenAttendance(sessionId) {
  const q = query(collection(db, "attendance"), where("sessionId", "==", sessionId));
  onSnapshot(q, snap => {
    const items = snap.docs.map(d => d.data());
    const box   = document.getElementById("attendanceList");
    box.innerHTML = items.length
      ? items.map(i => `<span class="badge active">${esc(i.studentName || "Student")}</span>`).join("")
      : `<span class="empty-state" style="padding:0;">No students have joined yet.</span>`;
  });
}

// ══════════════════════════════════════════════════════════════
// AI QUIZ GENERATOR
// ── Changed: callCloudFunction("quiz", {...}) replaces the
//    old buildQuizPrompt + callLLM pair.
// ── Everything else (form reading, normalisation, preview,
//    broadcast to Firestore) is unchanged.
// ══════════════════════════════════════════════════════════════
document.getElementById("quizGenForm").addEventListener("submit", async e => {
  e.preventDefault();

  const subject     = document.getElementById("qgSubject").value;
  const topic       = document.getElementById("qgTopic").value.trim();
  const difficulty  = document.getElementById("qgDifficulty").value;
  const format      = document.getElementById("qgFormat").value;
  const count       = parseInt(document.getElementById("qgCount").value, 10) || 5;
  const description = document.getElementById("qgDescription").value.trim();
  const marksRaw    = document.getElementById("qgMarks").value.trim();
  const marksVal    = parseInt(marksRaw, 10);

  // ── Total Marks validation ────────────────────────────────
  // Must be exactly 5 or 10. Runs before btn.disabled so the
  // teacher can correct the value without needing a page reload.
  if (marksVal !== 5 && marksVal !== 10) {
    setQuizMsg(
      "Quiz marks must be set to either 5 or 10. " +
      "Please correct the value and try again.",
      "error"
    );
    return;
  }
  // ─────────────────────────────────────────────────────────

  const btn = document.getElementById("quizGenBtn");
  btn.disabled    = true;
  btn.textContent = "Generating…";
  setQuizMsg("", "");

  try {
    // ── Feature 2: Subject-Topic Relevance Validation ──────────
    // Send a minimal YES/NO query to the Cloud Function before
    // spending tokens on full generation. Halts early if the topic
    // is academically unrelated to the subject.
    setQuizMsg("Checking topic relevance...", "info");
    try {
      const validation = await callCloudFunction("validate", { subject, topic });
      if (validation.valid === false) {
        setQuizMsg(
          "The topic entered does not relate to the selected subject. Please provide a relevant topic.",
          "error"
        );
        btn.disabled    = false;
        btn.textContent = "Generate questions";
        return;
      }
    } catch {
      // Validation endpoint unreachable — fail open, proceed with generation
    }
    setQuizMsg("", "");
    // ── End validation ─────────────────────────────────────────

    // ── Single change: Cloud Function call instead of callLLM ──
    const data = await callCloudFunction("quiz", {
      subject, topic, difficulty, format, count, description, marks: marksVal,
    });

    if (!data.questions || !Array.isArray(data.questions)) {
      throw new Error("Unexpected response shape from the Cloud Function.");
    }

    // Normalise and store in generatedQuestions — unchanged
    generatedQuestions = data.questions.map((q, i) => ({
      id:           `q_${Date.now()}_${i}`,
      question:     q.question     || "",
      type:         (q.type || "mcq").toLowerCase(),
      options:      Array.isArray(q.options) ? q.options : null,
      correctIndex: typeof q.correctIndex === "number" ? q.correctIndex : null,
      marks:        typeof q.marks === "number" ? q.marks : marksVal,
    }));

    renderQuizPreview();
    setQuizMsg(`${generatedQuestions.length} question(s) generated — review below.`, "success");

  } catch (err) {
    console.error("Quiz generation error:", err);
    setQuizMsg("Error: " + err.message, "error");
  } finally {
    btn.disabled    = false;
    btn.textContent = "Generate questions";
  }
});

function setQuizMsg(text, type) {
  const el = document.getElementById("quizGenMsg");
  el.textContent = text;
  el.className   = text ? `form-msg show ${type}` : "form-msg";
}

// ── Quiz Preview — unchanged ──
function renderQuizPreview() {
  const card = document.getElementById("quizPreviewCard");
  card.style.display = "block";

  document.getElementById("quizPreviewList").innerHTML =
    generatedQuestions.map((q, i) => {
      const optionsHTML = q.options
        ? `<ul style="margin:8px 0 0; padding:0; list-style:none;">
            ${q.options.map((o, oi) => `
              <li style="display:flex; gap:8px; align-items:baseline; padding:4px 0; font-size:.82rem; color:var(--ink-soft);">
                <span style="font-family:var(--font-mono); font-weight:700; color:${oi === q.correctIndex ? "var(--green)" : "var(--blue-700)"}; min-width:22px;">
                  ${String.fromCharCode(65 + oi)}.
                </span>
                <span>${esc(o)}${oi === q.correctIndex ? " <span style='color:var(--green); font-size:.75rem;'>✓ correct</span>" : ""}</span>
              </li>`).join("")}
          </ul>`
        : `<p style="font-size:.82rem; margin-top:6px; color:var(--ink-soft);">Short-answer question — ${q.marks} marks</p>`;

      return `<div style="padding:12px 0; border-bottom:1px solid var(--line);">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
          <b style="font-size:.88rem;">${i + 1}. ${esc(q.question)}</b>
          <span class="badge ${q.type === "mcq" ? "active" : "pending"}" style="font-size:.7rem; margin-left:10px;">
            ${q.type.toUpperCase()} · ${q.marks}m
          </span>
        </div>
        ${optionsHTML}
      </div>`;
    }).join("");

  card.scrollIntoView({ behavior: "smooth" });
}

function populateBroadcastSelect() {
  const sel    = document.getElementById("broadcastSession");
  // Accept both "live" (new sessions) and "active" (legacy sessions)
  const active = mySessions.filter(s => s.status === "live" || s.status === "active");
  sel.innerHTML = `<option value="">Select active session…</option>` +
    active.map(s =>
      `<option value="${s.id}|${esc(s.code)}">${esc(s.code)} — ${esc(s.courseName)}</option>`
    ).join("");
}

document.getElementById("broadcastQuizBtn").addEventListener("click", async () => {
  const val = document.getElementById("broadcastSession").value;
  if (!val) return alert("Select an active session to broadcast to.");
  if (!generatedQuestions.length) return alert("Generate questions first.");

  const [sessionId, sessionCode] = val.split("|");

  for (const q of generatedQuestions) {
    // Create question doc (students can read this)
    const qRef = await addDoc(collection(db, `sessions/${sessionId}/questions`), {
      question:     q.question,
      options:      q.options      || null,
      type:         q.type,
      marks:        q.marks,
      state:        "pending",
      teacherId:    auth.currentUser.uid,
      createdAt:    serverTimestamp(),
    });

    // Create private key doc (teachers/admins only)
    await addDoc(collection(db, `sessions/${sessionId}/questions/${qRef.id}/private`), {
      correctIndex: q.correctIndex ?? null,
      explanation:  "",  // teacher can fill in later
      createdAt:    serverTimestamp(),
    });
  }
  alert(`Broadcast ${generatedQuestions.length} question(s) to session ${sessionCode}.`);
});

// ══════════════════════════════════════════════════════════════
// PAPER FORMATTER — Academic Restrictions & Auto-Binding
// ──────────────────────────────────────────────────────────────
// 1. Instructor name   → auto-bound to me.name (readonly, no tag)
// 2. University name   → permanently readonly (no tag)
// 3. Subject           → dropdown of teacher's assigned courses only
// 4. Total Marks       → free input, validated: must be 1–100
// 5. Marks sum guard   → question parts must total exactly entered marks
// ══════════════════════════════════════════════════════════════

// Populates pgSubject select with this teacher's assigned courses
// Called on every myCourses snapshot update and on tab open
function populatePaperSubjectSelect() {
  const sel = document.getElementById("pgSubject");
  if (!sel) return;
  const prev = sel.value;
  sel.innerHTML = `<option value="">Select assigned subject…</option>` +
    myCourses.map(c =>
      `<option value="${esc(c.name)}">${esc(c.name)} (${esc(c.code)})</option>`
    ).join("");
  // Restore previously selected course after refresh
  if (prev && myCourses.find(c => c.name === prev)) sel.value = prev;
}

// Called when the AI Paper Formatter tab is opened.
// Auto-binds instructor name from Firestore session and refreshes
// the subject dropdown with this teacher's assigned courses.
function initPaperFormatter() {
  if (me && me.name) {
    document.getElementById("pgTeacher").value = me.name;
  }
  populatePaperSubjectSelect();
}

// ══════════════════════════════════════════════════════════════
// PAPER CONFIGURATION — CLO + BTL fields added per question
// ══════════════════════════════════════════════════════════════
document.getElementById("pgNumQ").addEventListener("change", updatePaperConfig);

function updatePaperConfig() {
  const n  = parseInt(document.getElementById("pgNumQ").value, 10);
  let html = "";
  for (let i = 1; i <= n; i++) {
    const defaultCLO = ((i - 1) % 3) + 1;
    const defaultBTL = Math.min(2 + i, 6);
    html += `
      <div class="pg-config-box">
        <h4>Question ${i}</h4>
        <div class="pg-config-meta">
          <div class="field">
            <label>Parts</label>
            <select id="pgP${i}" style="padding:7px 10px; border:1.5px solid var(--line); border-radius:6px; font-size:.84rem;">
              <option value="4">4 Parts (a–d)</option>
              <option value="5" selected>5 Parts (a–e)</option>
              <option value="6">6 Parts (a–f)</option>
            </select>
          </div>
          <div class="field">
            <label>CLO number</label>
            <input type="number" id="pgCLO${i}" min="1" value="${defaultCLO}"
              style="padding:7px 10px; border:1.5px solid var(--line); border-radius:6px; font-size:.84rem;">
          </div>
          <div class="field">
            <label>BTL level (1–6)</label>
            <input type="number" id="pgBTL${i}" min="1" max="6" value="${defaultBTL}"
              style="padding:7px 10px; border:1.5px solid var(--line); border-radius:6px; font-size:.84rem;">
          </div>
        </div>
        <div id="pgPC${i}"></div>
      </div>`;
  }
  document.getElementById("pgConfig").innerHTML = html;

  for (let i = 1; i <= n; i++) {
    document.getElementById(`pgP${i}`).addEventListener("change", () => updatePaperParts(i));
    updatePaperParts(i);
  }
}

function updatePaperParts(q) {
  const n     = parseInt(document.getElementById(`pgP${q}`).value, 10);
  const parts = ["a", "b", "c", "d", "e", "f"];
  let html    = "";
  for (let i = 0; i < n; i++) {
    const defaultMarks = i < 2 ? 2 : i < 4 ? 3 : 5;
    html += `
      <div class="pg-part-row">
        <strong>(${parts[i]})</strong>
        <span style="font-size:.8rem; color:var(--ink-soft);">Question part</span>
        <input type="number" id="pgM${q}_${i}" value="${defaultMarks}" min="1" max="20">
      </div>`;
  }
  document.getElementById(`pgPC${q}`).innerHTML = html;
}

// ══════════════════════════════════════════════════════════════
// PAPER GENERATION — full integration from paper-formatter.html
// ══════════════════════════════════════════════════════════════

// collectQuestionConfigs — reads CLO, BTL, parts, marks per question
function collectQuestionConfigs() {
  const n       = parseInt(document.getElementById("pgNumQ").value, 10);
  const labels  = ["a", "b", "c", "d", "e", "f"];
  const configs = [];
  for (let i = 1; i <= n; i++) {
    const numParts = parseInt(document.getElementById(`pgP${i}`).value, 10);
    const clo      = document.getElementById(`pgCLO${i}`).value.trim();
    const btl      = document.getElementById(`pgBTL${i}`).value.trim();
    const parts    = [];
    for (let j = 0; j < numParts; j++) {
      const marks = parseInt(document.getElementById(`pgM${i}_${j}`).value, 10) || 2;
      parts.push({ label: labels[j], marks });
    }
    configs.push({ num: i, clo, btl, parts });
  }
  return configs;
}

document.getElementById("paperGenBtn").addEventListener("click", triggerPaperGen);

async function triggerPaperGen() {
  const instructor   = document.getElementById("pgTeacher").value.trim();
  const university   = document.getElementById("pgUniversity").value.trim();
  const subjectName  = document.getElementById("pgSubject").value.trim();
  const program      = document.getElementById("pgProgram").value;
  const semester     = document.getElementById("pgSemester").value;
  const section      = document.getElementById("pgSection").value;
  const examType     = document.getElementById("pgExamType").value;
  const examDate     = document.getElementById("pgDate").value;
  const duration     = document.getElementById("pgDuration").value.trim();
  const totalMarks   = document.getElementById("pgTotalMarks").value.trim();
  const topics       = document.getElementById("pgTopics").value.trim();
  const clos         = document.getElementById("pgClos").value.trim();
  const instructions = document.getElementById("pgInstructions").value.trim();

  if (!instructor || !university || !subjectName || !program || !duration || !totalMarks || !topics || !clos) {
    setPaperMsg("Please fill in all required fields (*).", "error");
    return;
  }
  if (!subjectName) {
    setPaperMsg("Please select an assigned subject from the dropdown.", "error");
    return;
  }

  // ── Total Marks validation ────────────────────────────────
  const totalMarksNum = parseInt(totalMarks, 10);
  if (isNaN(totalMarksNum) || totalMarksNum <= 0) {
    setPaperMsg("Please enter a valid number for Total Marks.", "error");
    return;
  }
  if (totalMarksNum > 100) {
    setPaperMsg(
      "Total marks cannot exceed 100. Please enter a value between 1 and 100.",
      "error"
    );
    return;
  }

  // ── Marks sum validation ──────────────────────────────────
  // Sum of all question part marks must equal the entered total.
  const questionConfig = collectQuestionConfigs();
  const marksSum       = questionConfig.reduce(
    (acc, q) => acc + q.parts.reduce((s, p) => s + p.marks, 0), 0
  );

  if (marksSum !== totalMarksNum) {
    setPaperMsg(
      `Marks mismatch: your question parts total ${marksSum} marks, ` +
      `but Total Marks is set to ${totalMarksNum}. ` +
      `Adjust the marks per part in Question Configuration to sum to exactly ${totalMarksNum}.`,
      "error"
    );
    return;
  }
  // ─────────────────────────────────────────────────────────

  // ── Topics to Cover — quality validation ─────────────────
  // Rejects gibberish, pure numbers, single characters, and
  // entries too short to represent real academic topics.
  // Rules:
  //   • At least 10 characters total
  //   • Must contain at least one real English word (3+ letters,
  //     alphabetic only — filters out "abc", "123", "qwe", etc.)
  //   • That word must appear in a known dictionary of common
  //     English/academic words OR be 5+ letters long (generous
  //     heuristic to catch real subject terms without a full
  //     dictionary lookup)
  const TOPICS_MIN_LEN  = 10;
  const WORD_RE         = /\b([a-zA-Z]{3,})\b/g;

  if (topics.length < TOPICS_MIN_LEN) {
    setPaperMsg(
      "Please enter valid, descriptive topics to cover " +
      "(e.g., Requirements Engineering, Software Design).",
      "error"
    );
    return;
  }

  // Collect all alpha-only words of 3+ letters from the topics field
  const topicWords = [...topics.matchAll(WORD_RE)].map(m => m[1].toLowerCase());

  // A word is considered "real" if it is 5+ chars OR is in a core
  // vocabulary list. This blocks "abc", "qwe", "xyz", "test", "aaa"
  // while allowing valid short academic words like "use", "map", "net".
  const CORE_VOCAB = new Set([
    "use","map","net","set","get","put","run","log","key","api","oop",
    "sql","xml","uml","aws","css","web","app","bug","git","ide","tcp",
    "ip","ux","ui","qa","ci","cd","due","via","per","the","and","for",
    "not","but","all","can","its","how","why","who","let","new","old",
    "big","low","top","end","mid","lab","pop","fix","hit","run","cpu"
  ]);

  const hasRealTopicWord = topicWords.some(
    w => w.length >= 5 || CORE_VOCAB.has(w)
  );

  if (!hasRealTopicWord) {
    setPaperMsg(
      "Please enter valid, descriptive topics to cover " +
      "(e.g., Requirements Engineering, Software Design).",
      "error"
    );
    return;
  }
  // ─────────────────────────────────────────────────────────

  // ── CLOs — academic quality validation ───────────────────
  // Each non-empty line must:
  //   • Be at least 12 characters long
  //   • Contain at least one recognised cognitive action verb
  //     (Bloom's Taxonomy verbs + common academic verbs)
  //
  // Rejects: "abc", "123", "CLO 1", single-word entries,
  //          random character strings.
  const CLO_ACTION_VERBS = [
    "explain","apply","discuss","design","analyze","analyse",
    "compare","evaluate","construct","implement","understand",
    "demonstrate","identify","describe","develop","create",
    "assess","justify","interpret","summarize","summarise",
    "classify","differentiate","calculate","formulate","plan",
    "propose","select","use","build","test","validate","verify",
    "define","distinguish","illustrate","outline","review",
    "solve","integrate","manage","produce","recognize","recognise",
    "articulate","examine","investigate","model","simulate",
    "deploy","configure","debug","document","estimate","measure"
  ];

  // Build a single regex that matches any action verb as a whole word
  const CLO_VERB_RE = new RegExp(
    "\\b(" + CLO_ACTION_VERBS.join("|") + ")\\b", "i"
  );
  const CLO_MIN_LEN = 12;

  const cloLines = clos
    .split("\n")
    .map(l => l.trim())
    .filter(l => l.length > 0); // skip blank lines

  for (const line of cloLines) {
    if (line.length < CLO_MIN_LEN) {
      setPaperMsg(
        "Each CLO must be a properly structured academic statement " +
        "starting with an action verb " +
        "(e.g., 'Apply process models...', 'Design database schemas...').",
        "error"
      );
      return;
    }
    if (!CLO_VERB_RE.test(line)) {
      setPaperMsg(
        "Each CLO must be a properly structured academic statement " +
        "starting with an action verb " +
        "(e.g., 'Apply process models...', 'Design database schemas...').",
        "error"
      );
      return;
    }
  }
  // ─────────────────────────────────────────────────────────

  const btn = document.getElementById("paperGenBtn");
  btn.disabled    = true;
  btn.textContent = "Generating…";
  setPaperMsg("Calling AI — this takes about 15 seconds…", "info");
  document.getElementById("paperPreviewCard").style.display = "none";

  try {
    const aiData = await callCloudFunction("paper", {
      instructor, university, subjectName, program, semester, section,
      examType, examDate, duration, totalMarks, topics, clos,
      instructions, numQ: questionConfig.length, questionConfig,
    });

    if (!aiData.questions || !Array.isArray(aiData.questions)) {
      throw new Error("The Cloud Function returned an unexpected response structure.");
    }

    // Store for print / PDF
    currentPaperData = {
      fields: { instructor, university, subjectName, program, semester, section, examType, examDate, duration, totalMarks, clos, instructions },
      questionConfig,
      questions: aiData.questions
    };

    renderPaper(currentPaperData);

    // Audit log to Firestore — teacherId mapped to auth.currentUser.uid
    await addDoc(collection(db, "paperFormats"), {
      teacherId:   auth.currentUser.uid,
      teacherName: me.name,
      title:       `${examType} — ${subjectName}`,
      subject:     subjectName, program, semester, examType,
      createdAt:   serverTimestamp(),
    });

    document.getElementById("paperPreviewCard").style.display = "block";
    document.getElementById("paperPreviewCard").scrollIntoView({ behavior: "smooth" });
    setPaperMsg("Paper generated successfully.", "success");

  } catch (err) {
    console.error("Paper generation error:", err);
    setPaperMsg("Error: " + err.message, "error");
  } finally {
    btn.disabled    = false;
    btn.textContent = "Generate Paper with AI";
  }
}

function setPaperMsg(text, type) {
  const el = document.getElementById("paperGenMsg");
  el.textContent = text;
  el.className   = text ? `form-msg show ${type}` : "form-msg";
}

// ── renderPaper — matches paper-formatter.html rendering exactly ──
function renderPaper(d) {
  const { fields, questionConfig, questions } = d;

  // CLO table rows (from form textarea, one per line)
  const closList = fields.clos.split("\n").filter(c => c.trim());
  const closHTML = closList.map((c, i) => `
    <tr>
      <td class="pg-clo-label">CLO. ${i + 1}</td>
      <td>${esc(c.trim())}</td>
    </tr>`).join("");

  // Instructions (from form textarea, one per line)
  const instrHTML = fields.instructions.split("\n").filter(l => l.trim())
    .map(l => `<div class="pg-instr-line">${esc(l.trim())}</div>`).join("");

  // Date formatting
  let dateDisplay = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  let year        = new Date().getFullYear();
  if (fields.examDate) {
    const d = new Date(fields.examDate + "T00:00:00");
    year        = d.getFullYear();
    dateDisplay = d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  }

  // Questions
  let questionsHTML = "";
  questions.forEach((q, qi) => {
    const cfg = questionConfig[qi];
    if (!cfg) return;
    const marksStr  = cfg.parts.map(p => p.marks).join(" + ");
    const totalQ    = cfg.parts.reduce((s, p) => s + p.marks, 0);
    const subparts  = Array.isArray(q.subparts) ? q.subparts : [];
    const subHTML   = subparts.map(sp => `<li>${esc(sp.text)}</li>`).join("");
    questionsHTML += `
      <div class="pg-question">
        <div class="pg-q-header-row">
          <span class="pg-q-title">Question # ${cfg.num}</span>
          <span class="pg-q-meta">CLO: ${esc(cfg.clo)} | BTL: ${esc(cfg.btl)} | Est. Time: ${esc(String(q.estimatedTimeMinutes || "—"))} min | Marks: [${marksStr} = ${totalQ}]</span>
        </div>
        <hr class="pg-q-rule">
        <p class="pg-q-scenario"><strong>Scenario:</strong> ${esc(q.scenario || "")}</p>
        <ol class="pg-q-parts">${subHTML}</ol>
      </div>`;
  });

  document.getElementById("pgPaperPreview").innerHTML = `
    <div class="pg-paper-wrap">
      <div class="pg-paper-header">
        <h3>${esc(fields.university.toUpperCase())}</h3>
        <div class="pg-paper-sub">${esc(fields.semester)} Semester ${esc(fields.examType)} ${year}</div>
        <div class="pg-double-rule"><div></div><div style="margin-top:2px;"></div></div>
      </div>
      <div class="pg-meta-grid">
        <div class="pg-meta-left"><strong>Subject:</strong> ${esc(fields.subjectName)}</div>
        <div class="pg-meta-right"><strong>Program:</strong> ${esc(fields.program)}</div>
        <div class="pg-meta-left"><strong>Instructor:</strong> ${esc(fields.instructor)}</div>
        <div class="pg-meta-right"><strong>Total Marks:</strong> ${esc(fields.totalMarks)}</div>
        <div class="pg-meta-left"><strong>Time Allowed:</strong> ${esc(fields.duration)}</div>
        <div class="pg-meta-right"><strong>Date:</strong> ${dateDisplay}</div>
        <div class="pg-meta-left"><strong>Semester:</strong> ${esc(fields.semester)} Semester</div>
        <div class="pg-meta-right"><strong>Section:</strong> ${esc(fields.section)}</div>
      </div>
      <table class="pg-clo-table">
        <tr><td colspan="2"><strong>Course Learning Outcomes (CLOs):</strong></td></tr>
        ${closHTML}
      </table>
      <div class="pg-instr-block">
        <strong>Instructions:</strong>
        ${instrHTML}
      </div>
      ${questionsHTML}
    </div>`;
}

// ── Copy paper text ──────────────────────────────────────────
document.getElementById("copyPaperBtn").addEventListener("click", () => {
  const preview = document.getElementById("pgPaperPreview");
  navigator.clipboard.writeText(preview ? preview.innerText : "");
  document.getElementById("copyPaperBtn").textContent = "Copied!";
  setTimeout(() => { document.getElementById("copyPaperBtn").textContent = "Copy text"; }, 2000);
});

// ── Print / Save as PDF (browser native print dialog) ────────
// Matches paper-formatter.html printPaper() exactly
document.getElementById("printPaperBtn").addEventListener("click", printPaper);

function printPaper() {
  const paperHTML = document.getElementById("pgPaperPreview")?.innerHTML;
  if (!paperHTML?.trim()) { alert("Please generate the paper first."); return; }

  const printStyles = `
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Times New Roman', serif; color: #000; padding: 40px; }
    .pg-paper-header  { text-align: center; margin-bottom: 20px; }
    .pg-paper-header h3 { font-size: 22px; letter-spacing: .5px; }
    .pg-paper-sub     { font-size: 15px; margin-top: 4px; font-weight: bold; }
    .pg-double-rule   { margin-top: 14px; }
    .pg-double-rule > div { border-top: 1.4px solid #000; height: 3px; }
    .pg-meta-grid     { display: grid; grid-template-columns: 1fr 1fr; row-gap: 6px; column-gap: 20px; margin: 22px 0; font-size: 14.5px; }
    .pg-meta-left     { text-align: left; }
    .pg-meta-right    { text-align: right; }
    .pg-clo-table     { width: 100%; border-collapse: collapse; margin: 20px 0; font-size: 14.5px; }
    .pg-clo-table td  { border: 1px solid #000; padding: 7px 10px; text-align: left; vertical-align: top; }
    .pg-clo-label     { width: 70px; font-weight: bold; white-space: nowrap; }
    .pg-instr-block   { text-align: left; font-size: 14.5px; line-height: 1.6; margin: 18px 0 8px; }
    .pg-instr-line    { margin: 2px 0; }
    .pg-question      { margin: 26px 0 0; page-break-inside: avoid; }
    .pg-q-header-row  { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; flex-wrap: wrap; }
    .pg-q-title       { font-weight: bold; font-size: 15px; }
    .pg-q-meta        { font-size: 13px; }
    .pg-q-rule        { border: none; border-top: 1px solid #000; margin: 6px 0 14px; }
    .pg-q-scenario    { font-size: 14.5px; line-height: 1.6; margin: 0 0 12px; text-align: justify; }
    .pg-q-parts       { padding-left: 22px; margin: 0; list-style-type: lower-alpha; }
    .pg-q-parts li    { margin: 10px 0; font-size: 14.5px; line-height: 1.6; padding-left: 4px; }
    @page { margin: 15mm; }`;

  const printWindow = window.open("", "_blank", "width=900,height=1000");
  if (!printWindow) { alert("Please allow pop-ups for this page, then click the button again."); return; }
  printWindow.document.open();
  printWindow.document.write(`<!DOCTYPE html><html><head><title>Exam Paper</title><meta charset="UTF-8"><style>${printStyles}</style></head><body>${paperHTML}</body></html>`);
  printWindow.document.close();
  let printed = false;
  const triggerPrint = () => {
    if (printed) return;
    printed = true;
    printWindow.focus();
    printWindow.print();
  };
  printWindow.onload = triggerPrint;
  setTimeout(triggerPrint, 500);
}

// ── Download PDF via jsPDF ────────────────────────────────────
document.getElementById("downloadPaperBtn").addEventListener("click", downloadPaperAsPDF);

function downloadPaperAsPDF() {
  if (!currentPaperData) return;
  if (!window.jspdf) { alert("jsPDF not loaded — check your internet connection."); return; }

  const { jsPDF }  = window.jspdf;
  const pdf        = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const d          = currentPaperData;
  const f          = d.fields;
  const margin     = 18;
  const pageW      = 210;
  const contentW   = pageW - 2 * margin;
  const pageH      = 297;
  const safeBottom = pageH - 16;
  let y            = margin;

  const checkY = (need = 10) => { if (y + need > safeBottom) { pdf.addPage(); y = margin; } };

  // University + exam type header
  pdf.setFont("times", "bold"); pdf.setFontSize(14);
  const uniLines = pdf.splitTextToSize(f.university.toUpperCase(), contentW);
  pdf.text(uniLines, pageW / 2, y, { align: "center" });
  y += uniLines.length * 6 + 2;

  pdf.setFontSize(12);
  const examDate = f.examDate ? new Date(f.examDate + "T00:00:00").getFullYear() : new Date().getFullYear();
  const subTitle = `${f.semester} Semester ${f.examType} ${examDate}`;
  pdf.text(subTitle, pageW / 2, y, { align: "center" });
  y += 8;

  // Double rule
  pdf.setLineWidth(0.8); pdf.line(margin, y, pageW - margin, y); y += 1;
  pdf.line(margin, y, pageW - margin, y); y += 5;

  // Meta grid
  pdf.setFont("times", "normal"); pdf.setFontSize(11);
  const dateStr = f.examDate
    ? new Date(f.examDate + "T00:00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
    : new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  [
    [`Subject: ${f.subjectName}`,  `Program: ${f.program}`],
    [`Instructor: ${f.instructor}`, `Total Marks: ${f.totalMarks}`],
    [`Time Allowed: ${f.duration}`, `Date: ${dateStr}`],
  ].forEach(([l, r]) => {
    pdf.text(l, margin, y); pdf.text(r, pageW - margin, y, { align: "right" }); y += 6;
  });
  y += 3;

  // CLO table header
  pdf.setFont("times", "bold"); pdf.setFontSize(11);
  pdf.text("Course Learning Outcomes (CLOs):", margin, y); y += 6;
  pdf.setFont("times", "normal"); pdf.setFontSize(10);
  f.clos.split("\n").filter(c => c.trim()).forEach((clo, i) => {
    checkY(8);
    const lines = pdf.splitTextToSize(`CLO. ${i + 1}   ${clo.trim()}`, contentW - 4);
    pdf.text(lines, margin + 2, y); y += lines.length * 5 + 2;
  });
  y += 3;

  // Instructions
  checkY(8); pdf.setFont("times", "bold"); pdf.setFontSize(10);
  pdf.text("Instructions:", margin, y); y += 5;
  pdf.setFont("times", "normal");
  f.instructions.split("\n").filter(l => l.trim()).forEach(line => {
    checkY(6);
    const lines = pdf.splitTextToSize(line.trim(), contentW - 4);
    pdf.text(lines, margin + 2, y); y += lines.length * 5 + 1;
  });
  y += 4;

  // Separator
  checkY(6); pdf.setLineWidth(0.4); pdf.line(margin, y, pageW - margin, y); y += 6;

  // Questions
  d.questions.forEach((q, qi) => {
    const cfg = d.questionConfig[qi];
    if (!cfg) return;
    checkY(16);

    const marksStr = cfg.parts.map(p => p.marks).join(" + ");
    const totalQ   = cfg.parts.reduce((s, p) => s + p.marks, 0);

    // Question header bar
    pdf.setFont("times", "bold"); pdf.setFontSize(12);
    pdf.setFillColor(240, 240, 240);
    pdf.rect(margin, y - 4, contentW, 9, "F");
    pdf.text(`Question # ${cfg.num}`, margin + 2, y);
    const metaStr = `CLO: ${cfg.clo} | BTL: ${cfg.btl} | Est: ${q.estimatedTimeMinutes || "—"} min | Marks: [${marksStr} = ${totalQ}]`;
    pdf.setFont("times", "normal"); pdf.setFontSize(9);
    pdf.text(metaStr, pageW - margin, y, { align: "right" });
    y += 10;

    // Scenario
    checkY(12); pdf.setFont("times", "italic"); pdf.setFontSize(11);
    const scenLines = pdf.splitTextToSize(`Scenario: ${q.scenario || ""}`, contentW);
    pdf.text(scenLines, margin, y); y += scenLines.length * 5.5 + 4;

    // Subparts
    pdf.setFont("times", "normal"); pdf.setFontSize(11);
    (q.subparts || []).forEach((sp, si) => {
      checkY(10);
      const label   = `(${sp.label})`;
      const spLines = pdf.splitTextToSize(sp.text, contentW - 14);
      pdf.text(label, margin + 4, y);
      pdf.text(spLines, margin + 14, y); y += spLines.length * 6 + 2;
    });
    y += 5;
  });

  // Page numbers
  const totalPages = pdf.internal.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    pdf.setPage(i); pdf.setFont("times", "normal"); pdf.setFontSize(9);
    pdf.text(`Page ${i} of ${totalPages}`, pageW - margin, pageH - 8, { align: "right" });
  }

  const safe = (f.subjectName || "paper").replace(/\s+/g, "-").toLowerCase();
  pdf.save(`exam-${safe}-${Date.now()}.pdf`);
}

// ══════════════════════════════════════════════════════════════
// ANALYTICS
// ══════════════════════════════════════════════════════════════
// Initialized to null so optional-chaining .destroy() is always safe
// and no temporal dead zone can occur regardless of call order.
let chartAttendance = null;
let chartQuizzes    = null;
async function renderAnalytics() {
  const labels           = [];
  const attendanceCounts = [];
  const quizCounts       = [];

  for (const s of mySessions.slice(0, 8)) {
    labels.push(s.code);
    const attSnap  = await getDocs(query(collection(db, "attendance"), where("sessionId", "==", s.id)));
    attendanceCounts.push(attSnap.size);
    const quizSnap = await getDocs(query(collection(db, "quizzes"),    where("sessionId", "==", s.id)));
    quizCounts.push(quizSnap.size);
  }

  const attCtx = document.getElementById("chartAttendance");
  if (attCtx) {
    chartAttendance?.destroy();
    chartAttendance = new Chart(attCtx, {
      type: "bar",
      data: {
        labels,
        datasets: [{
          label:           "Students present",
          data:            attendanceCounts,
          backgroundColor: "#2E86DE",
          borderRadius:    6,
          barThickness:    40,
        }],
      },
      options: {
        responsive:          true,
        maintainAspectRatio: true,
        aspectRatio:         3,
        plugins: {
          legend: { display: false },
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks:       { precision: 0, stepSize: 1 },
            grid:        { color: "rgba(0,0,0,.06)" },
          },
          x: {
            grid: { display: false },
          },
        },
      },
    });
  }

  const quizCtx = document.getElementById("chartQuizzes");
  if (quizCtx) {
    chartQuizzes?.destroy();
    chartQuizzes = new Chart(quizCtx, {
      type: "bar",
      data: {
        labels,
        datasets: [{
          label:           "Questions broadcast",
          data:            quizCounts,
          backgroundColor: "#FFC600",
          borderRadius:    6,
          barThickness:    40,
        }],
      },
      options: {
        responsive:          true,
        maintainAspectRatio: true,
        aspectRatio:         3,
        plugins: {
          legend: { display: false },
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks:       { precision: 0, stepSize: 1 },
            grid:        { color: "rgba(0,0,0,.06)" },
          },
          x: {
            grid: { display: false },
          },
        },
      },
    });
  }
}

// ══════════════════════════════════════════════════════════════
// SCHEDULE — Weekly timetable management
// ──────────────────────────────────────────────────────────────
// Loads teacher's scheduled time slots from /schedules, renders
// a 6-day grid (Mon–Sat), and enforces overlap prevention before
// saving new entries. Teachers can delete any slot via the Remove
// button rendered inside each calendar cell.
// ══════════════════════════════════════════════════════════════
const SCHED_DAYS = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];

function listenSchedules() {
  const q = query(
    collection(db, "schedules"),
    where("teacherId", "==", auth.currentUser.uid)
  );
  onSnapshot(q, snap => {
    mySchedules = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderWeeklyCalendar(mySchedules);
  });
}

function populateScheduleSelect() {
  const sel = document.getElementById("schedCourse");
  if (!sel) return;
  const current = sel.value;
  sel.innerHTML = `<option value="">Select a course...</option>` +
    myCourses.map(c =>
      `<option value="${c.id}|${esc(c.name)}|${esc(c.code)}">${esc(c.name)} (${esc(c.code)})</option>`
    ).join("");
  sel.value = current;
}

function renderWeeklyCalendar(schedules) {
  const container = document.getElementById("weeklyCalendar");
  if (!container) return;

  if (!schedules.length) {
    container.innerHTML = `<p class="empty-state">No schedule entries yet. Add a time slot above.</p>`;
    return;
  }

  const todayName = SCHED_DAYS[new Date().getDay() - 1] || "";
  const byDay = {};
  SCHED_DAYS.forEach(d => byDay[d] = []);
  schedules.forEach(s => { if (byDay[s.dayOfWeek]) byDay[s.dayOfWeek].push(s); });
  SCHED_DAYS.forEach(d => byDay[d].sort((a, b) => a.startTime.localeCompare(b.startTime)));

  container.innerHTML = `<div class="week-grid">` +
    SCHED_DAYS.map(day => `
      <div class="week-day-col">
        <div class="week-day-header${day === todayName ? " today" : ""}">${day.slice(0, 3)}</div>
        ${byDay[day].length
          ? byDay[day].map(s => `
              <div class="week-slot">
                <span class="week-slot-course">${esc(s.courseName)}</span>
                <span class="week-slot-time">${s.startTime} – ${s.endTime}</span>
                <button
                  style="margin-top:5px; font-size:.68rem; padding:2px 8px; border:1px solid var(--line);
                         border-radius:4px; background:#fff; cursor:pointer; color:var(--red);"
                  data-del-sched="${s.id}">Remove</button>
              </div>`).join("")
          : `<div class="week-empty">—</div>`}
      </div>`).join("") +
    `</div>`;

  container.querySelectorAll("[data-del-sched]").forEach(btn =>
    btn.addEventListener("click", async () => {
      if (!confirm("Remove this schedule slot?")) return;
      try { await deleteDoc(doc(db, "schedules", btn.getAttribute("data-del-sched"))); }
      catch (err) { alert("Could not remove: " + err.message); }
    })
  );
}

// Overlap detection — runs client-side against already-loaded mySchedules
function scheduleOverlaps(dayOfWeek, startTime, endTime) {
  // Two ranges overlap when: start1 < end2 AND end1 > start2
  return mySchedules.some(s =>
    s.dayOfWeek === dayOfWeek &&
    startTime < s.endTime &&
    endTime   > s.startTime
  );
}

document.getElementById("scheduleForm").addEventListener("submit", async e => {
  e.preventDefault();
  const raw       = document.getElementById("schedCourse").value;
  const [courseId, courseName, courseCode] = raw.split("|");
  const dayOfWeek = document.getElementById("schedDay").value;
  const startTime = document.getElementById("schedStart").value;
  const endTime   = document.getElementById("schedEnd").value;
  const msg       = document.getElementById("schedMsg");
  const btn       = document.getElementById("schedSubmitBtn");

  if (!courseId) { msg.className="form-msg show error"; msg.textContent="Please select a course."; return; }

  if (startTime >= endTime) {
    msg.className   = "form-msg show error";
    msg.textContent = "End time must be later than start time.";
    return;
  }

  if (scheduleOverlaps(dayOfWeek, startTime, endTime)) {
    msg.className   = "form-msg show error";
    msg.textContent = `Schedule conflict on ${dayOfWeek} between ${startTime} and ${endTime}. Please choose a different time.`;
    return;
  }

  btn.disabled = true; btn.textContent = "Saving...";
  try {
    await addDoc(collection(db, "schedules"), {
      courseId, courseName, courseCode,
      teacherId:   auth.currentUser.uid,
      teacherName: me.name,
      dayOfWeek, startTime, endTime,
      createdAt: serverTimestamp()
    });
    msg.className   = "form-msg show success";
    msg.textContent = `${courseName} added on ${dayOfWeek} (${startTime} – ${endTime}).`;
    e.target.reset();
  } catch (err) {
    msg.className   = "form-msg show error";
    msg.textContent = "Failed to save: " + err.message;
  } finally {
    btn.disabled = false; btn.textContent = "Add to schedule";
  }
});

// ══════════════════════════════════════════════════════════════
// QUIZ RESPONSE MONITOR — real-time teacher view
// ──────────────────────────────────────────────────────────────
// Sets up three onSnapshot listeners when the teacher opens a
// live session: one on /quizzes (to get questions + correctIndex),
// one on /quizAnswers (to get student responses), and one on
// /attendance (to populate the student roster).
// Renders a matrix with green (correct), red (wrong), grey
// (pending) chips per student per question, plus a live score.
// Short-answer questions show a preview of the typed answer and
// are not auto-graded (cannot compare free text).
// ══════════════════════════════════════════════════════════════
function listenQuizMonitor(sessionId) {
  // Tear down any previous session's listeners
  monitorUnsub.forEach(fn => fn());
  monitorUnsub    = [];
  monitorQuizzes  = [];
  monitorAnswers  = {};
  monitorStudents = [];
  document.getElementById("quizMonitorSection").style.display = "none";

  // 1. Quiz questions (from new subcollection)
  const unsubQ = onSnapshot(
    query(collection(db, `sessions/${sessionId}/questions`), orderBy("createdAt", "asc")),
    snap => {
      monitorQuizzes = snap.docs
        .map(d => ({ id: d.id, ...d.data() }));
      renderResponseMatrix();
    }, () => {}
  );

  // 2. Student answers (from new subcollection)
  const unsubA = onSnapshot(
    collection(db, `sessions/${sessionId}/answers`),
    snap => {
      monitorAnswers = {};
      snap.docs.forEach(d => {
        const data = d.data();
        if (!monitorAnswers[data.studentId]) monitorAnswers[data.studentId] = {};
        monitorAnswers[data.studentId][data.questionId] = {
          answer:      data.answer,
          answerIndex: data.answerIndex,
        };
        // Add student to roster if not already there
        if (!monitorStudents.find(s => s.studentId === data.studentId)) {
          monitorStudents.push({
            studentId:   data.studentId,
            studentName: data.studentName || "Student"
          });
        }
      });
      renderResponseMatrix();
    }, () => {}
  );

  // 3. Attendance roster — fills in students who joined but haven't answered yet
  const unsubAtt = onSnapshot(
    query(collection(db, "attendance"), where("sessionId", "==", sessionId)),
    snap => {
      snap.docs.forEach(d => {
        const data = d.data();
        if (!monitorStudents.find(s => s.studentId === data.studentId)) {
          monitorStudents.push({
            studentId:   data.studentId,
            studentName: data.studentName || "Student"
          });
        }
      });
      renderResponseMatrix();
    }, () => {}
  );

  monitorUnsub.push(unsubQ, unsubA, unsubAtt);
}

function renderResponseMatrix() {
  const section = document.getElementById("quizMonitorSection");
  const matrix  = document.getElementById("quizResponseMatrix");
  if (!section || !matrix) return;

  // Don't show until at least one question has been broadcast
  if (!monitorQuizzes.length) {
    section.style.display = "none";
    return;
  }
  section.style.display = "block";

  if (!monitorStudents.length) {
    matrix.innerHTML = `<p class="empty-state" style="padding:14px;">No students have responded yet.</p>`;
    return;
  }

  // Header row: Student | Q1 (2m) | Q2 (3m) | ... | Score
  const qHeaders = monitorQuizzes.map((q, i) => {
    const isShort = !q.options || q.options.length === 0;
    return `<th>Q${i + 1}${isShort ? " (Short)" : ` (${q.marks || 0}m)`}</th>`;
  }).join("");

  const hasMcq = monitorQuizzes.some(q => q.options && q.options.length > 0);

  // Build one row per student
  const rows = monitorStudents.map(student => {
    let earnedMarks = 0;
    let totalMarks  = 0;

    const cells = monitorQuizzes.map(q => {
      const isShort = !q.options || q.options.length === 0;
      const ans     = monitorAnswers[student.studentId]?.[q.id];
      totalMarks   += (q.marks || 0);

      if (!ans) return `<td><span class="qm-chip qm-pending">Pending</span></td>`;

      if (isShort) {
        const preview = String(ans.answer || "").slice(0, 22) + (ans.answer?.length > 22 ? "…" : "");
        return `<td><span class="qm-chip qm-short" title="${esc(ans.answer || "")}">${esc(preview)}</span></td>`;
      }

      // MCQ — compare against correctIndex
      const isCorrect = ans.answerIndex !== null && ans.answerIndex === q.correctIndex;
      if (isCorrect) earnedMarks += (q.marks || 0);
      const letter = ans.answerIndex !== null ? String.fromCharCode(65 + ans.answerIndex) : "—";
      return `<td><span class="qm-chip ${isCorrect ? "qm-correct" : "qm-wrong"}">${esc(letter)}</span></td>`;
    }).join("");

    const scoreCell = hasMcq
      ? `<td><span class="qm-score">${earnedMarks}/${totalMarks}</span></td>`
      : `<td><span class="qm-chip qm-short">—</span></td>`;

    return `<tr>
      <td style="font-weight:600; color:var(--blue-900);">${esc(student.studentName)}</td>
      ${cells}
      ${scoreCell}
    </tr>`;
  }).join("");

  matrix.innerHTML = `
    <table class="qm-table">
      <thead><tr><th>Student</th>${qHeaders}<th>Score</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

// ══════════════════════════════════════════════════════════════
// MY PROFILE — redesigned (reference-matched)
// ──────────────────────────────────────────────────────────────
// Avatar: click → hidden file input → Canvas crop/compress to
//   150×150 JPEG → base64 stored in profilePicUrl on save.
// Top-right user chip: click → navigates to this tab.
// Payload whitelist: role, approval_status NEVER included.
// ══════════════════════════════════════════════════════════════
let profPicDataUrl = null; // holds uploaded image until save

// ── Top-right user chip → Profile tab shortcut ─────────────
document.querySelector(".dash-user-chip").addEventListener("click", () => {
  document.querySelector(".dash-nav button[data-tab='profile']")?.click();
});

// ── Avatar click → browse files ─────────────────────────────
document.getElementById("profAvWrap").addEventListener("click", () => {
  document.getElementById("profilePicFile").click();
});

document.getElementById("profilePicFile").addEventListener("change", e => {
  const file = e.target.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = evt => {
    const img = new Image();
    img.onload = () => {
      // Crop square from center, scale to 150×150, compress ~70%
      const SIZE   = 150;
      const canvas = document.createElement("canvas");
      canvas.width = SIZE; canvas.height = SIZE;
      const ctx    = canvas.getContext("2d");
      const min    = Math.min(img.width, img.height);
      ctx.drawImage(
        img,
        (img.width  - min) / 2, (img.height - min) / 2,
        min, min, 0, 0, SIZE, SIZE
      );
      profPicDataUrl = canvas.toDataURL("image/jpeg", 0.72);
      // Instant preview
      document.getElementById("profileAvLg").innerHTML =
        `<img src="${profPicDataUrl}" alt="Profile">`;
    };
    img.src = evt.target.result;
  };
  reader.readAsDataURL(file);
  e.target.value = ""; // allow re-selecting same file
});

// ── Profile password fields — show/hide toggle ──────────────
// SVGs are swapped on click so the icon reflects current state.
const PROF_EYE_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
  stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
  <circle cx="12" cy="12" r="3"/>
</svg>`;

const PROF_EYE_OFF_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
  stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8
           a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4
           c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19
           m-6.72-1.07a3 3 0 11-4.24-4.24"/>
  <line x1="1" y1="1" x2="23" y2="23"/>
</svg>`;

document.querySelectorAll(".prof-pwd-eye").forEach(btn => {
  btn.addEventListener("click", () => {
    const input   = document.getElementById(btn.getAttribute("data-target"));
    if (!input) return;
    const showing = input.type === "text";
    input.type    = showing ? "password" : "text";
    btn.setAttribute("aria-label", showing ? "Show password" : "Hide password");
    btn.innerHTML = showing ? PROF_EYE_SVG : PROF_EYE_OFF_SVG;
  });
});

// ── setTopbarAvatar ──────────────────────────────────────────
// Renders a profile picture (or initial letter) inside the
// topbar .av chip so it always matches the profile panel.
// The .av element needs overflow:hidden for the image to clip
// correctly to the circular shape set by border-radius:50%.
function setTopbarAvatar(picUrl, name, defaultInitial) {
  const av = document.getElementById("userAv");
  if (picUrl) {
    av.style.overflow = "hidden";
    av.style.padding  = "0";
    av.innerHTML = `<img src="${picUrl.replace(/"/g, "")}" alt="Profile"
      style="width:100%;height:100%;object-fit:cover;display:block;">`;
  } else {
    av.innerHTML  = "";
    av.style.overflow = "";
    av.textContent = (name || defaultInitial).slice(0, 1).toUpperCase();
  }
}

function loadProfileForm() {
  if (!me) return;

  document.getElementById("profileName").value    = me.name       || "";
  document.getElementById("profileContact").value = me.contact    || "";
  document.getElementById("profileDept").value    = me.department || "";

  // Header
  document.getElementById("profileDisplayName").textContent  = me.name  || "Teacher";
  document.getElementById("profileDisplayEmail").textContent = me.email || "";
  // Email row (read-only)
  document.getElementById("profEmailRowVal").textContent = me.email || "";

  // Avatar in profile panel
  const av = document.getElementById("profileAvLg");
  if (me.profilePicUrl) {
    av.innerHTML = `<img src="${esc(me.profilePicUrl)}" alt="${esc(me.name || 'T')}">`;
  } else {
    av.textContent = (me.name || "T").slice(0, 1).toUpperCase();
  }
  // Keep topbar chip in sync with the profile panel avatar
  setTopbarAvatar(me.profilePicUrl, me.name, "T");
  profPicDataUrl = null; // clear any pending upload on reload
}

document.getElementById("profileForm").addEventListener("submit", async e => {
  e.preventDefault();

  const btn  = document.getElementById("profileSaveBtn");
  const msg  = document.getElementById("profileMsg");
  const name = document.getElementById("profileName").value.trim();

  if (!name) {
    msg.className   = "form-msg show error";
    msg.textContent = "Full name is required.";
    return;
  }

  // ── Password pre-validation (runs before button disables) ──
  const currentPwd = document.getElementById("profileCurrentPwd")?.value || "";
  const newPwd     = document.getElementById("profileNewPwd")?.value     || "";

  if (newPwd) {
    if (!currentPwd) {
      msg.className   = "form-msg show error";
      msg.textContent = "Please enter your current password to set a new one.";
      return;
    }
    // Enforce same password strength as registration
    const pwRules = [
      [/.{8,}/,        "at least 8 characters"],
      [/[A-Z]/,        "an uppercase letter"],
      [/[0-9]/,        "a number"],
      [/[^A-Za-z0-9]/, "a special character"],
    ];
    const failed = pwRules.filter(([re]) => !re.test(newPwd)).map(([, l]) => l);
    if (failed.length) {
      msg.className   = "form-msg show error";
      msg.textContent = `New password needs: ${failed.join(", ")}.`;
      return;
    }
  }
  // ──────────────────────────────────────────────────────────

  btn.disabled    = true;
  btn.textContent = "Saving...";
  msg.className   = "form-msg";

  try {
    // Strict whitelist — role and approval_status are NEVER included
    const payload = { name };
    const dept    = document.getElementById("profileDept").value.trim();
    const contact = document.getElementById("profileContact").value.trim();
    if (dept)           payload.department    = dept;
    if (contact)        payload.contact       = contact;
    if (profPicDataUrl) payload.profilePicUrl = profPicDataUrl;

    await updateDoc(doc(db, "users", auth.currentUser.uid), payload);

    // Sync local me object
    me.name       = name;
    me.department = dept;
    me.contact    = contact;
    if (profPicDataUrl) me.profilePicUrl = profPicDataUrl;

    // Refresh topbar name and avatar
    document.getElementById("userName").textContent = name;
    setTopbarAvatar(me.profilePicUrl, name, "T");

    // ── Password change (optional) ────────────────────────
    let passwordChanged = false;
    if (newPwd) {
      // Re-authenticate first — satisfies Firebase's recent-login
      // requirement AND verifies the current password is correct.
      const credential = EmailAuthProvider.credential(
        auth.currentUser.email, currentPwd
      );
      await reauthenticateWithCredential(auth.currentUser, credential);
      await updatePassword(auth.currentUser, newPwd);

      // Clear password fields after a successful change
      document.getElementById("profileCurrentPwd").value = "";
      document.getElementById("profileNewPwd").value     = "";
      passwordChanged = true;
    }
    // ────────────────────────────────────────────────────────

    loadProfileForm(); // refresh preview

    msg.className   = "form-msg show success";
    msg.textContent = passwordChanged
      ? "Profile and password updated successfully."
      : "Profile updated successfully.";

  } catch (err) {
    // Map Firebase Auth error codes to clear, professional messages
    if (err.code === "auth/wrong-password" || err.code === "auth/invalid-credential") {
      msg.className   = "form-msg show error";
      msg.textContent = "The current password you entered is incorrect.";
    } else if (err.code === "auth/requires-recent-login") {
      msg.className   = "form-msg show error";
      msg.textContent =
        "For security, please sign out and sign back in before changing your password.";
    } else if (err.code === "auth/weak-password") {
      msg.className   = "form-msg show error";
      msg.textContent = "New password is too weak. Please choose a stronger password.";
    } else {
      msg.className   = "form-msg show error";
      msg.textContent = "Failed to save: " + err.message;
    }
  } finally {
    btn.disabled    = false;
    btn.textContent = "Save Change";
  }
});

// ══════════════════════════════════════════════════════════════
// Helpers — unchanged
// ══════════════════════════════════════════════════════════════
function esc(str) {
  return String(str ?? "").replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}