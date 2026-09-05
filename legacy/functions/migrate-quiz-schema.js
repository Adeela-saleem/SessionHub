// ====================================================================
// Migration: Convert top-level quizzes to sessions/{sid}/questions
// ====================================================================
// Run this ONCE to migrate existing quiz data from the old schema to
// the new schema where questions live in a subcollection under each
// session and the answer key is in a private/ subcollection.
//
// Usage: firebase functions:shell
//        > migrate_quiz_schema()
//
// Or deploy this and call it as:
//        curl -X POST https://<region>-<project>.cloudfunctions.net/migrateQuizSchema
// ====================================================================

const admin = require("firebase-admin");

// Initialize if not already done
if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

/**
 * Migrate quiz documents from top-level /quizzes to /sessions/{sid}/questions
 * and create /private/key subcollections for the answer keys.
 */
async function migrateQuizSchema() {
  console.log("Starting quiz schema migration...");

  try {
    // 1. Get all top-level quiz documents
    const quizzesSnap = await db.collection("quizzes").get();
    console.log(`Found ${quizzesSnap.size} quiz documents to migrate.`);

    if (quizzesSnap.size === 0) {
      console.log("No quizzes to migrate.");
      return { success: true, migratedCount: 0 };
    }

    let migratedCount = 0;
    const errors = [];

    // 2. For each quiz, create it in the new location
    for (const quizDoc of quizzesSnap.docs) {
      try {
        const data = quizDoc.data();
        const { sessionId, correctIndex, ...questionData } = data;

        if (!sessionId) {
          console.warn(`Quiz ${quizDoc.id} has no sessionId, skipping.`);
          errors.push({ docId: quizDoc.id, reason: "No sessionId" });
          continue;
        }

        // 3. Create the question document (without the answer key)
        const questionRef = db.doc(
          `sessions/${sessionId}/questions/${quizDoc.id}`
        );
        await questionRef.set({
          ...questionData,
          state: "pending",  // new field
          // Remove correctIndex from the public question
        });

        // 4. Create the private key document
        const keyRef = questionRef.collection("private").doc("key");
        await keyRef.set({
          correctIndex: correctIndex,
          explanation: "",
        });

        console.log(
          `✓ Migrated quiz ${quizDoc.id} to session ${sessionId}`
        );
        migratedCount++;
      } catch (err) {
        console.error(`✗ Error migrating quiz ${quizDoc.id}:`, err.message);
        errors.push({ docId: quizDoc.id, error: err.message });
      }
    }

    console.log(`\nMigration complete. Migrated ${migratedCount} quizzes.`);
    if (errors.length > 0) {
      console.log("Errors:", errors);
    }

    return { success: true, migratedCount, errors };
  } catch (err) {
    console.error("Migration failed:", err);
    return { success: false, error: err.message };
  }
}

// Export for firebase functions:shell
module.exports = { migrateQuizSchema };
