import { useEffect, useMemo, useState } from 'react';
import { api, ApiError } from '../../lib/api';
import type { PublicQuestion, QuestionResults } from '../../lib/types';
import { Badge, Banner, Button, EmptyState, Textarea } from '../../components/ui';
import { IconCheck, IconClock } from '../../components/icons';

/* ============================================================
   The student's answering surface.
   Note what this component never receives: a correct answer.
   `PublicQuestion` has no such field, and results only arrive
   on `question:closed`, after the server has closed it.
   ============================================================ */
export function LiveQuestion({ question, results, myAnswer, onRecord, onAnswered }: {
  question: PublicQuestion | null;
  results: QuestionResults | null;
  /**
   * What this student submitted for the question the results describe.
   * Held by the caller (the session context) because local state here is
   * reset when the question changes — which happens before results arrive.
   */
  myAnswer?: number | string | null;
  onRecord?: (questionId: string, value: number | string) => void;
  onAnswered?: () => void;
}) {
  const [choice, setChoice] = useState<number | null>(null);
  const [text, setText] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [remaining, setRemaining] = useState<number | null>(null);

  useEffect(() => {
    setChoice(null); setText(''); setSubmitted(false); setError('');
    setRemaining(question?.remainingSeconds ?? null);
  }, [question?.id]);

  // Presentation-only countdown. The server owns the real deadline, so a
  // backgrounded tab or a wrong device clock changes nothing about what
  // is accepted.
  useEffect(() => {
    if (remaining === null || submitted || remaining <= 0) return;
    const t = window.setTimeout(() => setRemaining((r) => (r === null ? null : r - 1)), 1000);
    return () => window.clearTimeout(t);
  }, [remaining, submitted]);

  const urgent = remaining !== null && remaining <= 10;
  const expired = remaining !== null && remaining <= 0;

  const pct = useMemo(() => {
    if (remaining === null || !question?.remainingSeconds) return 0;
    return Math.max(0, Math.min(100, (remaining / question.remainingSeconds) * 100));
  }, [remaining, question?.remainingSeconds]);

  async function submit() {
    if (!question) return;
    setBusy(true); setError('');
    try {
      await api.post(
        `/questions/${question.id}/answer`,
        question.type === 'MCQ' ? { answerIndex: choice } : { answerText: text },
      );
      setSubmitted(true);
      onRecord?.(question.id, question.type === 'MCQ' ? (choice as number) : text.trim());
      onAnswered?.();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setSubmitted(true);
        setError('You have already answered this question.');
      } else {
        setError(err instanceof ApiError ? err.message : 'Could not submit your answer. Check your connection and try again.');
      }
    } finally {
      setBusy(false);
    }
  }

  /* ── Reveal ─────────────────────────────────────────── */
  if (results) {
    const total = results.totalAnswers || 1;
    // A short-answer question has no options, so a distribution list
    // would render empty. It gets its own reveal instead.
    const isShort = results.distribution.length === 0;
    // The context remembers what was submitted; local `choice` was reset
    // when the question closed, so it only serves as a fallback.
    const mineIndex = typeof myAnswer === 'number' ? myAnswer : choice;
    const mineText = typeof myAnswer === 'string' ? myAnswer : null;

    if (isShort) {
      return (
        <div className="lq" aria-live="polite">
          <div className="lq-head">
            <span className="lq-kicker">Result</span>
            <Badge tone="neutral">{results.totalAnswers} answered</Badge>
          </div>
          <p className="lq-prompt">{results.prompt}</p>

          {mineText ? (
            <div className="lq-short-mine">
              <span className="t-label">Your answer</span>
              <p>{mineText}</p>
            </div>
          ) : (
            <p className="lq-short-none">
              You did not submit an answer before this question closed.
            </p>
          )}

          {results.explanation ? (
            <div className="lq-explain">
              <span className="t-label">What your teacher was looking for</span>
              <p>{results.explanation}</p>
            </div>
          ) : (
            <p className="lq-short-none">
              Written answers are marked by your teacher, so there is no automatic verdict here.
            </p>
          )}
        </div>
      );
    }

    return (
      <div className="lq" aria-live="polite">
        <div className="lq-head">
          <span className="lq-kicker">Result</span>
          <Badge tone="neutral">{results.correctCount} of {results.totalAnswers} correct</Badge>
        </div>
        <p className="lq-prompt">{results.prompt}</p>

        <ul className="lq-results">
          {results.distribution.map((d) => {
            const isCorrect = d.index === results.correctIndex;
            const mine = d.index === mineIndex;
            return (
              <li key={d.index} className={isCorrect ? 'is-correct' : mine ? 'is-mine' : ''}>
                <span className="lq-key">{String.fromCharCode(65 + d.index)}</span>
                <span className="lq-opt-label">
                  {d.label}
                  {isCorrect && (
                    <span className="lq-mark"><IconCheck size={13} />{mine ? 'Correct — your answer' : 'Correct'}</span>
                  )}
                  {mine && !isCorrect && <span className="lq-mark lq-mark-mine">Your answer</span>}
                </span>
                <span className="lq-bar"><i style={{ width: `${(d.count / total) * 100}%` }} /></span>
                <span className="lq-count t-num">{d.count}</span>
              </li>
            );
          })}
        </ul>

        {results.explanation && (
          <div className="lq-explain">
            <span className="t-label">Why</span>
            <p>{results.explanation}</p>
          </div>
        )}
      </div>
    );
  }

  /* ── Waiting ────────────────────────────────────────── */
  if (!question) {
    return (
      <EmptyState
        icon={<IconClock size={18} />}
        title="Waiting for the next question"
        description="Your teacher hasn't opened one yet. Keep this page open — it appears here the moment it goes live."
      />
    );
  }

  /* ── Answering ──────────────────────────────────────── */
  const canSubmit = question.type === 'MCQ' ? choice !== null : text.trim().length > 0;

  return (
    <div className="lq" aria-live="polite">
      <div className="lq-head">
        <span className="lq-kicker">Question {question.order}<span className="t-muted"> · {question.marks} {question.marks === 1 ? 'mark' : 'marks'}</span></span>
        {remaining !== null && (
          <span className={`lq-timer ${urgent ? 'is-urgent' : ''}`.trim()}>
            <IconClock size={14} />{Math.max(0, remaining)}s
          </span>
        )}
      </div>

      {remaining !== null && (
        <div
          className="lq-track"
          role="progressbar"
          aria-valuenow={Math.max(0, remaining)}
          aria-valuemin={0}
          aria-valuemax={question.remainingSeconds ?? 0}
          aria-label="Time remaining"
        >
          <i className={urgent ? 'is-urgent' : ''} style={{ width: `${pct}%` }} />
        </div>
      )}

      <p className="lq-prompt">{question.prompt}</p>

      {question.type === 'MCQ' ? (
        <div className="lq-options" role="radiogroup" aria-label="Answer options">
          {question.options.map((opt, i) => (
            <button
              key={i}
              type="button"
              role="radio"
              aria-checked={choice === i}
              className={`lq-opt ${choice === i ? 'is-selected' : ''}`.trim()}
              disabled={submitted || expired}
              onClick={() => setChoice(i)}
            >
              <span className="lq-key">{String.fromCharCode(65 + i)}</span>
              <span className="lq-opt-label">{opt}</span>
            </button>
          ))}
        </div>
      ) : (
        <Textarea
          rows={5}
          value={text}
          disabled={submitted || expired}
          aria-label="Your answer"
          placeholder="Type your answer…"
          onChange={(e) => setText(e.target.value)}
        />
      )}

      {error && <Banner tone="error">{error}</Banner>}

      {submitted ? (
        <Banner tone="success" title="Answer recorded">
          Waiting for your teacher to close the question and reveal the result.
        </Banner>
      ) : (
        <div className="lq-actions">
          <span className="t-caption t-muted">
            {question.type === 'MCQ' ? 'Choose one option, then submit.' : 'Write your answer, then submit.'}
          </span>
          <Button size="lg" loading={busy} disabled={expired || !canSubmit} onClick={submit}>
            {expired ? 'Time is up' : 'Submit answer'}
          </Button>
        </div>
      )}
    </div>
  );
}
