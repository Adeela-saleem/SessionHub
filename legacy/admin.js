// ============================================================
// SessionHub — Admin Dashboard
// ============================================================
// Changes from previous version:
//   • getDocs imported for point-in-time analytics queries
//   • requireRole callback now also calls loadAnalyticsExtended()
//     and listenAuditLog()
//   • renderAnalytics() kept intact + extended to fill analytics
//     panel KPI cards (anKpiStudents, anKpiTeachers, etc.)
//   • Added loadAnalyticsExtended() — async function that
//     aggregates department table, teacher activity table,
//     using getDocs across sessions, quizzes, paperFormats
//   • Added listenAuditLog() — realtime onSnapshot combining
//     quizzes + paperFormats into a single activity feed
//   • All existing functions are byte-for-byte identical
// ============================================================

import { requireRole, auth, db } from "./auth.js";

import {
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

import {
  collection, query, where, onSnapshot, getDocs,
  doc, addDoc, updateDoc, deleteDoc,
  serverTimestamp, orderBy, limit
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

import { Chart, registerables } from "https://cdn.jsdelivr.net/npm/chart.js@4.4.4/+esm";
Chart.register(...registerables);

// ══════════════════════════════════════════════════════════
// Tab navigation — unchanged
// ══════════════════════════════════════════════════════════
const tabs   = document.querySelectorAll(".dash-nav button[data-tab]");
const panels = document.querySelectorAll(".tab-panel");
const titleMap = {
  overview: "Overview", teachers: "Teachers", students: "Students",
  courses: "Courses",   monitor:  "Sessions & Quizzes", analytics: "Analytics"
};

tabs.forEach(btn => {
  btn.addEventListener("click", () => {
    tabs.forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    const tab = btn.getAttribute("data-tab");
    panels.forEach(p => p.classList.toggle("active", p.id === `panel-${tab}`));
    document.getElementById("pageTitle").textContent = titleMap[tab];
    if (tab === "analytics") { renderAnalytics(); loadAnalyticsExtended(); }
  });
});

document.getElementById("logoutBtn").addEventListener("click", async () => {
  await signOut(auth);
  window.location.href = "index.html";
});

// ══════════════════════════════════════════════════════════
// requireRole guard — extended to boot analytics
// ══════════════════════════════════════════════════════════
requireRole("admin", (profile) => {
  document.getElementById("userName").textContent = profile.name || "Admin";
  document.getElementById("userAv").textContent   = (profile.name || "A").slice(0, 1).toUpperCase();
  listenUsers();
  listenCourses();
  listenSessions();
  listenQuizzes();
  listenPaperFormats();
  listenAuditLog();          // NEW: realtime audit feed
  loadAnalyticsExtended();   // NEW: dept table + teacher activity
});

let allUsers        = [];
let approvedTeachers = [];
let allCourses      = [];   // populated by listenCourses snapshot
let allSessions     = [];   // populated by listenSessions snapshot

// ══════════════════════════════════════════════════════════
// Users realtime listener — unchanged
// ══════════════════════════════════════════════════════════
function listenUsers() {
  onSnapshot(query(collection(db, "users")), snap => {
    allUsers = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderTeachers();
    renderStudents();
    renderOverviewKpis();
    renderPendingPreview();
    populateCourseTeacherSelect();
    renderAnalytics();         // updates charts + analytics panel KPIs
  });
}

// ══════════════════════════════════════════════════════════
// addUserRecord — unchanged
// ══════════════════════════════════════════════════════════
async function addUserRecord({ name, email, role, department, year }) {
  await addDoc(collection(db, "users"), {
    name, email, role, department,
    year:            role === "student" ? year : null,
    approval_status: "approved",
    createdAt:       serverTimestamp()
  });
}

// ══════════════════════════════════════════════════════════
// deleteUserDoc / deleteCourse — unchanged
// ══════════════════════════════════════════════════════════
async function deleteUserDoc(id) { await deleteDoc(doc(db, "users", id)); }
async function deleteCourse(courseId) { await deleteDoc(doc(db, "courses", courseId)); }

// ══════════════════════════════════════════════════════════
// Form message helpers — unchanged
// ══════════════════════════════════════════════════════════
function setMsg(elId, text, type = "error") {
  const el = document.getElementById(elId);
  if (!el) return;
  el.textContent = text;
  el.className   = `form-msg show ${type}`;
}
function clearMsg(elId) {
  const el = document.getElementById(elId);
  if (!el) return;
  el.className = "form-msg"; el.textContent = "";
}

// ══════════════════════════════════════════════════════════
// Add Teacher form — unchanged
// ══════════════════════════════════════════════════════════
document.getElementById("addTeacherForm").addEventListener("submit", async e => {
  e.preventDefault();
  clearMsg("addTeacherMsg");
  const name       = document.getElementById("newTeacherName").value.trim();
  const email      = document.getElementById("newTeacherEmail").value.trim();
  const department = document.getElementById("newTeacherDept").value.trim();
  const btn        = document.getElementById("addTeacherBtn");
  btn.disabled = true; btn.textContent = "Saving…";
  try {
    await addUserRecord({ name, email, role: "teacher", department });
    setMsg("addTeacherMsg", `Teacher record added for ${name}.`, "success");
    e.target.reset();
  } catch (err) {
    setMsg("addTeacherMsg", "Failed to save record: " + err.message, "error");
  } finally {
    btn.disabled = false; btn.textContent = "Add teacher record";
  }
});

// ══════════════════════════════════════════════════════════
// Add Student form — unchanged
// ══════════════════════════════════════════════════════════
document.getElementById("addStudentForm").addEventListener("submit", async e => {
  e.preventDefault();
  clearMsg("addStudentMsg");
  const name       = document.getElementById("newStudentName").value.trim();
  const email      = document.getElementById("newStudentEmail").value.trim();
  const department = document.getElementById("newStudentDept").value.trim();
  const year       = document.getElementById("newStudentYear").value;
  const btn        = document.getElementById("addStudentBtn");
  btn.disabled = true; btn.textContent = "Saving…";
  try {
    await addUserRecord({ name, email, role: "student", department, year });
    setMsg("addStudentMsg", `Student record added for ${name}.`, "success");
    e.target.reset();
  } catch (err) {
    setMsg("addStudentMsg", "Failed to save record: " + err.message, "error");
  } finally {
    btn.disabled = false; btn.textContent = "Add student record";
  }
});

// ══════════════════════════════════════════════════════════
// renderTeachers — unchanged
// ══════════════════════════════════════════════════════════
function renderTeachers() {
  const teachers = allUsers.filter(u => u.role === "teacher");
  approvedTeachers = teachers.filter(t => t.approval_status === "approved");
  const tbody = document.querySelector("#teachersTable tbody");
  if (!teachers.length) {
    tbody.innerHTML = `<tr><td colspan="5" class="empty-state">No teacher records yet — add one above.</td></tr>`;
    return;
  }
  tbody.innerHTML = teachers.map(t => `
    <tr>
      <td>${esc(t.name)}</td>
      <td>${esc(t.email)}</td>
      <td>${esc(t.department || "—")}</td>
      <td><span class="badge ${t.approval_status === "approved" ? "approved" : "pending"}">${t.approval_status}</span></td>
      <td>
        <div class="tag-row">
          ${t.approval_status !== "approved"
            ? `<button class="btn btn-sm btn-primary"  data-approve="${t.id}">Approve</button>`
            : `<button class="btn btn-sm btn-danger"   data-revoke="${t.id}">Revoke</button>`}
          <button class="btn btn-sm btn-danger" data-delete-user="${t.id}" data-delete-name="${esc(t.name)}">Delete</button>
        </div>
      </td>
    </tr>`).join("");

  tbody.querySelectorAll("[data-approve]").forEach(btn =>
    btn.addEventListener("click", () => setApproval(btn.getAttribute("data-approve"), "approved")));
  tbody.querySelectorAll("[data-revoke]").forEach(btn =>
    btn.addEventListener("click", () => setApproval(btn.getAttribute("data-revoke"), "pending")));
  tbody.querySelectorAll("[data-delete-user]").forEach(btn =>
    btn.addEventListener("click", () => confirmDeleteUser(
      btn.getAttribute("data-delete-user"), btn.getAttribute("data-delete-name"), btn)));
}

async function setApproval(id, status) {
  await updateDoc(doc(db, "users", id), { approval_status: status });
}

async function confirmDeleteUser(id, name, btn) {
  if (!confirm(`Delete record for "${name}"?\n\nThis removes their entry from the database.`)) return;
  btn.disabled = true; btn.textContent = "Deleting…";
  try {
    await deleteUserDoc(id);
  } catch (err) {
    alert("Delete failed: " + err.message);
    btn.disabled = false; btn.textContent = "Delete";
  }
}

// ══════════════════════════════════════════════════════════
// renderPendingPreview — unchanged
// ══════════════════════════════════════════════════════════
function renderPendingPreview() {
  const pending = allUsers.filter(u => u.role === "teacher" && u.approval_status !== "approved");
  const tbody   = document.querySelector("#pendingPreviewTable tbody");
  if (!pending.length) {
    tbody.innerHTML = `<tr><td colspan="4" class="empty-state">No pending approvals.</td></tr>`;
    return;
  }
  tbody.innerHTML = pending.map(t => `
    <tr>
      <td>${esc(t.name)}</td>
      <td>${esc(t.department || "—")}</td>
      <td>—</td>
      <td><button class="btn btn-sm btn-primary" data-approve2="${t.id}">Approve</button></td>
    </tr>`).join("");
  tbody.querySelectorAll("[data-approve2]").forEach(btn =>
    btn.addEventListener("click", () => setApproval(btn.getAttribute("data-approve2"), "approved")));
}

// ══════════════════════════════════════════════════════════
// renderStudents — unchanged
// ══════════════════════════════════════════════════════════
function renderStudents() {
  const deptFilter = document.getElementById("filterDept").value;
  const yearFilter = document.getElementById("filterYear").value;
  let students = allUsers.filter(u => u.role === "student");

  const deptSelect = document.getElementById("filterDept");
  const existing   = new Set([...deptSelect.options].map(o => o.value));
  [...new Set(students.map(s => s.department).filter(Boolean))].forEach(d => {
    if (!existing.has(d))
      deptSelect.insertAdjacentHTML("beforeend", `<option value="${esc(d)}">${esc(d)}</option>`);
  });

  if (deptFilter) students = students.filter(s => s.department === deptFilter);
  if (yearFilter) students = students.filter(s => s.year === yearFilter);

  const tbody = document.querySelector("#studentsTable tbody");
  if (!students.length) {
    tbody.innerHTML = `<tr><td colspan="5" class="empty-state">No students match these filters.</td></tr>`;
    return;
  }
  tbody.innerHTML = students.map(s => `
    <tr>
      <td>${esc(s.name)}</td>
      <td>${esc(s.email)}</td>
      <td>${esc(s.department || "—")}</td>
      <td>${esc(s.year       || "—")}</td>
      <td>
        <button class="btn btn-sm btn-danger"
                data-delete-user="${s.id}"
                data-delete-name="${esc(s.name)}">Delete</button>
      </td>
    </tr>`).join("");

  tbody.querySelectorAll("[data-delete-user]").forEach(btn =>
    btn.addEventListener("click", () => confirmDeleteUser(
      btn.getAttribute("data-delete-user"), btn.getAttribute("data-delete-name"), btn)));
}

document.getElementById("filterDept").addEventListener("change", renderStudents);
document.getElementById("filterYear").addEventListener("change", renderStudents);

// ══════════════════════════════════════════════════════════
// renderOverviewKpis — unchanged
// ══════════════════════════════════════════════════════════
function renderOverviewKpis() {
  document.getElementById("kpiTeachers").textContent =
    allUsers.filter(u => u.role === "teacher" && u.approval_status === "approved").length;
  document.getElementById("kpiStudents").textContent =
    allUsers.filter(u => u.role === "student").length;
}

// ══════════════════════════════════════════════════════════
// Courses — unchanged
// ══════════════════════════════════════════════════════════
function populateCourseTeacherSelect() {
  const sel     = document.getElementById("courseTeacher");
  const current = sel.value;
  sel.innerHTML = `<option value="">Select an approved teacher…</option>` +
    approvedTeachers
      .map(t => `<option value="${t.id}|${esc(t.name)}">${esc(t.name)} — ${esc(t.department || "")}</option>`)
      .join("");
  sel.value = current;
}

document.getElementById("courseForm").addEventListener("submit", async e => {
  e.preventDefault();
  clearMsg("courseMsg");
  const name       = document.getElementById("courseName").value.trim();
  const code       = document.getElementById("courseCode").value.trim();
  const department = document.getElementById("courseDept").value.trim();
  const [teacherId, teacherName] = document.getElementById("courseTeacher").value.split("|");
  if (!teacherId) return setMsg("courseMsg", "Please select a teacher.", "error");
  try {
    await addDoc(collection(db, "courses"), {
      name, code, department, teacherId, teacherName,
      studentIds: [], createdAt: serverTimestamp()
    });
    setMsg("courseMsg", `Course "${name}" assigned successfully.`, "success");
    e.target.reset();
  } catch (err) {
    setMsg("courseMsg", "Failed to save course: " + err.message, "error");
  }
});

function listenCourses() {
  onSnapshot(collection(db, "courses"), snap => {
    allCourses = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    document.getElementById("kpiCourses").textContent = allCourses.length;

    const tbody = document.querySelector("#coursesTable tbody");
    if (!allCourses.length) {
      tbody.innerHTML = `<tr><td colspan="5" class="empty-state">No courses assigned yet.</td></tr>`;
      return;
    }
    tbody.innerHTML = allCourses.map(c => `
      <tr>
        <td>${esc(c.name)}</td>
        <td class="mono">${esc(c.code)}</td>
        <td>${esc(c.department  || "—")}</td>
        <td>${esc(c.teacherName || "—")}</td>
        <td>
          <button class="btn btn-sm btn-danger"
                  data-delete-course="${c.id}"
                  data-delete-name="${esc(c.name)}">Delete</button>
        </td>
      </tr>`).join("");

    tbody.querySelectorAll("[data-delete-course]").forEach(btn =>
      btn.addEventListener("click", async () => {
        const id   = btn.getAttribute("data-delete-course");
        const name = btn.getAttribute("data-delete-name");
        if (!confirm(`Delete course "${name}"? This cannot be undone.`)) return;
        btn.disabled = true; btn.textContent = "Deleting…";
        try { await deleteCourse(id); }
        catch (err) {
          alert("Delete failed: " + err.message);
          btn.disabled = false; btn.textContent = "Delete";
        }
      }));
  });
}

// ══════════════════════════════════════════════════════════
// Sessions / Quizzes monitoring — unchanged
// ══════════════════════════════════════════════════════════
function listenSessions() {
  onSnapshot(collection(db, "sessions"), snap => {
    allSessions = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    document.getElementById("kpiSessions").textContent =
      allSessions.filter(s => s.status === "active").length;

    const tbody = document.querySelector("#sessionsTable tbody");
    if (!allSessions.length) {
      tbody.innerHTML = `<tr><td colspan="5" class="empty-state">No sessions created yet.</td></tr>`;
      return;
    }
    tbody.innerHTML = allSessions
      .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))
      .map(s => `
        <tr>
          <td class="mono">${esc(s.code)}</td>
          <td>${esc(s.courseName  || "—")}</td>
          <td>${esc(s.teacherName || "—")}</td>
          <td><span class="badge ${s.status === "active" ? "active" : "closed"}">${s.status}</span></td>
          <td>${fmtDate(s.createdAt)}</td>
        </tr>`).join("");
  });
}

function listenQuizzes() {
  const q = query(collection(db, "quizzes"), orderBy("createdAt", "desc"), limit(20));
  onSnapshot(q, snap => {
    const quizzes = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    const tbody   = document.querySelector("#quizzesTable tbody");
    if (!quizzes.length) {
      tbody.innerHTML = `<tr><td colspan="3" class="empty-state">No quizzes broadcast yet.</td></tr>`;
      return;
    }
    tbody.innerHTML = quizzes.map(qz => `
      <tr>
        <td>${esc(qz.question)}</td>
        <td class="mono">${esc(qz.sessionCode || "—")}</td>
        <td>${fmtDate(qz.createdAt)}</td>
      </tr>`).join("");
  }, () => {
    document.querySelector("#quizzesTable tbody").innerHTML =
      `<tr><td colspan="3" class="empty-state">No quizzes yet.</td></tr>`;
  });
}

function listenPaperFormats() {
  const q = query(collection(db, "paperFormats"), orderBy("createdAt", "desc"), limit(20));
  onSnapshot(q, snap => {
    const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    const tbody = document.querySelector("#paperFormatsTable tbody");
    if (!items.length) {
      tbody.innerHTML = `<tr><td colspan="3" class="empty-state">No paper formatting requests yet.</td></tr>`;
      return;
    }
    tbody.innerHTML = items.map(i => `
      <tr>
        <td>${esc(i.title)}</td>
        <td>${esc(i.teacherName || "—")}</td>
        <td>${fmtDate(i.createdAt)}</td>
      </tr>`).join("");
  }, () => {
    document.querySelector("#paperFormatsTable tbody").innerHTML =
      `<tr><td colspan="3" class="empty-state">No requests yet.</td></tr>`;
  });
}

// ══════════════════════════════════════════════════════════
// renderAnalytics — extended: keeps existing charts + fills
// the analytics panel KPI cards (anKpiStudents, etc.)
// ══════════════════════════════════════════════════════════
let chartRoles, chartDept;
function renderAnalytics() {
  const teachers = allUsers.filter(u => u.role === "teacher" && u.approval_status === "approved").length;
  const students = allUsers.filter(u => u.role === "student").length;
  const admins   = allUsers.filter(u => u.role === "admin").length;

  // ── Analytics panel KPI cards (new IDs, no conflict with overview) ──
  const anS = document.getElementById("anKpiStudents");
  const anT = document.getElementById("anKpiTeachers");
  const anC = document.getElementById("anKpiCourses");
  const anSess = document.getElementById("anKpiSessions");
  if (anS) anS.textContent = students;
  if (anT) anT.textContent = teachers;
  if (anC) anC.textContent = allCourses.length;
  if (anSess) anSess.textContent = allSessions.length;

  // ── Existing doughnut chart: users by role ──
  const rolesCtx = document.getElementById("chartRoles");
  if (rolesCtx) {
    chartRoles?.destroy();
    chartRoles = new Chart(rolesCtx, {
      type: "doughnut",
      data: {
        labels:   ["Teachers", "Students", "Admins"],
        datasets: [{
          data:            [teachers, students, admins],
          backgroundColor: ["#2E86DE", "#FFC600", "#0A2342"],
          borderWidth:     2,
          borderColor:     "#fff",
        }]
      },
      options: {
        responsive:          true,
        maintainAspectRatio: true,
        aspectRatio:         1.8,
        plugins: {
          legend: { position: "bottom", labels: { padding: 16, font: { size: 12 } } }
        },
      }
    });
  }

  // ── Existing bar chart: students by department ──
  const deptCounts = {};
  allUsers.filter(u => u.role === "student").forEach(s => {
    const d = s.department || "Unspecified";
    deptCounts[d] = (deptCounts[d] || 0) + 1;
  });
  const deptCtx = document.getElementById("chartDept");
  if (deptCtx) {
    chartDept?.destroy();
    chartDept = new Chart(deptCtx, {
      type: "bar",
      data: {
        labels:   Object.keys(deptCounts),
        datasets: [{
          label:           "Students",
          data:            Object.values(deptCounts),
          backgroundColor: "#13509C",
          borderRadius:    6,
          barThickness:    36,
        }]
      },
      options: {
        responsive:          true,
        maintainAspectRatio: true,
        aspectRatio:         2.5,
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
}

// ══════════════════════════════════════════════════════════
// loadAnalyticsExtended — async function called once on boot.
// Aggregates department performance table and teacher activity
// table using point-in-time getDocs queries.
// ══════════════════════════════════════════════════════════
async function loadAnalyticsExtended() {
  try {
    // Fetch all sessions, quizzes, paperFormats in parallel
    const [sessSnap, quizSnap, paperSnap] = await Promise.all([
      getDocs(collection(db, "sessions")),
      getDocs(collection(db, "quizzes")),
      getDocs(collection(db, "paperFormats"))
    ]);

    const sessions = sessSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const quizzes  = quizSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const papers   = paperSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    renderDeptTable(sessions);
    renderTeacherActivity(sessions, quizzes, papers);

  } catch (err) {
    console.error("Analytics extended load error:", err);
  }
}

// ── Department performance table ─────────────────────────
function renderDeptTable(sessions) {
  const tbody = document.getElementById("deptTableBody");
  if (!tbody) return;

  // Build department aggregates from user data
  const depts = {};
  allUsers.forEach(u => {
    const dept = u.department || "Unspecified";
    if (!depts[dept]) depts[dept] = { students: 0, teachers: 0, courses: 0 };
    if (u.role === "student") depts[dept].students++;
    if (u.role === "teacher" && u.approval_status === "approved") depts[dept].teachers++;
  });

  // Count courses per department
  allCourses.forEach(c => {
    const dept = c.department || "Unspecified";
    if (!depts[dept]) depts[dept] = { students: 0, teachers: 0, courses: 0 };
    depts[dept].courses++;
  });

  const rows = Object.entries(depts).sort((a, b) => b[1].students - a[1].students);
  const maxStudents = Math.max(...rows.map(([, d]) => d.students), 1);

  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="5" class="empty-state">No department data yet.</td></tr>`;
    return;
  }

  tbody.innerHTML = rows.map(([dept, d]) => {
    const pct = Math.round((d.students / maxStudents) * 100);
    return `<tr>
      <td><strong>${esc(dept)}</strong></td>
      <td>${d.students}</td>
      <td>${d.teachers}</td>
      <td>${d.courses}</td>
      <td>
        <div class="an-dept-prog">
          <div class="an-dept-bar"><div class="an-dept-fill" style="width:${pct}%"></div></div>
          <span class="an-dept-pct">${pct}%</span>
        </div>
      </td>
    </tr>`;
  }).join("");
}

// ── Teacher activity table ───────────────────────────────
function renderTeacherActivity(sessions, quizzes, papers) {
  const tbody = document.getElementById("teacherActivityBody");
  if (!tbody) return;

  const teachers = allUsers.filter(u => u.role === "teacher" && u.approval_status === "approved");

  if (!teachers.length) {
    tbody.innerHTML = `<tr><td colspan="6" class="empty-state">No approved teachers yet.</td></tr>`;
    return;
  }

  tbody.innerHTML = teachers.map(t => {
    const courseCount   = allCourses.filter(c => c.teacherId === t.id).length;
    const sessionCount  = sessions.filter(s => s.teacherId === t.id).length;
    const quizCount     = quizzes.filter(q => q.teacherId === t.id).length;
    const paperCount    = papers.filter(p => p.teacherId === t.id).length;

    // Activity tier badge
    const totalActivity = sessionCount + quizCount + paperCount;
    let tierBadge = `<span class="badge closed">Inactive</span>`;
    if (totalActivity >= 10) tierBadge = `<span class="badge approved">Active</span>`;
    else if (totalActivity >= 3) tierBadge = `<span class="badge active">Moderate</span>`;

    return `<tr>
      <td><strong>${esc(t.name)}</strong></td>
      <td>${esc(t.department || "—")}</td>
      <td>${courseCount}</td>
      <td>${sessionCount} ${tierBadge}</td>
      <td>${quizCount}</td>
      <td>${paperCount}</td>
    </tr>`;
  }).join("");
}

// ══════════════════════════════════════════════════════════
// listenAuditLog — realtime event feed combining quizzes,
// paperFormats, and sessions into a single activity log.
// Streams the 20 most recent events from each collection
// and merges them by timestamp for the audit log table.
// ══════════════════════════════════════════════════════════
function listenAuditLog() {
  const tbody = document.getElementById("auditLogBody");
  if (!tbody) return;

  let quizEvents    = [];
  let paperEvents   = [];
  let sessionEvents = [];

  function mergeAndRender() {
    const all = [...quizEvents, ...paperEvents, ...sessionEvents]
      .sort((a, b) => (b.ts || 0) - (a.ts || 0))
      .slice(0, 25);

    if (!all.length) {
      tbody.innerHTML = `<tr><td colspan="4" class="empty-state">No activity recorded yet.</td></tr>`;
      return;
    }

    tbody.innerHTML = all.map(ev => `
      <tr class="audit-row">
        <td class="audit-time">${ev.time}</td>
        <td><span class="badge ${ev.cls} tier-badge">${ev.type}</span></td>
        <td>${esc(ev.user)}</td>
        <td style="color:var(--ink-soft); font-size:.82rem;">${esc(ev.detail)}</td>
      </tr>`).join("");
  }

  // Quizzes broadcast
  onSnapshot(
    query(collection(db, "quizzes"), orderBy("createdAt", "desc"), limit(10)),
    snap => {
      quizEvents = snap.docs.map(d => {
        const data = d.data();
        return {
          ts:     data.createdAt?.seconds || 0,
          time:   fmtDate(data.createdAt),
          type:   "Quiz Broadcast",
          cls:    "ev-quiz",
          user:   data.teacherId?.slice(0, 8) + "…" || "—",
          detail: data.question ? data.question.slice(0, 60) + "…" : "Quiz question"
        };
      });
      mergeAndRender();
    }, () => {}
  );

  // Paper formats generated
  onSnapshot(
    query(collection(db, "paperFormats"), orderBy("createdAt", "desc"), limit(10)),
    snap => {
      paperEvents = snap.docs.map(d => {
        const data = d.data();
        return {
          ts:     data.createdAt?.seconds || 0,
          time:   fmtDate(data.createdAt),
          type:   "Paper Generated",
          cls:    "ev-paper",
          user:   esc(data.teacherName || "Teacher"),
          detail: esc(data.title || "Exam paper")
        };
      });
      mergeAndRender();
    }, () => {}
  );

  // Sessions created
  onSnapshot(
    query(collection(db, "sessions"), orderBy("createdAt", "desc"), limit(10)),
    snap => {
      sessionEvents = snap.docs.map(d => {
        const data = d.data();
        return {
          ts:     data.createdAt?.seconds || 0,
          time:   fmtDate(data.createdAt),
          type:   "Session Started",
          cls:    "ev-session",
          user:   esc(data.teacherName || "Teacher"),
          detail: `${esc(data.code || "—")} · ${esc(data.courseName || "—")}`
        };
      });
      mergeAndRender();
    }, () => {}
  );
}

// ══════════════════════════════════════════════════════════
// Helpers — unchanged
// ══════════════════════════════════════════════════════════
function esc(str) {
  return String(str ?? "").replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function fmtDate(ts) {
  if (!ts?.seconds) return "—";
  return new Date(ts.seconds * 1000).toLocaleString();
}