// ====================================================================
// SessionHub — functions/index.js
// Firebase Cloud Function: generateAIContent
// ====================================================================
// Solves CORS + Gemini schema-deviation in one place.
//
// ARCHITECTURE — three defensive layers:
//   Layer 1 → responseMimeType: "application/json"
//              Forces Gemini into constrained-decoding mode so it can
//              only produce tokens that form valid JSON.
//   Layer 2 → responseSchema (OpenAPI 3.0 format)
//              Pins every key name, type, and nesting depth. Gemini
//              cannot deviate from this structure at generation time.
//   Layer 3 → Server-side normalization (normalizeQuiz / normalizePaper)
//              Catches any residual drift (wrong case, missing fields,
//              wrong data types) before the response reaches teacher.js.
//
// ── What teacher.js expects from this function ───────────────────────
//   Quiz  → { questions: [{ question, type, options, correctIndex, marks }] }
//   Paper → { clos: string[], questions: [{ parts: [{label,text,marks}] }] }
//
// ── Firestore quiz document shape (written by teacher.js broadcast) ──
//   { sessionId, question, type, options, correctIndex, marks, ... }
//   student.js checks `latest.options` (truthy) to distinguish MCQ/Short.
//
// ── Setup ────────────────────────────────────────────────────────────
//   Emulator:   firebase emulators:start --only functions
//   Deploy:     firebase deploy --only functions
//   Node req:   ≥ 18 (global fetch is built-in)
// ====================================================================

"use strict";

const functions = require("firebase-functions");
const cors      = require("cors")({ origin: true });

// ────────────────────────────────────────────────────────────────────
// GROQ API CONFIGURATION
// ────────────────────────────────────────────────────────────────────
// Groq is completely free — no credit card, no billing setup needed.
//
// HOW TO GET YOUR KEY (takes 2 minutes):
//   1. Go to https://console.groq.com
//   2. Sign up with any Google account
//   3. Click "API Keys" → "Create API Key"
//   4. Copy the key (starts with gsk_...)
//
// Add this line to functions/.env:
//   GROQ_API_KEY=gsk_...your key here...
//
// Then restart the emulator:
//   firebase emulators:start --only functions
// ────────────────────────────────────────────────────────────────────
const GROQ_API_KEY = process.env.GROQ_API_KEY || null;
const GROQ_URL     = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL   = "llama-3.1-8b-instant";

// ====================================================================
// LAYER 1 & 2 — RESPONSE SCHEMAS
// ────────────────────────────────────────────────────────────────────
// OpenAPI 3.0 format required by Gemini's responseSchema.
// IMPORTANT: Gemini 1.5 Flash handles nullable fields inconsistently,
// so we avoid them entirely:
//   • Short-answer options → empty array []  (normalised to null server-side)
//   • Short-answer correctIndex → -1         (normalised to null server-side)
// This keeps the schema non-nullable while letting us send null to the
// frontend as teacher.js requires.
// ====================================================================

const QUIZ_SCHEMA = {
  type: "object",
  properties: {
    questions: {
      type: "array",
      description: "Array of quiz questions",
      items: {
        type: "object",
        description: "A single quiz question",
        properties: {
          question: {
            type: "string",
            description: "The complete, self-contained question text"
          },
          type: {
            type: "string",
            description: "Exactly the string 'mcq' for Multiple Choice or 'short' for Short Answer"
          },
          options: {
            type: "array",
            description:
              "For MCQ: exactly 4 answer choices as strings. " +
              "For Short: empty array [].",
            items: { type: "string" }
          },
          correctIndex: {
            type: "integer",
            description:
              "For MCQ: 0-based index (0,1,2,3) of the correct option. " +
              "For Short: use -1."
          },
          marks: {
            type: "integer",
            description: "Positive integer marks allocated to this question"
          }
        },
        required: ["question", "type", "options", "correctIndex", "marks"]
      }
    }
  },
  required: ["questions"]
};

const PAPER_SCHEMA = {
  type: "object",
  properties: {
    questions: {
      type: "array",
      description: "One entry per question, matching the question configuration exactly",
      items: {
        type: "object",
        properties: {
          questionNumber: {
            type: "integer",
            description: "Sequential question number starting from 1"
          },
          scenario: {
            type: "string",
            description: "2-4 sentence industry-oriented scenario paragraph for this question"
          },
          estimatedTimeMinutes: {
            type: "integer",
            description: "Estimated time in minutes for a student to answer this question"
          },
          subparts: {
            type: "array",
            description: "Sub-questions within this question — one per configured part",
            items: {
              type: "object",
              properties: {
                label: { type: "string", description: "Single lowercase letter: a, b, c, d, e, or f" },
                text:  { type: "string", description: "Complete, self-contained academic question text for this part" }
              },
              required: ["label", "text"]
            }
          }
        },
        required: ["questionNumber", "scenario", "estimatedTimeMinutes", "subparts"]
      }
    }
  },
  required: ["questions"]
};

// ====================================================================
// SYSTEM INSTRUCTION
// Shared across both prompt types. Sets the "JSON-only contract" at the
// model level, separate from the task-specific user prompt.
// ====================================================================
const SYSTEM_INSTRUCTION_TEXT =
  `You are a strict JSON-only academic content API for a university education platform.\n` +
  `ABSOLUTE RULES — violating any of these causes a critical system failure:\n` +
  `1. Your ENTIRE response must be one valid JSON object and nothing else.\n` +
  `2. Do NOT use markdown code fences (\`\`\`json or \`\`\`) anywhere.\n` +
  `3. Do NOT write any explanation, preamble, or text outside the JSON.\n` +
  `4. Use EXACTLY the key names specified — no synonyms, no renaming.\n` +
  `5. All required fields must be present in every object — never omit them.\n` +
  `6. All string values must be non-empty (except options for short questions = []).\n` +
  `7. Integers must be actual integers, not strings.\n`;

// ====================================================================
// PROMPT BUILDERS
// Dual-layer prompting: system instruction sets the contract;
// user prompt gives the specific generation task WITH explicit examples
// showing the exact key names and value types.
// ====================================================================

/**
 * buildQuizPrompt
 * Constructs the user-turn prompt for quiz generation.
 *
 * @param {object} p
 * @param {string} p.subject    - subject name or empty string
 * @param {string} p.topic      - required: what the questions are about
 * @param {string} p.difficulty - "Easy" | "Medium" | "Hard"
 * @param {string} p.format     - "MCQs" | "Short" | "Mixed"
 * @param {number} p.count      - total number of questions
 * @param {string} p.description - optional teacher notes
 */
function buildQuizPrompt({ subject, topic, difficulty, format, count, description }) {
  // ── Compute MCQ / Short split ──────────────────────────────
  let mcqCount = 0, shortCount = 0;
  if (format === "MCQs")       { mcqCount   = count; }
  else if (format === "Short") { shortCount = count; }
  else {                         // "Mixed"
    mcqCount   = Math.ceil(count  / 2);
    shortCount = Math.floor(count / 2);
  }

  const marksRange  = difficulty === "Easy" ? "1-2" : difficulty === "Hard" ? "3-5" : "2-3";
  const subjectLine = subject     ? `Subject: ${subject}\n` : "";
  const ctxLine     = description ? `Teacher notes: ${description}\n` : "";

  // ── Build per-type field rules ─────────────────────────────
  const mcqRule   = `MCQ  → "type":"mcq", options: array of exactly 4 strings, correctIndex: 0-3 integer`;
  const shortRule = `Short → "type":"short", options: [] (empty array), correctIndex: -1`;

  // ── Concrete JSON example in the prompt ───────────────────
  // Shows exact key names so Gemini cannot guess synonyms.
  const exampleMCQ = `    {
      "question": "Which scheduling algorithm can cause starvation of low-priority processes?",
      "type": "mcq",
      "options": ["Round Robin","FCFS","Priority Scheduling","Shortest Job First"],
      "correctIndex": 2,
      "marks": 2
    }`;
  const exampleShort = `    {
      "question": "Explain the four necessary conditions for a deadlock to occur.",
      "type": "short",
      "options": [],
      "correctIndex": -1,
      "marks": 4
    }`;

  const exampleBlock = [
    mcqCount   > 0 ? exampleMCQ   : null,
    shortCount > 0 ? exampleShort : null,
  ].filter(Boolean).join(",\n");

  return [
    `Generate exactly ${count} university-level academic quiz questions.`,
    ``,
    `${subjectLine}Topic: ${topic}`,
    `Difficulty level: ${difficulty}`,
    `${ctxLine}`,
    `QUESTION COUNTS (generate EXACTLY this many):`,
    mcqCount   > 0 ? `  • ${mcqCount}   Multiple Choice Question(s) (MCQ)`   : null,
    shortCount > 0 ? `  • ${shortCount} Short Answer Question(s)`             : null,
    ``,
    `FIELD RULES:`,
    `  ${mcqRule}`,
    `  ${shortRule}`,
    `  marks: integer in range ${marksRange} (vary within range, do not repeat same value for all)`,
    `  question: a complete, self-contained academic sentence — no topic labels, no fragments`,
    ``,
    `ORDER: all MCQ questions first, then all Short questions.`,
    ``,
    `EXACT JSON STRUCTURE TO USE (use these key names verbatim):`,
    `{`,
    `  "questions": [`,
    exampleBlock,
    `  ]`,
    `}`,
  ].filter(l => l !== null).join("\n");
}

/**
 * buildPaperPrompt — scenario-based university exam prompt.
 * Mirrors paper-formatter.html's buildSystemPrompt exactly.
 * AI generates: scenario, estimatedTimeMinutes, subparts[{label,text}].
 * CLOs come from the teacher's form — NOT generated by AI.
 * Labels and marks come from questionConfig — NOT generated by AI.
 */
function buildPaperPrompt({
  instructor, university, subjectName, program, semester,
  examType, examDate, duration, totalMarks,
  topics, clos, instructions, questionConfig,
}) {
  const qSpec = questionConfig.map(q =>
    `Question ${q.num}: maps to CLO ${q.clo}, BTL ${q.btl}, has ${q.parts.length} subparts labeled ` +
    `${q.parts.map(p => p.label).join(",")} worth marks [${q.parts.map(p => p.marks).join(", ")}] respectively.`
  ).join("\n");

  return `You are an expert university examination paper setter. Generate a completely new, professional, university-level terminal examination paper in strict JSON format only — no markdown, no backticks, no preamble, no commentary.

CONTEXT:
Subject: ${subjectName}
Program: ${program}
Semester: ${semester}
Exam Type: ${examType}
Topics to cover — STRICT SCOPE: generate questions ONLY from these topics, no others:
${topics}
Course Learning Outcomes — ALL questions must trace to these CLOs, no others:
${clos}

STRICT CURRICULUM SCOPE RULES (mandatory, non-negotiable):
A. Every question scenario, every subpart, and every concept used MUST derive exclusively from the topics listed above. Do NOT introduce any academic term, framework, methodology, or concept that is not explicitly listed in the topics — even if it is related to the broader subject area.
B. Every subpart must be directly traceable to both (i) at least one topic in the topics list above and (ii) the CLO number assigned to its question. If a subpart cannot be traced to BOTH, it must be rewritten until it can.
C. Do NOT hallucinate or extrapolate beyond the provided curriculum. If the topics list does not mention a concept (e.g., topics say "Software Testing" but NOT "Formal Verification"), do not include formal verification in any question.
D. Scenario contexts must be real-world applications of the listed topics — never generic academic examples that could belong to any subject.

RULES:
1. Design a COMPLETELY DIFFERENT and UNIQUE scenario for EACH question. Do NOT reuse the same system, company, platform, or context across any two questions. Every question must have its own distinct, original, industry-oriented setting. Choose a wide variety of modern real-world systems — for example: Q1 might be set in a hospital patient management system, Q2 in an airline reservation platform, Q3 in an e-commerce inventory system, Q4 in a smart city IoT network, Q5 in a cloud storage service. No two questions may share the same industry or platform type.
2. There are ${questionConfig.length} questions. Each question must have its own independent 2-4 sentence "scenario" paragraph that introduces a NEW system or context from scratch. The scenario should establish a realistic setting that motivates the subparts — never reference or continue a previous question's scenario. Within each question, every subpart must require genuine reasoning tied to THAT question's specific scenario — never simple one-line definitions in isolation. Mix cognitive demands across subparts: understanding, application, analysis, evaluation, problem solving, and where relevant include diagram-description questions (UML, ER, DFD, architecture, sequence, state, activity — described in words, no actual drawing required), comparison questions, and calculation/data-analysis subparts using realistic invented numeric data (budget, defects, task completion, timelines, risk counts, etc.).
3. Follow this exact per-question spec — do NOT change CLO, BTL, subpart labels, or marks — only write the scenario and question text:
${qSpec}
4. CLO-TO-QUESTION STRICT ACADEMIC ALIGNMENT: Each question above is pre-assigned a CLO number that maps to one of the teacher's declared Course Learning Outcomes for the subject "${subjectName}". You MUST ensure that the question scenario, context, and ALL subparts are academically aligned exclusively to the content domain of that specific numbered CLO. Cross-mapping is strictly forbidden — a question assigned to CLO 2 (e.g., "Apply software design principles") must test ONLY software design skills, NOT requirements engineering, testing, or project management. A question assigned to CLO 3 (e.g., "Analyze testing strategies") must involve testing concepts exclusively. Verify every subpart independently: if any subpart drifts outside its assigned CLO domain, rewrite it. The CLO-to-question assignment is absolute and non-negotiable.
5. Do NOT provide any answers or solutions.
6. Never reuse question wording from generic textbooks; every question must be original and scenario-driven.
7. CRITICAL JSON FORMATTING: every string value must be plain text on a single line with no literal line breaks inside it — use a single space instead of a newline. Do not use unescaped double quotes inside string values (use single quotes for emphasis). Output must be valid, complete, parseable JSON with no truncation.

Return ONLY valid JSON matching exactly this schema, nothing else:
{
  "questions": [
    {
      "questionNumber": 1,
      "scenario": "2-4 sentence scenario paragraph — single line, no literal newlines",
      "estimatedTimeMinutes": 38,
      "subparts": [
        {"label": "a", "text": "complete question text only — no marks or CLO mentioned"},
        {"label": "b", "text": "complete question text only"}
      ]
    }
  ]
}`;
}

// ====================================================================
// LAYER 3 — RESPONSE PARSING + NORMALIZATION
// ────────────────────────────────────────────────────────────────────
// Even with responseSchema + responseMimeType, Gemini 1.5 Flash may:
//   • Return keys in wrong case (e.g. "Question" instead of "question")
//   • Omit fields for some items
//   • Return -1 correctIndex for short questions (expected)
//   • Return marks as strings instead of integers
//   • Miss the "question" text entirely (observed in Image 2)
//
// These functions sanitize and rebuild to the exact shape teacher.js
// needs before we send back the HTTP response.
// ====================================================================

/**
 * parseJSONSafe
 * Strips markdown fences and leading/trailing non-JSON characters,
 * then JSON.parses. This is the last resort if Gemini ignores the
 * responseMimeType instruction and wraps output in code fences anyway.
 */
function parseJSONSafe(rawText) {
  let s = (rawText || "").trim();
  // Remove ```json … ``` or ``` … ``` wrappers
  s = s.replace(/^```json\s*/i, "").replace(/\s*```\s*$/i, "");
  s = s.replace(/^```\s*/i,     "").replace(/\s*```\s*$/i, "");
  // Discard anything before the first structural character { or [
  const start = s.search(/[{[]/);
  if (start > 0) s = s.slice(start);
  // Discard anything after the last structural character } or ]
  const end = Math.max(s.lastIndexOf("}"), s.lastIndexOf("]"));
  if (end !== -1 && end < s.length - 1) s = s.slice(0, end + 1);
  return JSON.parse(s);
}

/**
 * normalizeQuizResponse
 * Ensures every question in the response matches exactly what teacher.js
 * expects when it maps the array:
 *   q.question     → string (non-empty)
 *   q.type         → lowercase "mcq" or "short"
 *   q.options      → string[] with 4 items for MCQ, null for short
 *   q.correctIndex → 0-3 integer for MCQ, null for short
 *   q.marks        → positive integer
 *
 * Field-alias handling — Gemini may return different key names:
 *   question text:  "question" | "text" | "questionText" | "prompt"
 *   type:           "mcq" | "MCQ" | "Multiple Choice" | "short" | "Short"
 *   answer index:   "correctIndex" | "correct" | "answer" | "answerIndex"
 *   marks:          "marks" | "points" | "score" | "weightage"
 */
function normalizeQuizResponse(raw) {
  // ── Top-level validation ───────────────────────────────────
  if (!raw || typeof raw !== "object") {
    throw new Error("Quiz AI response is not a JSON object.");
  }
  if (!Array.isArray(raw.questions) || raw.questions.length === 0) {
    throw new Error(
      "Quiz AI response missing a non-empty 'questions' array. " +
      "Check the Gemini response in the function logs."
    );
  }

  const questions = raw.questions.map((q, i) => {
    // ── Question text ──────────────────────────────────────
    const questionText = String(
      q.question     ??
      q.text         ??
      q.questionText ??
      q.prompt       ??
      q.q            ??
      ""
    ).trim();

    if (!questionText) {
      // Log so the developer can see Gemini's raw field names
      functions.logger.warn(
        `Q${i + 1}: question text is empty. Raw keys from Gemini: ${Object.keys(q).join(", ")}`
      );
    }

    const safeQuestion = questionText || `Question ${i + 1}`;

    // ── Type ───────────────────────────────────────────────
    const rawType = String(q.type ?? "").toLowerCase();
    const isMCQ   =
      rawType === "mcq" ||
      rawType.startsWith("multiple") ||
      rawType.startsWith("choice");
    const type = isMCQ ? "mcq" : "short";

    // ── Options ────────────────────────────────────────────
    // teacher.js: Array.isArray(q.options) ? q.options : null
    // So we must send an actual array for MCQ, or null for short.
    let options = null;
    if (isMCQ) {
      // Gemini may label this "options", "choices", "answers", "opts"
      const rawOpts = q.options ?? q.choices ?? q.answers ?? q.opts;
      if (Array.isArray(rawOpts) && rawOpts.filter(o => String(o).trim()).length >= 2) {
        // Normalise to string array, cap at 4, pad to 4 if necessary
        options = rawOpts.slice(0, 4).map(o => String(o).trim());
        while (options.length < 4) {
          options.push(`Option ${String.fromCharCode(65 + options.length)}`);
        }
      } else {
        // MCQ with no options returned — create explicit placeholders so
        // the student UI does not crash when rendering the option buttons.
        options = ["Option A", "Option B", "Option C", "Option D"];
        functions.logger.warn(`Q${i + 1}: MCQ missing options — placeholder options injected.`);
      }
    }
    // short → options stays null (teacher.js checks Array.isArray, so null is correct)

    // ── Correct index ──────────────────────────────────────
    // teacher.js: typeof q.correctIndex === "number" ? q.correctIndex : null
    let correctIndex = null;
    if (isMCQ) {
      // Gemini may label this "correctIndex", "correct", "answer",
      // "answerIndex", "correctAnswer" (when it's an integer)
      const rawCI = q.correctIndex ?? q.correct ?? q.answer ?? q.answerIndex;
      const ci    = parseInt(rawCI, 10);
      // -1 means Gemini mistakenly used the short-question sentinel for an MCQ
      if (!isNaN(ci) && ci >= 0 && ci <= 3) {
        correctIndex = ci;
      } else {
        // Fall back to index 0 rather than crashing
        correctIndex = 0;
        functions.logger.warn(`Q${i + 1}: invalid correctIndex "${rawCI}" — defaulting to 0.`);
      }
    }
    // short → correctIndex stays null

    // ── Marks ──────────────────────────────────────────────
    const rawMarks = q.marks ?? q.points ?? q.score ?? q.weightage;
    const marks    = Math.max(1, parseInt(rawMarks, 10) || 2);

    return { question: safeQuestion, type, options, correctIndex, marks };
  });

  return { questions };
}

/**
 * normalizePaperResponse
 * ─────────────────────────────────────────────────────────────────
 * Converts the raw AI response into the exact shape teacher.js
 * expects after calling callCloudFunction("paper", {...}).
 *
 * AI generates (new paper-formatter.html schema):
 *   { questions: [{ questionNumber, scenario, estimatedTimeMinutes,
 *                   subparts: [{label, text}] }] }
 *
 * CLOs come from the teacher's form textarea — NOT generated by AI.
 * Marks come from questionConfig — NOT generated by AI.
 * Labels are ALWAYS taken from questionConfig — AI may drift.
 *
 * teacher.js renderPaper reads from the returned questions:
 *   q.scenario, q.estimatedTimeMinutes, q.subparts[].text
 * And from questionConfig (which it still has locally):
 *   cfg.clo, cfg.btl, cfg.parts[].marks
 */
function normalizePaperResponse(raw, questionConfig) {
  if (!raw || typeof raw !== "object") {
    throw new Error("Paper AI response is not a JSON object.");
  }
  if (!Array.isArray(raw.questions) || raw.questions.length === 0) {
    throw new Error(
      "Paper AI response missing a non-empty 'questions' array. " +
      "Check the Groq response in the function logs."
    );
  }

  const questions = questionConfig.map((configQ, qi) => {
    // Find AI question by position or by questionNumber field
    const aiQ =
      raw.questions[qi] ??
      raw.questions.find(q => q.questionNumber === configQ.num) ??
      {};

    // ── Scenario (2-4 sentence paragraph) ─────────────────────
    const scenario = String(
      aiQ.scenario ??
      aiQ.context  ??
      aiQ.premise  ??
      ""
    ).trim() || "Analyze the described system and answer the following questions.";

    // ── Estimated time ─────────────────────────────────────────
    const estimatedTimeMinutes =
      Math.max(5, parseInt(aiQ.estimatedTimeMinutes ?? aiQ.estimatedTime ?? 15, 10) || 15);

    // ── Subparts — AI calls them "subparts"; fallback to "parts" ─
    const aiSubparts =
      Array.isArray(aiQ.subparts) ? aiQ.subparts :
      Array.isArray(aiQ.parts)    ? aiQ.parts    :
      [];

    const subparts = configQ.parts.map((configPart, pi) => {
      // Find by label match first, positional index second
      const aiPart =
        aiSubparts.find(p =>
          String(p.label ?? "").toLowerCase() === configPart.label.toLowerCase()
        ) ??
        aiSubparts[pi] ??
        {};

      // Text — AI may use "text", "content", "question", "description"
      const text = String(
        aiPart.text     ??
        aiPart.content  ??
        aiPart.question ??
        aiPart.description ??
        ""
      ).trim();

      if (!text) {
        functions.logger.warn(
          `Q${qi + 1}(${configPart.label}): subpart text missing. ` +
          `AI keys: ${Object.keys(aiPart).join(", ")}`
        );
      }

      return {
        label: configPart.label,  // always teacher-configured — AI may drift
        text:  text || `Explain a key concept for part (${configPart.label}).`
        // marks are NOT sent — teacher.js reads them from questionConfig
      };
    });

    return {
      questionNumber:       configQ.num,
      scenario,
      estimatedTimeMinutes,
      subparts
    };
  });

  return { questions };
}

// ====================================================================
// GROQ API CALLER — with automatic retry on 429 rate-limit errors
// ────────────────────────────────────────────────────────────────────
// Groq uses the OpenAI-compatible chat completions format:
//   • system message  → JSON-only contract
//   • user message    → task-specific prompt with JSON example
//   • Response path   → data.choices[0].message.content
// Retries up to 3 times (5s → 10s → 20s) on rate-limit before failing.
// ====================================================================

async function callGroq(userPrompt, retryCount = 0) {
  const MAX_RETRIES  = 3;
  const RETRY_DELAYS = [5000, 10000, 20000]; // ms

  const requestBody = {
    model:       GROQ_MODEL,
    temperature: 0.3,
    max_tokens:  4096,
    messages: [
      {
        // System message enforces the JSON-only contract at the model level
        role:    "system",
        content: SYSTEM_INSTRUCTION_TEXT
      },
      {
        // User message contains the task prompt with inline JSON examples
        role:    "user",
        content: userPrompt
      }
    ]
  };

  const response = await fetch(GROQ_URL, {
    method:  "POST",
    headers: {
      "Content-Type":  "application/json",
      "Authorization": `Bearer ${GROQ_API_KEY}`
    },
    body: JSON.stringify(requestBody)
  });

  // ── 429: rate limit — retry with exponential backoff ─────────────
  if (response.status === 429) {
    if (retryCount < MAX_RETRIES) {
      const waitMs = RETRY_DELAYS[retryCount];
      functions.logger.warn(
        `Groq rate limit (429). ` +
        `Retry ${retryCount + 1}/${MAX_RETRIES} in ${waitMs / 1000}s…`
      );
      await new Promise(resolve => setTimeout(resolve, waitMs));
      return callGroq(userPrompt, retryCount + 1);
    }
    throw new Error(
      `Groq API rate limit exceeded after ${MAX_RETRIES} retries. ` +
      `Please wait a moment and try again.`
    );
  }

  // ── Other HTTP errors ─────────────────────────────────────────────
  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    if (response.status === 401) {
      throw new Error(
        `Groq API key rejected (HTTP 401). ` +
        `Check that GROQ_API_KEY in functions/.env is correct and restart the emulator.`
      );
    }
    throw new Error(`Groq API HTTP ${response.status}: ${errText.slice(0, 300)}`);
  }

  // ── Extract text from Groq's OpenAI-compatible response ──────────
  const data    = await response.json();
  const rawText = data?.choices?.[0]?.message?.content;

  if (!rawText) {
    const finishReason = data?.choices?.[0]?.finish_reason;
    throw new Error(
      `Groq returned no text content. ` +
      `finish_reason: ${finishReason ?? "none"}`
    );
  }

  return rawText;
}

// ====================================================================
// MAIN EXPORT
// ────────────────────────────────────────────────────────────────────
// Preserves the original cors wrapping, OPTIONS guard, method guard,
// and top-level body extraction from the user's skeleton exactly.
// The only changes are inside the try-block that builds + calls Gemini.
// ====================================================================
exports.generateAIContent = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {

    // ── Routing guards (preserved from original) ──────────────
    if (req.method === "OPTIONS") return res.status(200).send();
    if (req.method !== "POST")    return res.status(405).json({ error: "Method not allowed." });

    // ── Body extraction ────────────────────────────────────────
    const body       = req.body;
    const topic      = body.topic      || "General Knowledge";
    const difficulty = body.difficulty || "Medium";
    const type       = body.type       || "paper"; // "quiz" | "paper" | "meeting"

    functions.logger.info(`generateAIContent called`, { type, topic, difficulty });

    // ── MEETING BRANCH — Jitsi Meet ────────────────────────────
    // Jitsi Meet is completely free and open source.
    // No API key, no account, no credit card required.
    // Rooms are created on demand — any URL at meet.jit.si/room-name
    // automatically creates the room when the first person joins.
    // We add a timestamp to ensure each session gets a unique room.
    if (type === "meeting") {
      try {
        const sessionCode = String(body.sessionCode || "session")
          .replace(/[^a-zA-Z0-9]/g, "-")
          .replace(/-+/g, "-")
          .replace(/^-|-$/g, "")
          .slice(0, 24);

        const roomName = `SessionHub-${sessionCode}-${Date.now()}`;

        // 8x8.vc — Jitsi's own hosted service (free, no credit card,
        // no 5-minute iframe disconnect limit, up to 25 participants).
        // meet.jit.si embeds cut off at 5 min; 8x8.vc does not.
        const JAAS_APP_ID = "vpaas-magic-cookie-a2393eeb71fc47ed944fb0afcfb641c9";
        const url = `https://8x8.vc/${JAAS_APP_ID}/${roomName}`
          + `#config.prejoinPageEnabled=false`
          + `&config.disableDeepLinking=true`;

        functions.logger.info(`Jitsi room ready: ${url}`);
        return res.status(200).json({ url, name: roomName });

      } catch (err) {
        functions.logger.error("Meeting room creation failed", err);
        return res.status(500).json({ error: err.message });
      }
    }

    // ── API key early validation (quiz + paper only) ───────────
    if (!GROQ_API_KEY) {
      functions.logger.error(
        "GROQ_API_KEY is not set. " +
        "Add it to functions/.env as: GROQ_API_KEY=gsk_..."
      );
      return res.status(500).json({
        error:
          "Server configuration error: Groq API key is not set. " +
          "Get a free key at https://console.groq.com then add GROQ_API_KEY=gsk_... to functions/.env and restart the emulator.",
      });
    }

    try {
      let result;

      // ── VALIDATE BRANCH — Subject-Topic Relevance Check ─────────
      // Direct Groq call (not via callGroq) because this expects a
      // plain YES/NO string, not the JSON schema enforced elsewhere.
      // Returns { valid: true/false } to the frontend without spending
      // tokens on full quiz generation when the topic is irrelevant.
      if (type === "validate") {
        const subj = String(body.subject || "").trim();
        const tpc  = String(body.topic   || "").trim();

        // If either field is empty, pass through — form validation handles it
        if (!subj || !tpc) return res.status(200).json({ valid: true });

        const validateRes = await fetch(GROQ_URL, {
          method:  "POST",
          headers: {
            "Content-Type":  "application/json",
            "Authorization": `Bearer ${GROQ_API_KEY}`
          },
          body: JSON.stringify({
            model:       GROQ_MODEL,
            temperature: 0.1,
            max_tokens:  5,
            messages: [{
              role:    "user",
              content: `Is "${tpc}" a genuinely relevant academic topic that would appear in a standard university-level course on "${subj}"? Answer with ONLY the single word YES or NO and absolutely nothing else.`
            }]
          })
        });

        const vData  = await validateRes.json();
        const answer = (vData?.choices?.[0]?.message?.content || "YES").trim().toUpperCase();
        const valid  = answer.startsWith("YES");

        functions.logger.info(
          `Topic validation: subject="${subj}" topic="${tpc}" → ${valid ? "VALID" : "INVALID"}`
        );
        return res.status(200).json({ valid });
      }
      // ─────────────────────────────────────────────────────────────

      if (type === "quiz") {
        // ══════════════════════════════════════════════════════
        // QUIZ BRANCH
        // ══════════════════════════════════════════════════════
        const subject     = String(body.subject     || "");
        const format      = String(body.format      || "MCQs");   // "MCQs"|"Short"|"Mixed"
        const count       = Math.min(Math.max(parseInt(body.count, 10) || 5, 1), 20);
        const description = String(body.description || "");

        functions.logger.info(`Quiz params`, { subject, topic, difficulty, format, count });

        const prompt  = buildQuizPrompt({ subject, topic, difficulty, format, count, description });
        const rawText = await callGroq(prompt);

        functions.logger.info(`Groq quiz raw response (first 300 chars): ${rawText.slice(0, 300)}`);

        // Layer 3: parse + normalise
        const parsed = parseJSONSafe(rawText);
        result = normalizeQuizResponse(parsed);

        functions.logger.info(`Quiz normalised: ${result.questions.length} questions`);

      } else if (type === "paper") {
        // ══════════════════════════════════════════════════════
        // PAPER BRANCH
        // All fields sent by teacher.js triggerPaperGen() are
        // extracted here and forwarded to buildPaperPrompt().
        // ══════════════════════════════════════════════════════
        const instructor     = String(body.instructor   || "");
        const university     = String(body.university   || "");
        const subjectName    = String(body.subjectName  || topic);
        const program        = String(body.program      || "BSCS");
        const semester       = String(body.semester     || "N/A");
        const examType       = String(body.examType     || "Mid Term Examination");
        const examDate       = String(body.examDate     || "");
        const duration       = String(body.duration     || "3 Hours");
        const totalMarks     = String(body.totalMarks   || "75");
        const topics         = String(body.topics       || "");
        const clos           = String(body.clos         || "");
        const instructions   = String(body.instructions || "");
        const numQ           = parseInt(body.numQ, 10)  || 3;
        const questionConfig = Array.isArray(body.questionConfig) ? body.questionConfig : [];

        // Required field validation
        if (!instructor || !university || !subjectName || !topics || !clos) {
          return res.status(400).json({
            error:
              "Paper generation requires: instructor, university, subjectName, topics, and clos. " +
              "Check that all required fields are filled in the Teacher Dashboard.",
          });
        }

        if (questionConfig.length === 0) {
          return res.status(400).json({
            error:
              "Paper generation requires a non-empty 'questionConfig' array. " +
              "Each item must have a 'parts' array with {label, marks} objects.",
          });
        }

        // Validate each question has a non-empty parts array
        for (let i = 0; i < questionConfig.length; i++) {
          if (!Array.isArray(questionConfig[i]?.parts) || questionConfig[i].parts.length === 0) {
            return res.status(400).json({
              error: `questionConfig[${i}] is missing a non-empty 'parts' array.`,
            });
          }
        }

        functions.logger.info(`Paper params`, {
          instructor, subjectName, program, examType, numQ,
          totalParts: questionConfig.reduce((s, q) => s + q.parts.length, 0),
        });

        const prompt  = buildPaperPrompt({
          instructor, university, subjectName, program, semester,
          examType, examDate, duration, totalMarks,
          topics, clos, instructions, numQ, questionConfig,
        });
        const rawText = await callGroq(prompt);

        functions.logger.info(`Groq paper raw response (first 300 chars): ${rawText.slice(0, 300)}`);

        // Layer 3: parse + normalise to new schema
        const parsed = parseJSONSafe(rawText);
        result = normalizePaperResponse(parsed, questionConfig);

        functions.logger.info(`Paper normalised: ${result.questions.length} question(s)`);

      } else {
        return res.status(400).json({
          error: `Unknown type "${type}". Supported values: "quiz" or "paper".`,
        });
      }

      return res.status(200).json(result);

    } catch (err) {
      // Original catch block preserved; enhanced with type context.
      functions.logger.error(`generateAIContent error`, { type, message: err.message, stack: err.stack });
      return res.status(500).json({
        error: err.message || "AI content generation failed. Check Firebase function logs.",
      });
    }
  });
});

// ====================================================================
// submitAnswer — Callable function for server-authoritative quiz grading
// ====================================================================
// This is the trust boundary. The client cannot forge an answer; it must
// be validated and graded server-side.
// ====================================================================
exports.submitAnswer = functions.https.onCall(async (data, context) => {
  const { sessionId, questionId, answer, answerIndex } = data;

  // 1. Authenticate
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Sign in to answer.");
  }
  const uid = context.auth.uid;

  // 2. Load the question server-side — validate state and timer
  const qRef = admin.firestore().doc(`sessions/${sessionId}/questions/${questionId}`);
  const qSnap = await qRef.get();
  if (!qSnap.exists()) {
    throw new functions.https.HttpsError("not-found", "Question not found.");
  }

  const q = qSnap.data();
  if (q.state !== "open") {
    throw new functions.https.HttpsError("failed-precondition", "QUESTION_CLOSED");
  }

  // 3. Server-authoritative timer: browser's countdown is decoration
  if (q.closesAt) {
    const nowMs = Date.now();
    const closesAtMs = q.closesAt.toMillis ? q.closesAt.toMillis() : q.closesAt;
    if (nowMs > closesAtMs + 500) {  // +500ms grace period for network latency
      throw new functions.https.HttpsError("failed-precondition", "QUESTION_CLOSED");
    }
  }

  // 4. Verify student is enrolled in this session's course (TODO: implement enrollment check)
  // For now, trust Firestore rules will deny if unauthorized.

  // 5. Load the answer key — student cannot see this
  const keyRef = admin.firestore().doc(`sessions/${sessionId}/questions/${questionId}/private/key`);
  const keySnap = await keyRef.get();
  if (!keySnap.exists()) {
    functions.logger.warn(`No key found for question ${questionId}`, { sessionId });
    throw new functions.https.HttpsError("not-found", "Question key not found.");
  }

  const key = keySnap.data();

  // 6. Grade: compute isCorrect based on question type
  let isCorrect = false;
  if (q.type === "mcq") {
    isCorrect = answerIndex === key.correctIndex;
  } else if (q.type === "short") {
    // Short answers: no auto-grading. Mark as submitted, grade = 0 until teacher reviews.
    isCorrect = null;
  }

  // 7. Deterministic ID prevents double-submit: create() throws if doc exists
  const answerId = `${questionId}_${uid}`;
  const answerRef = admin.firestore().doc(`sessions/${sessionId}/answers/${answerId}`);

  try {
    await answerRef.create({
      questionId,
      studentId: uid,
      answer,
      answerIndex: q.type === "mcq" ? answerIndex : null,
      isCorrect,
      marks: isCorrect ? q.marks : 0,
      answeredAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  } catch (err) {
    if (err.code === "already-exists") {
      throw new functions.https.HttpsError("already-exists", "You have already answered this question.");
    }
    throw err;
  }

  return { ok: true, isCorrect, marks: isCorrect ? q.marks : 0 };
});