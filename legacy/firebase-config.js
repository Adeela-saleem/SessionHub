// ============================================================
// SessionHub — Firebase Initialization
// ------------------------------------------------------------
// 1. Go to https://console.firebase.google.com → create a project.
// 2. Enable Authentication → Sign-in method → Email/Password.
// 3. Enable Firestore Database (start in production mode, then
//    paste firestore.rules from the project root into the Rules tab).
// 4. Project settings → General → "Your apps" → Web app → copy the
//    config object below and replace the placeholder values.
// 5. This file is imported (type="module") by every page, so you
//    only ever edit your keys here.
// ============================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// TODO: replace with your project's config (Firebase Console → Project settings)
const firebaseConfig = {
  apiKey: "YOUR_FIREBASE_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT.firebasestorage.app",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "1:YOUR_SENDER_ID:web:YOUR_APP_ID",
  measurementId: "G-84RH49F7QK"
};


export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// ------------------------------------------------------------
// One-time setup note (do this manually in the Firebase console,
// NOT in client code): create the single Admin account by hand —
// Authentication → Add user → set its email/password — then add a
// matching document in Firestore at users/{thatUid} with:
//   { role: "admin", name: "Super Admin", approval_status: "approved" }
// There is intentionally no public "sign up as Admin" path anywhere
// in this app — see js/auth.js.
// ------------------------------------------------------------
