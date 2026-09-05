# Phase 1 Verification Checklist

## Changes Made

### 1. Firestore Rules (firestore.rules)
- ✅ Added new subcollection rules: `match /sessions/{sid}/questions/{qid}`
- ✅ Added private key subcollection: `match /sessions/{sid}/questions/{qid}/private/{doc}` (teachers/admins only)
- ✅ Added new answers collection: `match /sessions/{sid}/answers/{aid}` (immutable after creation)
- ✅ Added new votes collection: `match /sessions/{sid}/polls/{pid}/votes/{vid}`
- ✅ Marked old top-level `quizzes` collection as deprecated (kept for migration)

### 2. Cloud Function (functions/index.js)
- ✅ Added `submitAnswer` callable function
- ✅ Validates question state and closesAt timer server-side
- ✅ Loads answer key from private/key subcollection (NOT sent to client)
- ✅ Grades quiz server-side (for MCQ)
- ✅ Uses deterministic ID (`{questionId}_{studentId}`) to prevent double-submit
- ✅ Returns error if document already exists
- ✅ Immutable after creation (`allow update: if false`)

### 3. Student Dashboard (student.js)
- ✅ Added Firebase Functions import (httpsCallable)
- ✅ Updated `listenLiveQuiz()` to read from `sessions/{sid}/questions` (new path)
- ✅ Updated `submitAllAnswers()` to call Cloud Function instead of direct write
- ✅ Cloud Function call will fail if trying to answer twice

### 4. Teacher Dashboard (teacher.js)
- ✅ Updated quiz broadcast to:
  - Write question to `sessions/{sid}/questions/{qid}` (public)
  - Write answer key to `sessions/{sid}/questions/{qid}/private/key` (restricted)
- ✅ Updated `listenQuizMonitor()` to read questions from new path
- ✅ Updated answer reading to use new `answers` collection path
- ✅ Changed field references from `quizId` to `questionId`

### 5. Migration Script (functions/migrate-quiz-schema.js)
- ✅ Script to backfill existing quiz documents to new schema
- ✅ Creates question docs and private/key subcollections
- ✅ Run via `firebase functions:shell` → `migrateQuizSchema()`

## Verification Steps

### Step 1: Verify correctIndex is NOT leaked
After deploying and joining a quiz session, open browser console and run:
```javascript
sessionQuestions;  // Should list questions WITHOUT correctIndex field
sessionQuestions[0].correctIndex;  // Should be undefined
```

**Expected:** `undefined` ✅

### Step 2: Verify direct submission is blocked
Try to write directly to Firestore:
```javascript
db.collection("sessions").doc(sessionId).collection("answers").add({
  studentId: auth.currentUser.uid,
  questionId: "q1",
  answer: "test"
});
```

**Expected:** Firestore rules deny the write with `PERMISSION_DENIED` ✅

### Step 3: Verify Cloud Function blocks double-submit
Call `submitAnswer` twice for the same question:
```javascript
const fn = httpsCallable(getFunctions(), "submitAnswer");
await fn({ sessionId: "s1", questionId: "q1", answer: "A", answerIndex: 0 });
await fn({ sessionId: "s1", questionId: "q1", answer: "B", answerIndex: 1 });
```

**Expected:** Second call throws `already-exists` error ✅

### Step 4: Verify private key is not readable by students
Try to read the key:
```javascript
db.doc("sessions/sid/questions/qid/private/key").get();
```

**Expected:** Firestore rules deny with `PERMISSION_DENIED` ✅

## Deployment Steps

1. **Deploy Firestore Rules:**
   ```bash
   firebase deploy --only firestore:rules
   ```

2. **Deploy Cloud Functions:**
   ```bash
   cd functions
   npm install
   firebase deploy --only functions:submitAnswer
   ```

3. **Run Migration (if existing data):**
   ```bash
   firebase functions:shell
   > const { migrateQuizSchema } = require("./migrate-quiz-schema");
   > migrateQuizSchema();
   ```

4. **Test in Frontend:**
   - Start dev server: `python3 -m http.server 8080`
   - Teacher: Generate quiz, broadcast to session
   - Student: Join session, see no answer keys in devtools
   - Student: Submit answer (calls Cloud Function)
   - Try to submit again (should get error)

## Known Limitations (Phase 1)

- ⚠️ Quiz timer not yet implemented (Phase 2)
- ⚠️ Question state transitions not yet implemented (Phase 2)
- ⚠️ Auto-reveal of correct answers not yet implemented (Phase 2)
- ⚠️ Rate limiting not yet implemented (Phase 5)

## Rollback Plan

If something breaks:
1. Revert `firestore.rules` to use old `match /quizzes/{quizId}` rules
2. Redeploy Cloud Functions without `submitAnswer`
3. Student quiz reading will fall back to top-level quizzes
4. Teacher quiz writing will fall back to top-level quizzes

The old top-level `quizzes` collection is still writable and readable, so a rollback is clean.
