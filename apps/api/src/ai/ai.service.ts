import {
  BadGatewayException, HttpException, Injectable, Logger, ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  GeneratedPaper, GeneratedPaperQuestion, PaperDataTable, PaperFields, PaperQuestionConfig,
} from './paper.types';
import { QuestionType } from '@prisma/client';

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

/** Groq retired the Llama 3.1 models; gpt-oss-120b is the most
    token-efficient of what the free tier now offers. */
const DEFAULT_MODEL = 'openai/gpt-oss-120b';

/**
 * Groq applies a default output ceiling when none is sent, and in strict
 * JSON mode a reply cut at that ceiling is rejected as invalid JSON. The
 * budget is therefore sized to the request. The cap keeps a single call
 * inside the free tier's 8,000 tokens-per-minute allowance, so a 50-question
 * draft fits in one call but not two in the same minute.
 *
 * gpt-oss is a reasoning model and its hidden reasoning counts against
 * this ceiling. At the default effort it spent the whole budget thinking
 * and returned one or two questions of five; at low effort it uses about
 * 150 tokens, which the constant term covers.
 */
const MAX_COMPLETION_TOKENS = 7_000;
const REASONING_HEADROOM = 600;
const quizBudget = (count: number) => Math.min(MAX_COMPLETION_TOKENS, REASONING_HEADROOM + 130 * count);
/** A lab question carries a longer problem statement and a data table,
    so it is given roughly twice the room of a terminal question. */
const paperBudget = (questions: number, subparts: number, lab: boolean) =>
  Math.min(
    MAX_COMPLETION_TOKENS,
    REASONING_HEADROOM + (lab ? 380 : 170) * questions + 110 * subparts,
  );

/**
 * Models miss "exactly N" in both directions, and a malformed item is
 * dropped in normalisation. Asking for a fifth more and trimming back to
 * N means a teacher who asks for five gets five, not three.
 */
const overAsk = (count: number) => count + Math.max(1, Math.ceil(count * 0.2));

/** Contract the model is held to. Anything else is rejected, not patched. */
const SYSTEM_INSTRUCTION = [
  'You are a strict JSON-only academic content API for a university platform.',
  'Rules, all mandatory:',
  '1. Your entire response is one valid JSON object and nothing else.',
  '2. No markdown fences, no preamble, no commentary.',
  '3. Use exactly the specified key names. No synonyms.',
  '4. Every required field is present in every object.',
  '5. Integers are integers, not strings.',
].join('\n');

export interface GeneratedQuestion {
  prompt: string;
  type: QuestionType;
  options: string[];
  correctIndex: number | null;
  explanation: string;
  marks: number;
}

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  constructor(private config: ConfigService) {}

  async generateQuiz(params: {
    topic: string; subject?: string; difficulty: 'Easy' | 'Medium' | 'Hard';
    format: 'MCQ' | 'SHORT' | 'MIXED'; count: number; notes?: string;
  }): Promise<GeneratedQuestion[]> {
    const ask = overAsk(params.count);
    const raw = await this.callGroq(this.buildQuizPrompt({ ...params, count: ask }), quizBudget(ask));
    return this.normaliseQuiz(raw, params.count, params.format);
  }

  // ── Prompt ──────────────────────────────────────────────────
  private buildQuizPrompt(p: {
    topic: string; subject?: string; difficulty: string;
    format: string; count: number; notes?: string;
  }) {
    const mcq = p.format === 'MCQ' ? p.count : p.format === 'MIXED' ? Math.ceil(p.count / 2) : 0;
    const short = p.count - mcq;
    const marks = p.difficulty === 'Easy' ? '1-2' : p.difficulty === 'Hard' ? '3-5' : '2-3';

    return [
      `Generate exactly ${p.count} university-level quiz questions.`,
      p.subject ? `Subject: ${p.subject}` : null,
      `Topic: ${p.topic}`,
      `Difficulty: ${p.difficulty}`,
      p.notes ? `Teacher notes: ${p.notes}` : null,
      '',
      'COUNTS — generate exactly these:',
      mcq > 0 ? `  ${mcq} multiple choice` : null,
      short > 0 ? `  ${short} short answer` : null,
      '',
      'FIELD RULES:',
      '  MCQ   -> "type":"MCQ", options: exactly 4 strings, correctIndex: 0-3',
      '  Short -> "type":"SHORT", options: [], correctIndex: -1',
      `  marks: integer in ${marks}; vary them, do not repeat one value`,
      '  prompt: a complete, self-contained question sentence',
      '  explanation: one or two sentences justifying the correct answer',
      '',
      'Respond with exactly this shape:',
      '{"questions":[{"prompt":"...","type":"MCQ","options":["a","b","c","d"],"correctIndex":2,"explanation":"...","marks":2}]}',
    ].filter(Boolean).join('\n');
  }

  // ── Transport ───────────────────────────────────────────────
  private async callGroq(userPrompt: string, maxCompletionTokens: number): Promise<unknown> {
    const apiKey = this.config.get<string>('GROQ_API_KEY');
    if (!apiKey) {
      throw new ServiceUnavailableException(
        'AI generation is not configured. Set GROQ_API_KEY to enable it.',
      );
    }

    const model = this.config.get<string>('GROQ_MODEL', DEFAULT_MODEL);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 45_000);

    try {
      const res = await fetch(GROQ_URL, {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model,
          temperature: 0.7,
          max_completion_tokens: maxCompletionTokens,
          // Only the gpt-oss family accepts this knob on Groq.
          ...(model.startsWith('openai/gpt-oss') && { reasoning_effort: 'low' }),
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: SYSTEM_INSTRUCTION },
            { role: 'user', content: userPrompt },
          ],
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        this.logger.error(`Groq responded ${res.status}: ${text}`);
        throw this.describeProviderError(res.status, text);
      }

      const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      const content = body.choices?.[0]?.message?.content;
      if (!content) throw new BadGatewayException('The AI provider returned an empty response');

      return this.parseJsonLoosely(content);
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        throw new ServiceUnavailableException('The AI provider timed out. Try again.');
      }
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * The two provider failures a teacher can do something about get a
   * plain-language message; everything else stays a generic 502 so
   * provider internals never reach the browser.
   */
  private describeProviderError(status: number, text: string): HttpException {
    let code = '';
    try { code = String((JSON.parse(text) as { error?: { code?: string } }).error?.code ?? ''); } catch { /* not JSON */ }

    if (status === 429) {
      return new ServiceUnavailableException(
        'The AI provider\'s per-minute limit was reached. Wait a minute and try again.',
      );
    }
    if (status === 400 && code === 'json_validate_failed') {
      return new BadGatewayException(
        'The AI reply was cut off before it finished. Ask for fewer questions and try again.',
      );
    }
    if (status === 404 && code === 'model_not_found') {
      return new ServiceUnavailableException(
        'The configured AI model is not available. Check GROQ_MODEL.',
      );
    }
    return new BadGatewayException('The AI provider rejected the request');
  }

  /** Models still wrap JSON in fences occasionally; salvage that one case. */
  private parseJsonLoosely(text: string): unknown {
    const cleaned = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
    const start = cleaned.search(/[{[]/);
    const end = Math.max(cleaned.lastIndexOf('}'), cleaned.lastIndexOf(']'));
    if (start === -1 || end === -1) throw new BadGatewayException('AI response was not JSON');
    try {
      return JSON.parse(cleaned.slice(start, end + 1));
    } catch {
      throw new BadGatewayException('AI response was not valid JSON');
    }
  }

  // ── Validation ──────────────────────────────────────────────
  /**
   * Every field is checked before it can reach a teacher's screen.
   * An LLM marking the wrong option correct in front of a class is the
   * failure that costs trust, so a malformed question is dropped rather
   * than repaired with a guess.
   */
  private normaliseQuiz(raw: unknown, expected: number, format: string): GeneratedQuestion[] {
    const list = (raw as { questions?: unknown[] })?.questions;
    if (!Array.isArray(list) || list.length === 0) {
      throw new BadGatewayException('The AI returned no questions');
    }

    const out: GeneratedQuestion[] = [];
    for (const item of list) {
      const q = item as Record<string, unknown>;
      const prompt = typeof q.prompt === 'string' ? q.prompt.trim() : '';
      if (!prompt) continue;

      const isMcq = String(q.type ?? '').toUpperCase() === 'MCQ';
      const options = Array.isArray(q.options)
        ? q.options.filter((o): o is string => typeof o === 'string' && o.trim() !== '')
        : [];

      if (isMcq) {
        if (options.length < 2) continue;
        const idx = Number(q.correctIndex);
        if (!Number.isInteger(idx) || idx < 0 || idx >= options.length) continue;
        out.push({
          prompt, type: QuestionType.MCQ, options,
          correctIndex: idx,
          explanation: typeof q.explanation === 'string' ? q.explanation.trim() : '',
          marks: this.clampMarks(q.marks),
        });
      } else {
        out.push({
          prompt, type: QuestionType.SHORT, options: [], correctIndex: null,
          explanation: typeof q.explanation === 'string' ? q.explanation.trim() : '',
          marks: this.clampMarks(q.marks),
        });
      }
    }

    if (out.length === 0) {
      throw new BadGatewayException('The AI response did not contain any usable questions');
    }
    if (out.length < expected) {
      this.logger.warn(`Asked for ${expected} questions, ${out.length} passed validation`);
    }
    return this.trimToRequested(out, expected, format);
  }

  /**
   * Models overshoot "exactly N" often enough that the count must be
   * enforced here: the teacher asked for N and the broadcast endpoint
   * accepts at most 50. The requested mix is honoured first, then any
   * shortfall is filled from whatever else came back, in order.
   */
  private trimToRequested(list: GeneratedQuestion[], expected: number, format: string): GeneratedQuestion[] {
    if (list.length <= expected) return list;
    const wantMcq = format === 'MCQ' ? expected : format === 'MIXED' ? Math.ceil(expected / 2) : 0;
    const wantShort = expected - wantMcq;

    const mcq = list.filter((q) => q.type === QuestionType.MCQ).slice(0, wantMcq);
    const short = list.filter((q) => q.type === QuestionType.SHORT).slice(0, wantShort);
    const chosen = new Set<GeneratedQuestion>([...mcq, ...short]);
    for (const q of list) {
      if (chosen.size >= expected) break;
      chosen.add(q);
    }
    // Keep the model's original ordering so MCQ/short interleave as written.
    return list.filter((q) => chosen.has(q));
  }

  private clampMarks(v: unknown): number {
    const n = Number(v);
    return Number.isInteger(n) && n >= 1 && n <= 100 ? n : 1;
  }

  /* ============================================================
     EXAM PAPER
     Prompt carried over verbatim from the legacy Cloud Function so
     generated papers match the ones the department already uses.
     ============================================================ */

  async generatePaper(fields: PaperFields, questionConfig: PaperQuestionConfig[]): Promise<GeneratedPaper> {
    const lab = fields.paperType === 'LAB';
    const subparts = questionConfig.reduce((n, q) => n + q.parts.length, 0);
    const raw = await this.callGroq(
      lab ? this.buildLabPaperPrompt(fields, questionConfig) : this.buildPaperPrompt(fields, questionConfig),
      paperBudget(questionConfig.length, subparts, lab),
    );
    return {
      fields,
      questionConfig,
      questions: this.normalisePaper(raw, questionConfig),
    };
  }

  /**
   * Lab paper — modelled on the department's "Lab paper" sheet: each
   * question is a long practical problem statement, usually with a small
   * table of invented data, followed by a "You are required to:" list of
   * implementation tasks. LLOs take the place of CLOs.
   */
  private buildLabPaperPrompt(f: PaperFields, questionConfig: PaperQuestionConfig[]) {
    const qSpec = questionConfig.map((q) =>
      `Question ${q.num}: maps to LLO ${q.clo}, Bloom's level ${q.btl}, has ${q.parts.length} tasks labeled ` +
      `${q.parts.map((p) => p.label).join(',')} worth marks [${q.parts.map((p) => p.marks).join(', ')}] respectively.`,
    ).join('\n');

    return `You are an expert university LAB examination paper setter. Generate a completely new, practical, university-level lab examination paper in strict JSON format only — no markdown, no backticks, no preamble, no commentary.

CONTEXT:
Subject: ${f.subjectName}
Program: ${f.program}
Semester: ${f.semester}
Exam Type: Lab Examination
Topics to cover — STRICT SCOPE: generate questions ONLY from these topics, no others:
${f.topics}
Lab Learning Outcomes (LLOs) — ALL questions must trace to these LLOs, no others:
${f.clos}

STRICT CURRICULUM SCOPE RULES (mandatory, non-negotiable):
A. Every problem statement, every task, and every algorithm or technique used MUST derive exclusively from the topics listed above. Do NOT introduce any technique, library, framework or concept that is not explicitly listed in the topics.
B. Every task must be directly traceable to both (i) at least one topic above and (ii) the LLO number assigned to its question. If it cannot be traced to BOTH, rewrite it.
C. Do NOT hallucinate or extrapolate beyond the provided curriculum.

RULES:
1. There are ${questionConfig.length} questions. Each question is a hands-on problem the student solves at a computer during the lab exam. Give EACH question a COMPLETELY DIFFERENT real-world setting (campus navigation, a shopping mall's customers, a hospital ward, a delivery fleet, a weather station, a library catalogue, and so on). No two questions may share a setting.
2. "scenario": a 4-8 sentence problem statement written directly to the student ("You are a ..."). It must describe the setting, the data available, the goal, and end by naming the exact technique or algorithm from the topics list that the student is to apply.
3. "dataTable": when the problem needs data, include a small table of realistic invented values with a one-sentence "caption" that introduces it (e.g. "The buildings and their walking times are as follows:"), 2-5 "columns" and 3-8 "rows"; every cell is a short string. When the problem needs no data, set "dataTable" to null.
4. "subparts" is the "You are required to:" list. Each item is an imperative task — implement, compute, return, compare, explain the observed result, or say how the result changes if a value in the table changes. The last task may ask the student to write observations in the provided answer sheet. Tasks must be solvable from the scenario and table alone.
5. Follow this exact per-question spec — do NOT change LLO, Bloom's level, task labels, or marks — only write the scenario, table and task text:
${qSpec}
6. LLO-TO-QUESTION STRICT ALIGNMENT: every task of a question must belong to the content domain of the LLO number(s) assigned to that question. Cross-mapping is forbidden.
7. Do NOT provide any answers, code or solutions.
8. CRITICAL JSON FORMATTING: every string value must be plain text on a single line with no literal line breaks inside it. Do not use unescaped double quotes inside string values (use single quotes). Use only plain ASCII punctuation and the characters "->" for arrows. Output must be valid, complete, parseable JSON with no truncation.

Return ONLY valid JSON matching exactly this schema, nothing else:
{
  "questions": [
    {
      "questionNumber": 1,
      "scenario": "4-8 sentence problem statement — single line, no literal newlines",
      "dataTable": {"caption": "one sentence introducing the table", "columns": ["Col A", "Col B"], "rows": [["r1a", "r1b"], ["r2a", "r2b"]]},
      "estimatedTimeMinutes": 30,
      "subparts": [
        {"label": "a", "text": "complete task text only — no marks or LLO mentioned"},
        {"label": "b", "text": "complete task text only"}
      ]
    }
  ]
}`;
  }

  private buildPaperPrompt(f: PaperFields, questionConfig: PaperQuestionConfig[]) {
    const qSpec = questionConfig.map((q) =>
      `Question ${q.num}: maps to CLO ${q.clo}, BTL ${q.btl}, has ${q.parts.length} subparts labeled ` +
      `${q.parts.map((p) => p.label).join(',')} worth marks [${q.parts.map((p) => p.marks).join(', ')}] respectively.`,
    ).join('\n');

    return `You are an expert university examination paper setter. Generate a completely new, professional, university-level terminal examination paper in strict JSON format only — no markdown, no backticks, no preamble, no commentary.

CONTEXT:
Subject: ${f.subjectName}
Program: ${f.program}
Semester: ${f.semester}
Exam Type: ${f.examType}
Topics to cover — STRICT SCOPE: generate questions ONLY from these topics, no others:
${f.topics}
Course Learning Outcomes — ALL questions must trace to these CLOs, no others:
${f.clos}

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
4. CLO-TO-QUESTION STRICT ACADEMIC ALIGNMENT: Each question above is pre-assigned a CLO number that maps to one of the teacher's declared Course Learning Outcomes for the subject "${f.subjectName}". You MUST ensure that the question scenario, context, and ALL subparts are academically aligned exclusively to the content domain of that specific numbered CLO. Cross-mapping is strictly forbidden — a question assigned to CLO 2 (e.g., "Apply software design principles") must test ONLY software design skills, NOT requirements engineering, testing, or project management. A question assigned to CLO 3 (e.g., "Analyze testing strategies") must involve testing concepts exclusively. Verify every subpart independently: if any subpart drifts outside its assigned CLO domain, rewrite it. The CLO-to-question assignment is absolute and non-negotiable.
5. Do NOT provide any answers or solutions.
6. Never reuse question wording from generic textbooks; every question must be original and scenario-driven.
7. CRITICAL JSON FORMATTING: every string value must be plain text on a single line with no literal line breaks inside it — use a single space instead of a newline. Do not use unescaped double quotes inside string values (use single quotes for emphasis). Use only plain ASCII punctuation. Output must be valid, complete, parseable JSON with no truncation.
8. "title" is a 2-5 word heading naming the theme of the question (for example 'Requirement Phase' or 'Transaction Isolation'). It is printed in bold under the question line.

Return ONLY valid JSON matching exactly this schema, nothing else:
{
  "questions": [
    {
      "questionNumber": 1,
      "title": "2-5 word heading",
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

  /**
   * Rebuilds the model's reply into the exact shape the renderer needs.
   * Labels and marks are always taken from questionConfig — the model
   * drifts on them, and they are the marking scheme.
   */
  private normalisePaper(raw: unknown, questionConfig: PaperQuestionConfig[]): GeneratedPaperQuestion[] {
    if (!raw || typeof raw !== 'object') {
      throw new BadGatewayException('The AI response was not a JSON object');
    }
    const questions = (raw as { questions?: unknown }).questions;
    if (!Array.isArray(questions) || questions.length === 0) {
      throw new BadGatewayException("The AI response had no 'questions' array");
    }

    return questionConfig.map((cfg, qi) => {
      const aiQ = (questions[qi]
        ?? questions.find((q) => (q as { questionNumber?: number })?.questionNumber === cfg.num)
        ?? {}) as Record<string, unknown>;

      const scenario = String(aiQ.scenario ?? aiQ.context ?? aiQ.premise ?? '').trim()
        || 'Analyze the described system and answer the following questions.';

      const title = String(aiQ.title ?? aiQ.heading ?? '').trim().slice(0, 80) || undefined;
      const dataTable = this.normaliseDataTable(aiQ.dataTable ?? aiQ.table);

      const estimatedTimeMinutes = Math.max(
        5,
        parseInt(String(aiQ.estimatedTimeMinutes ?? aiQ.estimatedTime ?? 15), 10) || 15,
      );

      const aiSubparts: Record<string, unknown>[] =
        Array.isArray(aiQ.subparts) ? aiQ.subparts as Record<string, unknown>[]
        : Array.isArray(aiQ.parts) ? aiQ.parts as Record<string, unknown>[]
        : [];

      const subparts = cfg.parts.map((part, pi) => {
        const aiPart = (aiSubparts.find(
          (p) => String(p.label ?? '').toLowerCase() === part.label.toLowerCase(),
        ) ?? aiSubparts[pi] ?? {}) as Record<string, unknown>;

        const text = String(
          aiPart.text ?? aiPart.content ?? aiPart.question ?? aiPart.description ?? '',
        ).trim();

        if (!text) {
          this.logger.warn(`Q${qi + 1}(${part.label}): subpart text missing from the AI reply`);
        }

        return {
          label: part.label,
          text: text || `Explain a key concept for part (${part.label}).`,
        };
      });

      return {
        questionNumber: cfg.num, title, scenario, dataTable, estimatedTimeMinutes, subparts,
      };
    });
  }

  /**
   * A data table is optional and purely illustrative, so a malformed one
   * is dropped rather than the whole paper rejected. Sizes are capped to
   * what fits on the printed sheet.
   */
  private normaliseDataTable(raw: unknown): PaperDataTable | null {
    if (!raw || typeof raw !== 'object') return null;
    const t = raw as Record<string, unknown>;
    const cell = (v: unknown) => String(v ?? '').trim().slice(0, 60);
    const columns = Array.isArray(t.columns) ? t.columns.map(cell).filter(Boolean).slice(0, 6) : [];
    if (columns.length < 2) return null;
    const rows = (Array.isArray(t.rows) ? t.rows : [])
      .filter((r): r is unknown[] => Array.isArray(r) && r.length > 0)
      .slice(0, 12)
      .map((r) => columns.map((_, i) => cell(r[i])));
    if (rows.length === 0) return null;
    const caption = typeof t.caption === 'string' ? t.caption.trim().slice(0, 200) : '';
    return { ...(caption && { caption }), columns, rows };
  }

}
