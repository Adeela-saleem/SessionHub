import {
  BadGatewayException, Injectable, Logger, ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { QuestionType } from '@prisma/client';

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

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
    const raw = await this.callGroq(this.buildQuizPrompt(params));
    return this.normaliseQuiz(raw, params.count);
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
  private async callGroq(userPrompt: string): Promise<unknown> {
    const apiKey = this.config.get<string>('GROQ_API_KEY');
    if (!apiKey) {
      throw new ServiceUnavailableException(
        'AI generation is not configured. Set GROQ_API_KEY to enable it.',
      );
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 45_000);

    try {
      const res = await fetch(GROQ_URL, {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: this.config.get('GROQ_MODEL', 'llama-3.1-8b-instant'),
          temperature: 0.7,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: SYSTEM_INSTRUCTION },
            { role: 'user', content: userPrompt },
          ],
        }),
      });

      if (!res.ok) {
        this.logger.error(`Groq responded ${res.status}: ${await res.text()}`);
        throw new BadGatewayException('The AI provider rejected the request');
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
  private normaliseQuiz(raw: unknown, expected: number): GeneratedQuestion[] {
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
    return out;
  }

  private clampMarks(v: unknown): number {
    const n = Number(v);
    return Number.isInteger(n) && n >= 1 && n <= 100 ? n : 1;
  }
}
