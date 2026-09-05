// ============================================================
// SessionHub — Authentication & Role-Based Routing
// ============================================================
// Changes from original:
//   1. Eye toggle buttons on both password fields
//      (loginPassword and signupPassword). Clicking toggles
//      type="password" ↔ type="text" and swaps the SVG icon.
//   2. Field-level inline error messages:
//      • Wrong password   → error appears below loginPassword
//      • Wrong email      → error appears below loginEmail
//      • Email taken      → error appears below signupEmail
//      • Weak/invalid pw  → error appears below signupPassword
//      • Other errors     → fall back to global #formMsg banner
// ============================================================

import { auth, db } from "./firebase-config.js";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  doc, setDoc, getDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// ── SVG icons for eye toggle ────────────────────────────────
const EYE_SVG = `
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
       stroke-linecap="round" stroke-linejoin="round">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
    <circle cx="12" cy="12" r="3"/>
  </svg>`;

const EYE_OFF_SVG = `
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
       stroke-linecap="round" stroke-linejoin="round">
    <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94
             M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19
             m-6.72-1.07a3 3 0 11-4.24-4.24"/>
    <line x1="1" y1="1" x2="23" y2="23"/>
  </svg>`;

// ── Full Name character restriction ─────────────────────────
// Only letters, numbers, and spaces are allowed. Special
// characters are stripped immediately as the user types and
// an inline error appears below the Full Name field.
const NAME_REGEX = /^[a-zA-Z0-9\s]*$/;

document.getElementById("signupName")?.addEventListener("input", e => {
  const input  = e.target;
  const errEl  = document.getElementById("signupName-error");
  const raw    = input.value;

  if (!NAME_REGEX.test(raw)) {
    // Strip invalid characters, preserve cursor position
    const pos   = input.selectionStart;
    const clean = raw.replace(/[^a-zA-Z0-9\s]/g, "");
    input.value = clean;
    const delta = raw.length - clean.length;
    input.setSelectionRange(Math.max(0, pos - delta), Math.max(0, pos - delta));

    if (errEl) {
      errEl.textContent = "Only letters, numbers, and spaces are allowed.";
      errEl.className   = "field-error show";
    }
  } else {
    if (errEl) { errEl.textContent = ""; errEl.className = "field-error"; }
  }
});

// ── Eye toggle setup ─────────────────────────────────────────
document.querySelectorAll(".pw-eye").forEach(btn => {
  btn.addEventListener("click", () => {
    const input = document.getElementById(btn.getAttribute("data-target"));
    if (!input) return;
    const showing = input.type === "text";
    input.type = showing ? "password" : "text";
    btn.setAttribute("aria-label", showing ? "Show password" : "Hide password");
    btn.innerHTML = showing ? EYE_SVG : EYE_OFF_SVG;
  });
});

// ── Global message banner ────────────────────────────────────
const overlay  = document.getElementById("authOverlay");
const closeBtn = document.getElementById("authClose");
const tabLogin = document.getElementById("tabLogin");
const tabSignup= document.getElementById("tabSignup");
const loginForm= document.getElementById("loginForm");
const signupForm=document.getElementById("signupForm");
const msgBox   = document.getElementById("formMsg");

function showMsg(text, type = "error") {
  msgBox.textContent = text;
  msgBox.className = `form-msg show ${type}`;
}
function clearMsg() {
  msgBox.className  = "form-msg";
  msgBox.textContent= "";
}

// ── Field-level inline error helpers ────────────────────────
function showFieldError(inputId, message) {
  const errorEl = document.getElementById(`${inputId}-error`);
  const inputEl = document.getElementById(inputId);
  if (errorEl) { errorEl.textContent = message; errorEl.className = "field-error show"; }
  if (inputEl) inputEl.classList.add("input-error");
}

function clearFieldErrors() {
  document.querySelectorAll(".field-error").forEach(el => {
    el.textContent = "";
    el.className   = "field-error";
  });
  document.querySelectorAll("input.input-error").forEach(el => {
    el.classList.remove("input-error");
  });
}

function clearAll() {
  clearMsg();
  clearFieldErrors();
}

// ── Modal open / close ───────────────────────────────────────
function openModal(which) {
  overlay.classList.add("open");
  clearAll();
  setTab(which === "signup" ? "signup" : "login");
}
function closeModal() {
  overlay.classList.remove("open");
  clearAll();
}
function setTab(which) {
  const isLogin = which === "login";
  tabLogin.classList.toggle("active",  isLogin);
  tabSignup.classList.toggle("active", !isLogin);
  loginForm.style.display  = isLogin ? "block" : "none";
  signupForm.style.display = isLogin ? "none"  : "block";
  clearAll();
}

document.querySelectorAll("[data-open-auth]").forEach(btn => {
  btn.addEventListener("click", e => {
    e.preventDefault();
    openModal(btn.getAttribute("data-open-auth"));
  });
});
closeBtn?.addEventListener("click", closeModal);
overlay?.addEventListener("click", e => { if (e.target === overlay) closeModal(); });
tabLogin?.addEventListener("click",  () => setTab("login"));
tabSignup?.addEventListener("click", () => setTab("signup"));

// ── Signup role pill ─────────────────────────────────────────
const rolePills      = document.querySelectorAll(".role-pill");
const signupRoleInput= document.getElementById("signupRole");
const yearField      = document.getElementById("yearField");

rolePills.forEach(pill => {
  pill.addEventListener("click", () => {
    rolePills.forEach(p => p.classList.remove("active"));
    pill.classList.add("active");
    const role = pill.getAttribute("data-role");
    signupRoleInput.value = role;
    yearField.style.display = role === "student" ? "block" : "none";
  });
});

// ── Password validation ──────────────────────────────────────
function validatePassword(pw) {
  const rules = [
    [/.{8,}/,        "at least 8 characters"],
    [/[A-Z]/,        "an uppercase letter"],
    [/[a-z]/,        "a lowercase letter"],
    [/[0-9]/,        "a number"],
    [/[^A-Za-z0-9]/, "a special character"]
  ];
  const failed = rules.filter(([re]) => !re.test(pw)).map(([, label]) => label);
  return failed.length === 0
    ? { ok: true }
    : { ok: false, message: `Password needs ${failed.join(", ")}.` };
}

// ── Role-based redirect ──────────────────────────────────────
function redirectForRole(role) {
  if (role === "admin")   window.location.href = "admin.html";
  else if (role === "teacher") window.location.href = "teacher.html";
  else window.location.href = "student.html";
}

// ── Signup ───────────────────────────────────────────────────
signupForm?.addEventListener("submit", async e => {
  e.preventDefault();
  clearAll();

  const role       = signupRoleInput.value;
  const name       = document.getElementById("signupName").value.trim();
  const email      = document.getElementById("signupEmail").value.trim();
  const department = document.getElementById("signupDept").value.trim();
  const year       = role === "student" ? document.getElementById("signupYear").value : null;
  const password   = document.getElementById("signupPassword").value;

  // Guard: reject submission if name contains special characters
  if (!NAME_REGEX.test(name)) {
    const errEl = document.getElementById("signupName-error");
    if (errEl) {
      errEl.textContent = "Only letters, numbers, and spaces are allowed.";
      errEl.className   = "field-error show";
    }
    return;
  }
  if (!department) {
    showMsg("Please select your department.", "error");
    return;
  }

  // Password validation — show error inline below password field
  const check = validatePassword(password);
  if (!check.ok) {
    showFieldError("signupPassword", check.message);
    return;
  }

  try {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    const uid  = cred.user.uid;

    await setDoc(doc(db, "users", uid), {
      uid, name, email, role, department, year,
      approval_status: role === "teacher" ? "pending" : "approved",
      createdAt: serverTimestamp()
    });

    if (role === "teacher") {
      await signOut(auth);
      showMsg("Account created. Your teacher account needs admin approval before you can log in.", "success");
      signupForm.reset();
    } else {
      showMsg("Account created — redirecting...", "success");
      setTimeout(() => redirectForRole("student"), 700);
    }
  } catch (err) {
    routeSignupError(err);
  }
});

// Route signup errors to the correct field
function routeSignupError(err) {
  const code = err?.code || "";
  if (code.includes("email-already-in-use")) {
    showFieldError("signupEmail", "That email is already registered. Try logging in instead.");
  } else if (code.includes("invalid-email")) {
    showFieldError("signupEmail", "That email address looks invalid.");
  } else if (code.includes("weak-password")) {
    showFieldError("signupPassword", "Please choose a stronger password.");
  } else {
    showMsg(friendlyAuthError(err), "error");
  }
}

// ── Login ────────────────────────────────────────────────────
loginForm?.addEventListener("submit", async e => {
  e.preventDefault();
  clearAll();

  const email    = document.getElementById("loginEmail").value.trim();
  const password = document.getElementById("loginPassword").value;

  try {
    const cred     = await signInWithEmailAndPassword(auth, email, password);
    const uid      = cred.user.uid;
    const userSnap = await getDoc(doc(db, "users", uid));

    if (!userSnap.exists()) {
      await signOut(auth);
      return showMsg("No profile found for this account. Contact an admin.", "error");
    }

    const data = userSnap.data();

    if (data.role === "teacher" && data.approval_status !== "approved") {
      await signOut(auth);
      return showMsg("Your teacher account is still pending admin approval.", "info");
    }

    showMsg("Welcome back — redirecting...", "success");
    setTimeout(() => redirectForRole(data.role), 500);

  } catch (err) {
    routeLoginError(err);
  }
});

// Route login errors to the correct field
function routeLoginError(err) {
  const code = err?.code || "";
  if (code.includes("invalid-credential") || code.includes("wrong-password")) {
    // Wrong password — show error inline below password field
    showFieldError("loginPassword", "Incorrect password. Please try again.");
  } else if (code.includes("user-not-found")) {
    // Email not found — show error inline below email field
    showFieldError("loginEmail", "No account found with this email address.");
  } else if (code.includes("invalid-email")) {
    showFieldError("loginEmail", "That email address looks invalid.");
  } else if (code.includes("too-many-requests")) {
    showMsg("Too many failed attempts. Please wait a moment and try again.", "error");
  } else {
    showMsg(friendlyAuthError(err), "error");
  }
}

function friendlyAuthError(err) {
  const code = err?.code || "";
  if (code.includes("email-already-in-use"))  return "That email is already registered. Try logging in instead.";
  if (code.includes("invalid-credential") ||
      code.includes("wrong-password")     ||
      code.includes("user-not-found"))         return "Incorrect email or password.";
  if (code.includes("invalid-email"))          return "That email address looks invalid.";
  if (code.includes("weak-password"))          return "Please choose a stronger password.";
  return "Something went wrong. Please try again.";
}

// ============================================================
// Shared route guard — used by admin.js / teacher.js / student.js
// ============================================================
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

export function requireRole(expectedRole, onReady) {
  onAuthStateChanged(auth, async user => {
    if (!user) return (window.location.href = "index.html");
    const snap = await getDoc(doc(db, "users", user.uid));
    if (!snap.exists()) return (window.location.href = "index.html");
    const data = snap.data();
    if (data.role !== expectedRole) return (window.location.href = "index.html");
    if (data.role === "teacher" && data.approval_status !== "approved") {
      await signOut(auth);
      return (window.location.href = "index.html");
    }
    onReady({ uid: user.uid, ...data });
  });
}

export { auth, db };