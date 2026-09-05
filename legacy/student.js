// ============================================================
// SessionHub — Student Dashboard
// ============================================================
// Changes from previous version:
//   QUIZ: Complete step-by-step quiz engine replacing the
//     single-question show. State: sessionQuestions[], currentQIdx,
//     sessionAnswers{}, quizMode, quizSubmitted. Answers are saved
//     locally and batch-submitted to /quizAnswers on final step.
//   ANALYTICS: Enhanced loadAnalytics — course-level attendance
//     breakdown, quiz submission log, 4-KPI grid, performance snapshot.
//   All other functions (join, polls, Q&A, courses) are unchanged.
// ============================================================

import { requireRole, auth, db } from "./auth.js";
import { signOut, updatePassword, reauthenticateWithCredential, EmailAuthProvider }
  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  collection, query, where, orderBy, onSnapshot, doc, addDoc,
  getDocs, updateDoc, serverTimestamp, runTransaction,
  limit, arrayUnion, arrayRemove
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";

import { Chart, registerables } from "https://cdn.jsdelivr.net/npm/chart.js@4.4.4/+esm";
Chart.register(...registerables);

// ── Tab navigation ──────────────────────────────────────────
const tabs   = document.querySelectorAll(".dash-nav button[data-tab]");
const panels = document.querySelectorAll(".tab-panel");
const titleMap = { join: "Join Session", courses: "My Courses", schedule: "Schedule", analytics: "My Analytics", profile: "My Profile" };

tabs.forEach(btn => {
  btn.addEventListener("click", () => {
    tabs.forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    const tab = btn.getAttribute("data-tab");
    panels.forEach(p => p.classList.toggle("active", p.id === `panel-${tab}`));
    document.getElementById("pageTitle").textContent = titleMap[tab];
    if (tab === "analytics") loadAnalytics();
    if (tab === "schedule")  loadStudentSchedule();
    if (tab === "profile")   loadProfileForm();
  });
});

document.getElementById("logoutBtn").addEventListener("click", async () => {
  await signOut(auth);
  window.location.href = "index.html";
});

// ── Module-level state ──────────────────────────────────────
let me                 = null;
let currentSessionId   = null;
let currentSessionCode = null;

// Enrolled course IDs — kept in sync by listenMyCourses so the
// live session alert listener always reflects current enrolment.
let myEnrolledCourseIds  = [];
let liveAlertUnsubscribe = null;

// Step-by-step quiz engine state
let sessionQuestions = [];   // all questions for this session, sorted asc
let currentQIdx      = 0;    // which question we're showing
let sessionAnswers   = {};   // { [quizId]: { answer, answerIndex } }
let quizMode         = false; // whether quiz has started
let quizSubmitted    = false; // whether all answers have been submitted

requireRole("student", (profile) => {
  me = profile;
  document.getElementById("userName").textContent = profile.name || "Student";
  setTopbarAvatar(profile.profilePicUrl, profile.name, "S");
  listenMyCourses();
  loadAnalytics();
  loadStudentSchedule();

  // ── Auto-fill join code from ?room=CODE URL parameter ──────
  // Teachers share links like: /student.html?room=A3B7K9
  // This pre-fills the input so students just click Join.
  const urlParams  = new URLSearchParams(window.location.search);
  const roomParam  = urlParams.get("room");
  if (roomParam) {
    const input = document.getElementById("joinCode");
    const msg   = document.getElementById("joinMsg");
    if (input) input.value = roomParam.trim().toUpperCase();
    if (msg) {
      msg.className   = "form-msg show info";
      msg.textContent = "Room code loaded from invite link. Click Join to enter.";
    }
    // Switch to Join tab so the pre-filled code is visible
    const joinTab = document.querySelector(".dash-nav button[data-tab='join']");
    if (joinTab) joinTab.click();
  }
});

// ── Remove student from activeStudents on page close ────────
window.addEventListener("beforeunload", () => {
  if (currentSessionId && auth.currentUser) {
    updateDoc(doc(db, "sessions", currentSessionId), {
      activeStudents: arrayRemove(auth.currentUser.uid)
    }).catch(() => {}); // silent — same rule as join
  }
});

// ══════════════════════════════════════════════════════════════
// JOIN SESSION
// Accepts both the original course code (e.g. DBMS-204) and the
// new 6-char roomCode (e.g. A3B7K9) from the invitation link.
// Supports sessions with status "live" (new) or "active" (legacy).
// ══════════════════════════════════════════════════════════════
document.getElementById("joinForm").addEventListener("submit", async e => {
  e.preventDefault();
  const input = document.getElementById("joinCode").value.trim().toUpperCase();
  const msg   = document.getElementById("joinMsg");
  msg.className   = "form-msg show info";
  msg.textContent = "Looking up session…";

  // ── Query by original session code first, then by roomCode ──
  let sessionDoc = null;

  const snapByCode = await getDocs(query(
    collection(db, "sessions"),
    where("code", "==", input)
  ));
  sessionDoc = snapByCode.docs.find(
    d => ["active", "live"].includes(d.data().status)
  ) || null;

  if (!sessionDoc) {
    const snapByRoom = await getDocs(query(
      collection(db, "sessions"),
      where("roomCode", "==", input)
    ));
    sessionDoc = snapByRoom.docs.find(
      d => ["active", "live"].includes(d.data().status)
    ) || null;
  }

  if (!sessionDoc) {
    msg.className   = "form-msg show error";
    msg.textContent = "No active session found with that code.";
    return;
  }

  const sessionData  = sessionDoc.data();
  currentSessionId   = sessionDoc.id;
  currentSessionCode = sessionData.code;

  // ── Mark student as present in the session document ─────────
  // Requires a Firestore rule allowing students to update ONLY
  // the activeStudents field. Wrapped in try/catch so a missing
  // rule fails silently — join still completes via attendance log.
  try {
    await updateDoc(doc(db, "sessions", currentSessionId), {
      activeStudents: arrayUnion(auth.currentUser.uid)
    });
  } catch (permErr) {
    // activeStudents tracking blocked by security rules.
    // Attendance is still logged below — join continues normally.
    console.warn("activeStudents update blocked (check Firestore rules):", permErr.message);
  }

  // ── Auto-log attendance in the attendance sub-collection ────
  await addDoc(collection(db, "attendance"), {
    sessionId:   currentSessionId,
    sessionCode: currentSessionCode,
    studentId:   auth.currentUser.uid,
    studentName: me.name,
    courseId:    sessionData.courseId,
    joinedAt:    serverTimestamp()
  });

  // ── Update UI ───────────────────────────────────────────────
  msg.className   = "form-msg show success";
  msg.textContent = `Joined ${currentSessionCode}.`;

  document.getElementById("liveSessionTitle").textContent = `Connected to ${currentSessionCode}`;
  document.getElementById("liveSessionPanel").style.display = "block";

  // Show teacher presence badge if available
  const presenceBadge = document.getElementById("teacherPresenceBadge");
  if (presenceBadge) {
    presenceBadge.textContent = sessionData.teacherPresent ? "Teacher present" : "Waiting for teacher";
    presenceBadge.className   = `badge ${sessionData.teacherPresent ? "approved" : "pending"}`;
    presenceBadge.style.display = "inline-block";
  }

  listenLiveQuiz(currentSessionId);
  listenLivePoll(currentSessionId);
  listenSessionDoc(currentSessionId);
  listenStudentQA(currentSessionId);
});

// ══════════════════════════════════════════════════════════════
// LIVE QUIZ — Step-by-step engine
// ══════════════════════════════════════════════════════════════
function listenLiveQuiz(sessionId) {
  // Read from new subcollection: sessions/{sid}/questions
  const q = query(
    collection(db, `sessions/${sessionId}/questions`),
    orderBy("createdAt", "asc")
  );

  onSnapshot(q, async snap => {
    const incoming = snap.docs
      .map(d => ({ id: d.id, ...d.data() }));

    // Update question pool without resetting state if quiz is already active
    const prevCount = sessionQuestions.length;
    sessionQuestions = incoming;

    if (!sessionQuestions.length) {
      renderQuizWaiting();
      return;
    }

    // ── Feature 3: Expiration check ────────────────────────────
    // On first load AND on every snapshot update, verify whether
    // this student has already submitted answers for this session.
    // This makes the "submitted" state survive page refreshes —
    // Firestore is the source of truth, not module-level state.
    // Only runs when not already marked submitted (avoid redundant reads).
    if (!quizSubmitted) {
      try {
        const answersSnap = await getDocs(query(
          collection(db, "quizAnswers"),
          where("sessionId", "==", sessionId),
          where("studentId", "==", auth.currentUser.uid)
        ));
        if (answersSnap.size > 0) {
          // Student has previously submitted — prevent re-attempt
          quizSubmitted = true;
          quizMode      = false;
        }
      } catch { /* silent — quiz continues normally if check fails */ }
    }
    // ──────────────────────────────────────────────────────────

    // Start quiz automatically on first arrival
    if (!quizMode && !quizSubmitted) {
      quizMode   = true;
      currentQIdx = 0;
    }

    // If new questions arrived and we're on the last available, update
    // the counter — renderCurrentQuestion reads sessionQuestions.length live
    renderCurrentQuestion();
  });
}

// ── Render: waiting for teacher to broadcast ────────────────
function renderQuizWaiting() {
  document.getElementById("liveQuiz").innerHTML = `
    <div class="sq-state-box">
      <div class="sq-state-title">Waiting for quiz</div>
      <div class="sq-state-sub">Your teacher has not broadcast a quiz yet. Stay on this page.</div>
    </div>`;
}

// ── Render: all submitted ────────────────────────────────────
function renderQuizComplete() {
  const total = sessionQuestions.reduce((s, q) => s + (q.marks || 0), 0);
  document.getElementById("liveQuiz").innerHTML = `
    <div class="sq-state-box submitted">
      <div class="sq-state-title">Quiz submitted</div>
      <div class="sq-state-sub">All ${sessionQuestions.length} answer${sessionQuestions.length !== 1 ? "s" : ""} recorded successfully.</div>
      <div class="sq-score-chip">${sessionQuestions.length} questions · ${total} total marks</div>
    </div>`;
  const badge = document.getElementById("quizStatusBadge");
  badge.textContent  = "Submitted";
  badge.className    = "badge approved";
  badge.style.display = "inline-block";
}

// ── Core render: one question at a time ─────────────────────
function renderCurrentQuestion() {
  if (quizSubmitted) { renderQuizComplete(); return; }

  const box   = document.getElementById("liveQuiz");
  const q     = sessionQuestions[currentQIdx];
  if (!q) { renderQuizWaiting(); return; }

  const total    = sessionQuestions.length;
  const isLast   = currentQIdx === total - 1;
  const isShort  = !q.options || q.options.length === 0;
  const pct      = Math.round(((currentQIdx + 1) / total) * 100);
  const existing = sessionAnswers[q.id];

  // Update status badge
  const badge = document.getElementById("quizStatusBadge");
  badge.textContent   = `${currentQIdx + 1} / ${total}`;
  badge.className     = "badge active";
  badge.style.display = "inline-block";

  // Build options HTML
  let inputHTML = "";
  if (isShort) {
    inputHTML = `<textarea
      id="sqAnswer"
      class="sq-textarea"
      placeholder="Type your comprehensive answer here..."
      rows="5">${esc(existing?.answer || "")}</textarea>`;
  } else {
    inputHTML = `<div class="sq-options">` +
      (q.options || []).map((opt, i) => `
        <button
          class="sq-opt${existing?.answerIndex === i ? " selected" : ""}"
          data-idx="${i}"
          data-text="${esc(opt)}"
          type="button">
          <span class="sq-opt-letter">${String.fromCharCode(65 + i)}</span>
          <span>${esc(opt)}</span>
        </button>`).join("") +
      `</div>`;
  }

  // Indicator text
  let indicatorText = "No answer selected yet";
  let indicatorClass = "sq-indicator";
  if (existing) {
    indicatorText  = isShort
      ? "Answer provided"
      : `Selected: ${String.fromCharCode(65 + existing.answerIndex)}. ${existing.answer}`;
    indicatorClass = "sq-indicator has-answer";
  }

  box.innerHTML = `
    <div class="sq-header">
      <span class="sq-counter">Question ${currentQIdx + 1} of ${total}</span>
      <span class="sq-type-pill">${isShort ? "Short Answer" : "MCQ"} · ${q.marks || 0} marks</span>
    </div>
    <div class="sq-progress-track">
      <div class="sq-progress-fill" style="width:${pct}%"></div>
    </div>
    <p class="sq-qtext">${esc(q.question)}</p>
    ${inputHTML}
    <div class="sq-nav">
      <span class="${indicatorClass}" id="sqIndicator">${indicatorText}</span>
      <button class="btn btn-primary" id="sqNextBtn" type="button">
        ${isLast ? "Submit Quiz" : "Next Question"}
      </button>
    </div>`;

  // Wire MCQ option clicks
  if (!isShort) {
    box.querySelectorAll(".sq-opt").forEach(btn => {
      btn.addEventListener("click", () => {
        box.querySelectorAll(".sq-opt").forEach(b => b.classList.remove("selected"));
        btn.classList.add("selected");
        const letter  = String.fromCharCode(65 + parseInt(btn.getAttribute("data-idx")));
        const text    = btn.getAttribute("data-text");
        const indEl   = document.getElementById("sqIndicator");
        if (indEl) {
          indEl.textContent = `Selected: ${letter}. ${text}`;
          indEl.className   = "sq-indicator has-answer";
        }
      });
    });
  }

  // Wire Next / Submit button
  document.getElementById("sqNextBtn").addEventListener("click", () => {
    const saved = saveCurrentAnswer(q, isShort);
    if (!saved) return;

    if (isLast) {
      submitAllAnswers();
    } else {
      currentQIdx++;
      renderCurrentQuestion();
    }
  });
}

// ── Save current answer to local sessionAnswers ──────────────
function saveCurrentAnswer(q, isShort) {
  if (isShort) {
    const ta = document.getElementById("sqAnswer");
    const text = ta ? ta.value.trim() : "";
    if (!text) {
      ta?.focus();
      return false;
    }
    sessionAnswers[q.id] = { answer: text, answerIndex: null };
  } else {
    const selected = document.querySelector(".sq-opt.selected");
    if (!selected) return false;
    sessionAnswers[q.id] = {
      answer:      selected.getAttribute("data-text"),
      answerIndex: parseInt(selected.getAttribute("data-idx"), 10)
    };
  }
  return true;
}

// ── Batch-submit all answers to /quizAnswers ─────────────────
async function submitAllAnswers() {
  quizSubmitted = true;
  renderQuizComplete();

  const submitAnswer = httpsCallable(getFunctions(getApp()), "submitAnswer");

  for (const [questionId, ans] of Object.entries(sessionAnswers)) {
    try {
      await submitAnswer({
        sessionId: currentSessionId,
        questionId,
        answer: ans.answer,
        answerIndex: ans.answerIndex ?? null,
      });
    } catch (err) {
      console.error("Failed to submit answer for question", questionId, err);
      showMsg("Failed to submit an answer. Please try again.");
    }
  }
}

// ══════════════════════════════════════════════════════════════
// SESSION DOCUMENT WATCHER
// Watches the session document for two things:
//   1. meetingUrl  → shows/hides the Jitsi live class iframe
//   2. teacherPresent → keeps the presence badge accurate
// ══════════════════════════════════════════════════════════════
function listenSessionDoc(sessionId) {
  onSnapshot(doc(db, "sessions", sessionId), snap => {
    if (!snap.exists()) return;

    const data = snap.data();

    // ── Teacher presence badge ─────────────────────────────────
    const presenceBadge = document.getElementById("teacherPresenceBadge");
    if (presenceBadge) {
      presenceBadge.textContent   = data.teacherPresent ? "Teacher present" : "Waiting for teacher";
      presenceBadge.className     = `badge ${data.teacherPresent ? "approved" : "pending"}`;
      presenceBadge.style.display = "inline-block";
    }

    // ── Live class iframe (Jitsi) ──────────────────────────────
    const meetingUrl = data.meetingUrl || null;
    const card  = document.getElementById("liveClassCard");
    const frame = document.getElementById("studentMeetingFrame");

    if (!card || !frame) return;

    if (meetingUrl) {
      card.style.display = "block";
      if (frame.src !== meetingUrl) frame.src = meetingUrl;
      card.scrollIntoView({ behavior: "smooth", block: "start" });
    } else {
      card.style.display = "none";
      frame.src          = "";
    }
  });
}
function listenLivePoll(sessionId) {
  onSnapshot(
    query(collection(db, "polls"), where("sessionId", "==", sessionId)),
    snap => {
      const polls = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));

      const box = document.getElementById("livePoll");
      if (!polls.length) { box.innerHTML = `<p class="empty-state">No poll posted yet.</p>`; return; }

      const p = polls[0];
      box.innerHTML = `
        <p style="font-weight:600; font-size:.9rem; margin-bottom:10px;">${esc(p.question)}</p>
        ${p.options.map((o, i) => `
          <button class="btn btn-outline btn-block" style="margin-bottom:8px; text-align:left;"
            data-vote="${p.id}|${i}">${esc(o.text)}</button>`).join("")}`;

      box.querySelectorAll("[data-vote]").forEach(btn =>
        btn.addEventListener("click", () => votePoll(...btn.getAttribute("data-vote").split("|"))));
    }
  );
}

async function votePoll(pollId, optionIndex) {
  optionIndex = parseInt(optionIndex, 10);
  const ref   = doc(db, "polls", pollId);
  try {
    await runTransaction(db, async tx => {
      const snap = await tx.get(ref);
      if (!snap.exists()) return;
      const options = snap.data().options;
      options[optionIndex].votes = (options[optionIndex].votes || 0) + 1;
      tx.update(ref, { options });
    });
    document.getElementById("livePoll").innerHTML = `<p class="empty-state">Vote recorded.</p>`;
  } catch {
    alert("Could not record your vote — please try again.");
  }
}

// ══════════════════════════════════════════════════════════════
// LIVE Q&A — Student side
// ──────────────────────────────────────────────────────────────
// Path: /sessions/{sessionId}/qa  (sub-collection)
// Student submits questions; sees all questions + teacher replies
// in real time. Own questions are highlighted differently.
// ══════════════════════════════════════════════════════════════
let qaStudentUnsubscribe = null;

document.getElementById("qaForm").addEventListener("submit", async e => {
  e.preventDefault();
  if (!currentSessionId) return;
  const text = document.getElementById("qaText").value.trim();
  if (!text) return;
  const btn = e.target.querySelector("button[type='submit']");
  if (btn) { btn.disabled = true; btn.textContent = "Sending…"; }
  try {
    await addDoc(collection(db, "sessions", currentSessionId, "qa"), {
      studentId:    auth.currentUser.uid,
      studentName:  me.name,
      questionText: text,
      answerText:   "",
      timestamp:    serverTimestamp(),
      answeredAt:   null,
    });
    e.target.reset();
  } catch (err) {
    console.error("QA submit failed:", err);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = "Send"; }
  }
});

function listenStudentQA(sessionId) {
  if (qaStudentUnsubscribe) { qaStudentUnsubscribe(); qaStudentUnsubscribe = null; }

  qaStudentUnsubscribe = onSnapshot(
    collection(db, "sessions", sessionId, "qa"),
    snap => {
    const feed = document.getElementById("qaFeed");
    if (!feed) return;

    if (snap.empty) {
      feed.innerHTML = `<p class="empty-state"
        style="padding:10px 0; font-size:.82rem;">
        No questions yet. Be the first to ask.</p>`;
      return;
    }

    const uid = auth.currentUser?.uid;
    // Sort oldest-first client-side
    const items = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (a.timestamp?.seconds || 0) - (b.timestamp?.seconds || 0));

    feed.innerHTML = items.map(data => {
      const isOwn   = data.studentId === uid;
      const initials = isOwn ? "You"
        : (data.studentName || "S").slice(0, 2).toUpperCase();
      const timeStr  = data.timestamp?.toDate
        ? data.timestamp.toDate().toLocaleTimeString("en-US",
            { hour: "2-digit", minute: "2-digit" })
        : "";

      return `
        <div class="qa-item${data.answerText ? " qa-answered" : ""}">
          <div class="qa-question">
            <div class="qa-av${isOwn ? " qa-av-own" : ""}">${esc(initials)}</div>
            <div class="qa-body">
              <div class="qa-meta">
                <strong>${isOwn ? "You" : esc(data.studentName || "Student")}</strong>
                <span class="qa-time">${timeStr}</span>
                ${data.answerText
                  ? `<span class="badge approved"
                      style="font-size:.68rem;padding:1px 7px;">Answered</span>`
                  : ""}
              </div>
              <div class="qa-text">${esc(data.questionText)}</div>
            </div>
          </div>
          ${data.answerText ? `
            <div class="qa-reply">
              <div class="qa-reply-label">Teacher reply</div>
              <div class="qa-reply-text">${esc(data.answerText)}</div>
            </div>` : ""}
        </div>`;
    }).join("");

    feed.scrollTop = feed.scrollHeight;
  });
}

// ══════════════════════════════════════════════════════════════
// MY COURSES
// Also feeds myEnrolledCourseIds so the live session alert
// listener always reflects the student's current enrolment.
// ══════════════════════════════════════════════════════════════
function listenMyCourses() {
  onSnapshot(
    query(collection(db, "courses"), where("studentIds", "array-contains", auth.currentUser.uid)),
    snap => {
      const courses = snap.docs.map(d => ({ id: d.id, ...d.data() }));

      // Keep enrolled IDs in sync — must happen BEFORE early return
      myEnrolledCourseIds = courses.map(c => c.id);
      setupLiveSessionAlert();   // refresh alert listener with updated courses

      const tbody = document.querySelector("#coursesTable tbody");
      if (!courses.length) {
        tbody.innerHTML = `<tr><td colspan="4" class="empty-state">You are not enrolled in any courses yet.</td></tr>`;
        return;
      }
      tbody.innerHTML = courses.map(c => `
        <tr>
          <td>${esc(c.name)}</td>
          <td class="mono">${esc(c.code)}</td>
          <td>${esc(c.department)}</td>
          <td>${esc(c.teacherName || "—")}</td>
        </tr>`).join("");
    }
  );
}

// ══════════════════════════════════════════════════════════════
// LIVE SESSION ALERT
// ──────────────────────────────────────────────────────────────
// Sets up a realtime onSnapshot on /sessions filtered by the
// student's enrolled courses. When a teacher starts a live
// session for any enrolled course, a notification card appears
// automatically at the top of the Join Session panel.
// Clicking "Join Session Now" pre-fills the code and submits
// the existing join form — no new code path, no flow change.
// ══════════════════════════════════════════════════════════════
function setupLiveSessionAlert() {
  // Tear down previous listener before creating a new one
  if (liveAlertUnsubscribe) { liveAlertUnsubscribe(); liveAlertUnsubscribe = null; }

  const container = document.getElementById("liveSessionAlert");

  if (!myEnrolledCourseIds.length) {
    if (container) container.innerHTML = "";
    return;
  }

  // Single "in" query for courseId — status checked client-side
  // (Firestore does not allow two simultaneous "in" operators)
  liveAlertUnsubscribe = onSnapshot(
    query(
      collection(db, "sessions"),
      where("courseId", "in", myEnrolledCourseIds.slice(0, 10))
    ),
    snap => {
      const liveSessions = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(s => s.status === "live" || s.status === "active");
      renderLiveSessionAlerts(liveSessions);
    },
    err => { console.warn("Live alert listener:", err.message); }
  );
}

function renderLiveSessionAlerts(sessions) {
  const container = document.getElementById("liveSessionAlert");
  if (!container) return;

  if (!sessions.length) {
    container.innerHTML = "";
    return;
  }

  // Show the alert card — informational only, no button
  container.innerHTML = sessions.map(s => `
    <div class="live-alert-card">
      <div class="live-alert-indicator">
        <span class="live-alert-dot"></span>
        <span class="live-alert-label">Live Now</span>
      </div>
      <div class="live-alert-body">
        <div class="live-alert-course">${esc(s.courseName || "Class")}</div>
        <div class="live-alert-meta">
          ${esc(s.teacherName || "Your teacher")} has started a live session
          <span class="live-alert-code">${esc(s.code)}</span>
        </div>
      </div>
    </div>`).join("");

  // Auto-fill the join code with the most recent live session
  // so the student only needs to click the existing Join button
  const latest = sessions[0];
  const input  = document.getElementById("joinCode");
  if (input && !input.value) {
    input.value = latest.roomCode || latest.code;
  }
}

// ══════════════════════════════════════════════════════════════
// ANALYTICS — enhanced
// ══════════════════════════════════════════════════════════════
let chartScores;

async function loadAnalytics() {
  const uid = auth.currentUser?.uid;
  if (!uid) return;

  try {
    // ── 1. Fetch data — NO orderBy on quizAnswers to avoid composite
    //       index requirement. Sort client-side after fetching.
    const [attSnap, coursesSnap, ansSnap] = await Promise.all([
      getDocs(query(collection(db, "attendance"),  where("studentId", "==", uid))),
      getDocs(query(collection(db, "courses"),     where("studentIds", "array-contains", uid))),
      getDocs(query(collection(db, "quizAnswers"), where("studentId", "==", uid), limit(50))),
    ]);

    const sessionsJoined = attSnap.size;
    const courses        = coursesSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    // Sort descending by createdAt client-side (no index needed)
    const answers = ansSnap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));

    // ── KPIs ───────────────────────────────────────────────────
    document.getElementById("kpiSessionsJoined").textContent  = sessionsJoined || "0";
    document.getElementById("kpiQuizTaken").textContent       = answers.length  || "0";
    document.getElementById("kpiCoursesEnrolled").textContent = courses.length  || "0";

    // Performance snapshot
    document.getElementById("perfQuizzes").textContent  = answers.length;
    document.getElementById("perfSessions").textContent = sessionsJoined;

    // ── 2. Course-level attendance breakdown ──────────────────
    let totalSessions = 0;
    const courseRows  = [];

    for (const c of courses) {
      const sessSnap      = await getDocs(query(collection(db, "sessions"), where("courseId", "==", c.id)));
      const attForCourse  = attSnap.docs.filter(d => d.data().courseId === c.id).length;
      const total         = sessSnap.size;
      totalSessions      += total;
      const pct           = total > 0 ? Math.min(100, Math.round((attForCourse / total) * 100)) : 0;
      courseRows.push({ name: c.name, code: c.code, pct, attended: attForCourse, total });
    }

    const overallRate = totalSessions > 0
      ? Math.min(100, Math.round((sessionsJoined / totalSessions) * 100))
      : 0;
    document.getElementById("kpiAttendance").textContent  = totalSessions > 0 ? `${overallRate}%` : "0%";

    const completion = totalSessions > 0
      ? `${Math.round((sessionsJoined / totalSessions) * 100)}%`
      : "0%";
    document.getElementById("perfCompletion").textContent = completion;

    // Render course attendance bars
    const listEl = document.getElementById("courseAttendanceList");
    if (courseRows.length) {
      listEl.innerHTML = courseRows.map(r => {
        const fillClass = r.pct >= 75 ? "high" : r.pct >= 50 ? "medium" : "low";
        return `<div class="an-course-row">
          <span class="an-course-name">${esc(r.name)} <span class="mono" style="font-size:.72rem;color:var(--ink-soft);">${esc(r.code)}</span></span>
          <div class="an-prog-track"><div class="an-prog-fill ${fillClass}" style="width:${r.pct}%"></div></div>
          <span class="an-course-pct">${r.pct}%</span>
        </div>`;
      }).join("");
    } else {
      listEl.innerHTML = `<p class="empty-state">No course attendance data yet.</p>`;
    }

    // ── 3. Quiz activity line chart ────────────────────────────
    const ctx = document.getElementById("chartScores");
    if (ctx) {
      chartScores?.destroy();
      const labels = answers.map((_, i) => `Q${i + 1}`).reverse();
      const data   = answers.map((_, i) => i + 1).reverse();
      chartScores = new Chart(ctx, {
        type: "line",
        data: {
          labels,
          datasets: [{
            label:                "Cumulative answers",
            data,
            borderColor:          "#13509C",
            backgroundColor:      "rgba(46,134,222,.12)",
            fill:                 true,
            tension:              .35,
            pointRadius:          4,
            pointBackgroundColor: "#FFC600",
            pointBorderColor:     "#fff",
            pointBorderWidth:     2,
          }]
        },
        options: {
          responsive:          true,
          maintainAspectRatio: true,
          aspectRatio:         3,
          plugins: { legend: { display: false } },
          scales: {
            y: {
              beginAtZero: true,
              ticks:  { precision: 0, stepSize: 1 },
              grid:   { color: "rgba(0,0,0,.06)" },
            },
            x: { grid: { display: false } }
          }
        }
      });
    }

    // ── 4. Quiz submission log table ───────────────────────────
    const tbody = document.getElementById("quizLogBody");
    if (answers.length) {
      tbody.innerHTML = answers.slice(0, 20).map((a, i) => {
        const typeLabel  = a.answerIndex !== null ? "MCQ" : "Short";
        const dateFmt    = a.createdAt?.seconds
          ? new Date(a.createdAt.seconds * 1000).toLocaleDateString()
          : "—";
        const ansDisplay = a.answer
          ? (a.answer.length > 40 ? a.answer.slice(0, 40) + "…" : a.answer)
          : "—";
        return `<tr>
          <td>${i + 1}</td>
          <td class="mono" style="font-size:.78rem;">${esc(a.sessionId?.slice(0, 8) || "—")}</td>
          <td style="max-width:200px;">${esc(ansDisplay)}</td>
          <td><span class="badge ${typeLabel === "MCQ" ? "active" : "pending"}" style="font-size:.68rem;">${typeLabel}</span></td>
          <td style="font-size:.8rem;">${dateFmt}</td>
        </tr>`;
      }).join("");
    } else {
      tbody.innerHTML = `<tr><td colspan="5" class="empty-state">No quiz submissions yet.</td></tr>`;
    }

  } catch (err) {
    // Surface the error visibly so it's never silently swallowed
    console.error("loadAnalytics error:", err);
    const listEl = document.getElementById("courseAttendanceList");
    if (listEl) listEl.innerHTML = `<p class="empty-state" style="color:var(--red);">Error loading analytics: ${err.message}</p>`;
  }
}

// ══════════════════════════════════════════════════════════════
// Helpers
// ══════════════════════════════════════════════════════════════
function esc(str) {
  return String(str ?? "").replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
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
      document.getElementById("profileAvLg").innerHTML =
        `<img src="${profPicDataUrl}" alt="Profile">`;
    };
    img.src = evt.target.result;
  };
  reader.readAsDataURL(file);
  e.target.value = "";
});

// ── Profile password fields — show/hide toggle ──────────────
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
function setTopbarAvatar(picUrl, name, defaultInitial) {
  const av = document.getElementById("userAv");
  if (picUrl) {
    av.style.overflow = "hidden";
    av.style.padding  = "0";
    av.innerHTML = `<img src="${picUrl.replace(/"/g, "")}" alt="Profile"
      style="width:100%;height:100%;object-fit:cover;display:block;">`;
  } else {
    av.innerHTML      = "";
    av.style.overflow = "";
    av.textContent    = (name || defaultInitial).slice(0, 1).toUpperCase();
  }
}

function loadProfileForm() {
  if (!me) return;

  document.getElementById("profileName").value    = me.name       || "";
  document.getElementById("profileContact").value = me.contact    || "";
  document.getElementById("profileDept").value    = me.department || "";

  document.getElementById("profileDisplayName").textContent  = me.name  || "Student";
  document.getElementById("profileDisplayEmail").textContent = me.email || "";
  document.getElementById("profEmailRowVal").textContent     = me.email || "";

  const av = document.getElementById("profileAvLg");
  if (me.profilePicUrl) {
    av.innerHTML = `<img src="${esc(me.profilePicUrl)}" alt="${esc(me.name || 'S')}">`;
  } else {
    av.textContent = (me.name || "S").slice(0, 1).toUpperCase();
  }
  setTopbarAvatar(me.profilePicUrl, me.name, "S");
  profPicDataUrl = null;
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
    // Strict whitelist — role, approval_status, year, email NEVER included
    const payload = { name };
    const dept    = document.getElementById("profileDept").value.trim();
    const contact = document.getElementById("profileContact").value.trim();
    if (dept)           payload.department    = dept;
    if (contact)        payload.contact       = contact;
    if (profPicDataUrl) payload.profilePicUrl = profPicDataUrl;

    await updateDoc(doc(db, "users", auth.currentUser.uid), payload);

    me.name       = name;
    me.department = dept;
    me.contact    = contact;
    if (profPicDataUrl) me.profilePicUrl = profPicDataUrl;

    document.getElementById("userName").textContent = name;
    setTopbarAvatar(me.profilePicUrl, name, "S");

    // ── Password change (optional) ────────────────────────
    let passwordChanged = false;
    if (newPwd) {
      const credential = EmailAuthProvider.credential(
        auth.currentUser.email, currentPwd
      );
      await reauthenticateWithCredential(auth.currentUser, credential);
      await updatePassword(auth.currentUser, newPwd);
      document.getElementById("profileCurrentPwd").value = "";
      document.getElementById("profileNewPwd").value     = "";
      passwordChanged = true;
    }
    // ────────────────────────────────────────────────────────

    loadProfileForm();

    msg.className   = "form-msg show success";
    msg.textContent = passwordChanged
      ? "Profile and password updated successfully."
      : "Profile updated successfully.";

  } catch (err) {
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
// STUDENT SCHEDULE — auto-pulled from /schedules
// ──────────────────────────────────────────────────────────────
// Queries the /schedules collection for courses the student is
// enrolled in (array-contains on studentIds). Sets up a realtime
// listener so schedule changes made by the teacher appear
// immediately without requiring a page refresh.
// ══════════════════════════════════════════════════════════════
const STU_DAYS = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
let scheduleUnsubscribe = null;

async function loadStudentSchedule() {
  const uid       = auth.currentUser?.uid;
  const container = document.getElementById("studentWeeklyCalendar");
  if (!uid || !container) return;

  container.innerHTML = `<p class="empty-state">Loading your schedule...</p>`;

  // Tear down previous listener if schedule tab was visited before
  if (scheduleUnsubscribe) { scheduleUnsubscribe(); scheduleUnsubscribe = null; }

  // Get enrolled courses first
  try {
    const coursesSnap = await getDocs(query(
      collection(db, "courses"),
      where("studentIds", "array-contains", uid)
    ));
    const enrolledIds = coursesSnap.docs.map(d => d.id);

    if (!enrolledIds.length) {
      container.innerHTML = `<p class="empty-state">You are not enrolled in any courses yet.</p>`;
      return;
    }

    // Listen to schedules for enrolled courses (Firestore "in" supports up to 10)
    const q = query(
      collection(db, "schedules"),
      where("courseId", "in", enrolledIds.slice(0, 10))
    );
    scheduleUnsubscribe = onSnapshot(q, snap => {
      const schedules = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      renderStudentCalendar(schedules);
    }, err => {
      console.error("Schedule listener error:", err);
      container.innerHTML = `<p class="empty-state">Could not load schedule: ${err.message}</p>`;
    });

  } catch (err) {
    console.error("loadStudentSchedule error:", err);
    container.innerHTML = `<p class="empty-state">Could not load schedule: ${err.message}</p>`;
  }
}

function renderStudentCalendar(schedules) {
  const container = document.getElementById("studentWeeklyCalendar");
  if (!container) return;

  if (!schedules.length) {
    container.innerHTML = `<p class="empty-state">No timetable entries found for your enrolled courses. Your teacher has not added any schedule slots yet.</p>`;
    return;
  }

  const todayName = STU_DAYS[new Date().getDay() - 1] || "";
  const byDay = {};
  STU_DAYS.forEach(d => byDay[d] = []);
  schedules.forEach(s => { if (byDay[s.dayOfWeek]) byDay[s.dayOfWeek].push(s); });
  STU_DAYS.forEach(d => byDay[d].sort((a, b) => a.startTime.localeCompare(b.startTime)));

  container.innerHTML = `<div class="week-grid">` +
    STU_DAYS.map(day => `
      <div class="week-day-col">
        <div class="week-day-header${day === todayName ? " today" : ""}">${day.slice(0, 3)}</div>
        ${byDay[day].length
          ? byDay[day].map(s => `
              <div class="week-slot">
                <span class="week-slot-course">${esc(s.courseName)}</span>
                <span class="week-slot-teacher">${esc(s.teacherName || "")}</span>
                <span class="week-slot-time">${s.startTime} – ${s.endTime}</span>
              </div>`).join("")
          : `<div class="week-empty">—</div>`}
      </div>`).join("") +
    `</div>`;
}