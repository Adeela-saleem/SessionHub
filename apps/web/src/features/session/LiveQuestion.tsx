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
export function LiveQuestion({ question, results, onAnswered }: {
  question: PublicQuestion | null;
  results: QuestionResults | null;
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
    return (
      <div className="lq" aria-live="polite">
        <div className="lq-head">
          <span className="t-label">Results</span>
          <Badge tone="neutral">{results.correctCount} of {results.totalAnswers} correct</Badge>
        </div>
        <p className="lq-prompt">{results.prompt}</p>

        <ul className="lq-results">
          {results.distribution.map((d) => {
            const isCorrect = d.index === results.correctIndex;
            const mine = d.index === choice;
            return (
              <li key={d.index} className={isCorrect ? 'is-correct' : mine ? 'is-mine' : ''}>
                <span className="lq-key">{String.fromCharCode(65 + d.index)}</span>
                <span className="lq-opt-label">
                  {d.label}
                  {isCorrect && <span className="lq-mark"><IconCheck size={13} />Correct</span>}
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
        icon={<IconClock size={20} />}
        title="Waiting for the next question"
        description="Your teacher hasn't opened one yet. Keep this page open — the question will appear here the moment it goes live."
      />
    );
  }

  /* ── Answering ──────────────────────────────────────── */
  const canSubmit = question.type === 'MCQ' ? choice !== null : text.trim().length > 0;

  return (
    <div className="lq" aria-live="polite">
      <div className="lq-head">
        <span className="t-label">Question {question.order} · {question.marks} {question.marks === 1 ? 'mark' : 'marks'}</span>
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
        <Button block size="lg" loading={busy} disabled={expired || !canSubmit} onClick={submit}>
          {expired ? 'Time is up' : 'Submit answer'}
        </Button>
      )}
    </div>
  );
}
