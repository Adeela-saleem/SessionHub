// ============================================================
// SessionHub — LLM Integration (AI Quiz Generator / Paper Formatter)
// ------------------------------------------------------------
// SECURITY NOTE: never call an LLM provider (OpenAI, Anthropic, etc.)
// directly from this client-side file with an embedded API key —
// it would be visible to anyone who opens devtools. The correct
// architecture is:
//
//   Browser (this file) → Firebase Cloud Function (holds the key)
//                        → LLM Provider API → response → Browser
//
// Below, generateQuizWithLLM() and formatPaperWithLLM() currently
// return realistic MOCK data so the UI is fully testable without
// a backend. Swap the marked section for a fetch() call to your
// own Cloud Function endpoint when you're ready to go live.
// ============================================================

/**
 * Generate quiz questions for a topic.
 * @param {{topic:string, difficulty:string, count:number, type:string}} params
 * @returns {Promise<Array<{id:string, question:string, options:string[], correctIndex:number}>>}
 */
export async function generateQuizWithLLM({ topic, difficulty, count, type }) {
  // ---- REAL INTEGRATION POINT ----
  // const res = await fetch("https://<your-region>-<your-project>.cloudfunctions.net/generateQuiz", {
  //   method: "POST",
  //   headers: { "Content-Type": "application/json" },
  //   body: JSON.stringify({ topic, difficulty, count, type })
  // });
  // if (!res.ok) throw new Error("Quiz generation failed");
  // return (await res.json()).questions;
  // ---------------------------------

  await wait(900); // simulate network latency

  const bank = [
    `Which concept best defines "${topic}"?`,
    `What is a common real-world application of ${topic}?`,
    `Which of the following is NOT related to ${topic}?`,
    `In ${topic}, what does the term "${topic.split(" ")[0]} normalization" most likely refer to?`,
    `Which statement about ${topic} is most accurate at a ${difficulty} level?`,
    `What is a typical mistake students make when first learning ${topic}?`
  ];

  const questions = Array.from({ length: Math.min(count, 12) }, (_, i) => {
    const q = bank[i % bank.length];
    return {
      id: `q_${Date.now()}_${i}`,
      question: q,
      type,
      options: type === "mcq"
        ? ["Option A", "Option B", "Option C", "Option D"]
        : undefined,
      correctIndex: type === "mcq" ? 0 : undefined
    };
  });

  return questions;
}

/**
 * Format raw exam content into a clean, structured paper.
 * @param {{rawText:string, paperTitle:string, instructions:string}} params
 * @returns {Promise<string>} formatted plain-text/markdown paper
 */
export async function formatPaperWithLLM({ rawText, paperTitle, instructions }) {
  // ---- REAL INTEGRATION POINT ----
  // const res = await fetch("https://<your-region>-<your-project>.cloudfunctions.net/formatPaper", {
  //   method: "POST",
  //   headers: { "Content-Type": "application/json" },
  //   body: JSON.stringify({ rawText, paperTitle, instructions })
  // });
  // if (!res.ok) throw new Error("Paper formatting failed");
  // return (await res.json()).formattedText;
  // ---------------------------------

  await wait(900);

  const lines = rawText.split("\n").map(l => l.trim()).filter(Boolean);
  const numbered = lines.map((l, i) => `${i + 1}. ${l}`).join("\n\n");

  return [
    `# ${paperTitle || "Untitled Paper"}`,
    instructions ? `**Instructions:** ${instructions}` : "",
    `**Total Questions:** ${lines.length}`,
    "---",
    numbered || "(No content provided to format.)"
  ].filter(Boolean).join("\n\n");
}

function wait(ms) { return new Promise(r => setTimeout(r, ms)); }
