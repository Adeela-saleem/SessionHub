import { lazy, Suspense, useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../../lib/api';
import type { DraftQuestion, SavedQuiz, SavedQuizDetail } from '../../lib/types';
import { relativeTime } from '../../lib/format';
import { MAX_MARKS, MAX_QUESTIONS } from '../../lib/limits';
import { useLiveSession } from '../../features/session/LiveSessionContext';
import {
  Badge, Banner, Button, Checkbox, ConfirmDialog, EmptyState, Input,
  LinkButton, Modal, PageHeader, SectionHead, Segmented, SelectField, Skeleton, Textarea, TextField, useToast,
  NumberField, NumberInput,
} from '../../components/ui';
import { IconSparkle, IconTrash } from '../../components/icons';
import { pdfFileName } from '../../features/pdf/pdfText';
import type { PdfSource } from '../../features/pdf/PdfPane';
import type { QuizSheet } from '../../features/pdf/QuizDocument';

const PdfPane = lazy(() => import('../../features/pdf/PdfPane'));

/** Header details for the printed quiz sheet, remembered between visits. */
const SHEET_KEY = 'sessionhub.quiz.sheet';
const DEFAULT_SHEET: QuizSheet = {
  title: '', university: 'Jinnah University for Women', course: '', program: '',
  date: '', duration: '20 minutes',
  instructions: 'Attempt all questions.\nCircle the correct option for multiple-choice questions.',
};
function loadSheet(): QuizSheet {
  try {
    const raw = localStorage.getItem(SHEET_KEY);
    return raw ? { ...DEFAULT_SHEET, ...(JSON.parse(raw) as Partial<QuizSheet>) } : DEFAULT_SHEET;
  } catch { return DEFAULT_SHEET; }
}

/* ============================================================
   Quiz studio
   Generation is a draft, never a publish. Nothing reaches a
   student until the teacher has read every answer key and
   pressed broadcast — so review is the centre of the screen,
   not a step tucked behind a confirmation.
   ============================================================ */
export default function QuizStudio() {
  const qc = useQueryClient();
  const toast = useToast();
  const { session } = useLiveSession();

  const [drafts, setDrafts] = useState<DraftQuestion[]>([]);
  const [error, setError] = useState('');
  const [lastTopic, setLastTopic] = useState('');

  /** The draft is reviewed as the PDF it prints to; editing is the exception. */
  const [view, setView] = useState<'pdf' | 'edit'>('pdf');
  const [sheet, setSheetState] = useState<QuizSheet>(loadSheet);
  const [includeKey, setIncludeKey] = useState(false);
  const setSheet = (patch: Partial<QuizSheet>) => setSheetState((cur) => {
    const next = { ...cur, ...patch };
    try { localStorage.setItem(SHEET_KEY, JSON.stringify(next)); } catch { /* private mode */ }
    return next;
  });

  /** The library entry the drafts came from, if any; Save then updates it. */
  const [loaded, setLoaded] = useState<SavedQuiz | null>(null);
  const [saveOpen, setSaveOpen] = useState(false);
  const [removing, setRemoving] = useState<SavedQuiz | null>(null);

  /** Edits stay local until broadcast — the payload shape never changes. */
  const update = (i: number, patch: Partial<DraftQuestion>) =>
    setDrafts((list) => list.map((d, j) => (j === i ? { ...d, ...patch } : d)));

  // Broadcast stays off while an edit has left a question unusable.
  const incomplete = drafts.some((d) =>
    !d.prompt.trim()
    || (d.options.length > 0 && (d.correctIndex === null || d.options.some((o) => !o.trim()))),
  );

  const generate = useMutation({
    mutationFn: (body: unknown) => api.post<DraftQuestion[]>('/ai/quiz', body),
    onSuccess: (list, body) => {
      setDrafts(list);
      setLoaded(null);
      setView('pdf');
      setSheet({ title: `Quiz — ${(body as { topic: string }).topic}` });
      toast.success(`${list.length} questions drafted`, 'Review each answer key before broadcasting.');
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Generation failed. Try a narrower topic.'),
  });

  /* ── Library ───────────────────────────────────────────── */
  const saved = useQuery({ queryKey: ['quizzes'], queryFn: () => api.get<SavedQuiz[]>('/ai/quizzes') });

  const save = useMutation({
    mutationFn: (title: string) =>
      api.post<SavedQuiz>('/ai/quizzes', { title, topic: lastTopic || undefined, questions: drafts }),
    onSuccess: (q) => {
      setLoaded(q);
      setSaveOpen(false);
      qc.invalidateQueries({ queryKey: ['quizzes'] });
      toast.success('Quiz saved', 'Open it from your library any time.');
    },
    onError: (e) => toast.error('Could not save', e instanceof ApiError ? e.message : 'Try again.'),
  });

  const saveChanges = useMutation({
    mutationFn: () => api.patch<SavedQuiz>(`/ai/quizzes/${loaded!.id}`, { questions: drafts }),
    onSuccess: (q) => {
      setLoaded(q);
      qc.invalidateQueries({ queryKey: ['quizzes'] });
      toast.success('Changes saved');
    },
    onError: (e) => toast.error('Could not save', e instanceof ApiError ? e.message : 'Try again.'),
  });

  const open = useMutation({
    mutationFn: (id: string) => api.get<SavedQuizDetail>(`/ai/quizzes/${id}`),
    onSuccess: (q) => {
      setDrafts(q.questions);
      setLoaded({ ...q, questionCount: q.questions.length });
      setLastTopic(q.topic ?? '');
      setView('pdf');
      setSheet({ title: q.title });
      setError('');
    },
    onError: () => toast.error('Could not open that quiz'),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.del(`/ai/quizzes/${id}`),
    onSuccess: (_, id) => {
      setRemoving(null);
      if (loaded?.id === id) setLoaded(null);
      qc.invalidateQueries({ queryKey: ['quizzes'] });
      toast.success('Quiz deleted');
    },
    onError: () => { setRemoving(null); toast.error('Could not delete that quiz'); },
  });

  const publish = useMutation({
    mutationFn: () => api.post(`/sessions/${session!.id}/questions`, { questions: drafts }),
    onSuccess: () => {
      setDrafts([]);
      setLoaded(null);
      qc.invalidateQueries({ queryKey: ['questions', session?.id] });
      toast.success('Questions broadcast', 'They are queued in your live session, ready to open.');
    },
    onError: () => toast.error('Could not broadcast', 'The session may have closed. Start a new one and try again.'),
  });

  const pdfSource = useMemo<PdfSource | null>(
    () => (drafts.length ? { kind: 'quiz', sheet, questions: drafts, includeKey } : null),
    [drafts, sheet, includeKey],
  );
  const fileName = pdfFileName(sheet.title || lastTopic || 'Quiz', includeKey ? 'with key' : '');

  return (
    <>
      <PageHeader
        title="Quiz studio"
        lede="Draft from a topic, check every answer key, then broadcast to your live session."
        actions={session
          ? <LinkButton to="/teacher/live" variant="secondary"><Badge tone="live">Live</Badge>{session.course?.code} classroom</LinkButton>
          : <LinkButton to="/teacher/live" variant="secondary">Start a session</LinkButton>}
      />

      <div className="studio-grid">
        {/* ── Generator ─────────────────────────────────── */}
        <section>
          <SectionHead title="Generate a draft" sub="What the class has just covered" />
            {error && <Banner tone="error" title="Generation failed">{error}</Banner>}
            <form
              className="form"
              onSubmit={(e: FormEvent<HTMLFormElement>) => {
                e.preventDefault();
                setError('');
                const f = new FormData(e.currentTarget);
                const count = Number(f.get('count'));
                if (!Number.isInteger(count) || count < 1 || count > MAX_QUESTIONS) {
                  setError(`Choose between 1 and ${MAX_QUESTIONS} questions.`);
                  return;
                }
                setLastTopic(String(f.get('topic')));
                generate.mutate({
                  topic: String(f.get('topic')),
                  difficulty: String(f.get('difficulty')),
                  format: String(f.get('format')),
                  count,
                });
              }}
            >
              <TextField
                label="Topic" name="topic" required
                placeholder="Normalisation and functional dependencies"
                hint="Be specific — a narrow topic produces sharper questions than a whole syllabus."
              />
              <div className="form-row">
                <SelectField label="Difficulty" name="difficulty" defaultValue="Medium">
                  <option>Easy</option><option>Medium</option><option>Hard</option>
                </SelectField>
                <SelectField label="Format" name="format" defaultValue="MCQ">
                  <option value="MCQ">Multiple choice</option>
                  <option value="SHORT">Short answer</option>
                  <option value="MIXED">Mixed</option>
                </SelectField>
              </div>
              <NumberField
                label="How many questions" name="count" required
                min={1} max={MAX_QUESTIONS} defaultValue={5}
                hint={`Five is about right for a single lecture. Up to ${MAX_QUESTIONS} per draft.`}
              />
              <div className="form-actions" style={{ justifyContent: 'flex-start' }}>
                <Button type="submit" loading={generate.isPending}>
                  <IconSparkle size={15} />Generate draft
                </Button>
              </div>
            </form>

          <div className="section">
            <SectionHead title="Saved quizzes" sub="Yours only — answer keys included" />
            {saved.isLoading ? (
              <Skeleton h={60} className="sk-block" />
            ) : !saved.data?.length ? (
              <EmptyState row bare title="Nothing saved yet"
                description="Review a draft and save it to reuse it in another session." />
            ) : (
              <ul className="feed-list">
                {saved.data.map((q) => (
                  <li key={q.id} className="feed-row" style={{ flexDirection: 'row', alignItems: 'center', gap: 'var(--s-3)' }}>
                    <span className="grow" style={{ minWidth: 0 }}>
                      <span className="feed-row-title t-clamp-1">{q.title}</span>
                      <span className="feed-row-meta">
                        {q.questionCount} question{q.questionCount === 1 ? '' : 's'} · {relativeTime(q.updatedAt)}
                      </span>
                    </span>
                    <Button size="xs" variant="secondary"
                      disabled={loaded?.id === q.id}
                      loading={open.isPending && open.variables === q.id}
                      onClick={() => open.mutate(q.id)}>
                      {loaded?.id === q.id ? 'Open now' : 'Open'}
                    </Button>
                    <Button size="xs" variant="danger" onClick={() => setRemoving(q)}
                      aria-label={`Delete ${q.title}`}><IconTrash size={13} /></Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        {/* ── Review ────────────────────────────────────── */}
        <section>
          <SectionHead
            title={drafts.length ? `Review ${drafts.length} question${drafts.length === 1 ? '' : 's'}` : 'Review'}
            sub={drafts.length
              ? (loaded ? `Editing “${loaded.title}” from your library` : 'Nothing is sent until you broadcast')
              : undefined}
            action={drafts.length ? (
              <div className="row-tight">
                <Segmented<'pdf' | 'edit'>
                  label="Review as"
                  value={view}
                  onChange={setView}
                  options={[{ value: 'pdf', label: 'PDF' }, { value: 'edit', label: 'Edit' }]}
                />
                <Button size="sm" variant="tertiary" onClick={() => { setDrafts([]); setLoaded(null); }}>Discard all</Button>
                {loaded ? (
                  <>
                    <Button size="sm" variant="secondary" disabled={incomplete} loading={saveChanges.isPending}
                      onClick={() => saveChanges.mutate()}>Save changes</Button>
                    <Button size="sm" variant="tertiary" disabled={incomplete} onClick={() => setSaveOpen(true)}>Save as new</Button>
                  </>
                ) : (
                  <Button size="sm" variant="secondary" disabled={incomplete} onClick={() => setSaveOpen(true)}>Save quiz</Button>
                )}
                <Button size="sm" disabled={!session || incomplete} loading={publish.isPending} onClick={() => publish.mutate()}>
                  Broadcast to session
                </Button>
              </div>
            ) : undefined}
          />

          {generate.isPending ? (
            <div className="col">
              <Skeleton h={56} className="sk-block" />
              <Skeleton h={56} className="sk-block" />
              <Skeleton h={56} className="sk-block" />
            </div>
          ) : !drafts.length ? (
            <EmptyState
              row bare
              title="Nothing drafted yet"
              description="Generated questions appear here for review. You approve every one before a student sees it."
            />
          ) : (
            <>
              {!session && (
                <Banner tone="warning" title="No live session">
                  Start a session before broadcasting — questions are queued into the session you are running.
                </Banner>
              )}
              {incomplete && (
                <Banner tone="warning" title="A question is unfinished">
                  Every question needs a prompt, text in each option and a marked correct answer.
                </Banner>
              )}
              {view === 'pdf' && pdfSource && (
                <div style={{ marginTop: (!session || incomplete) ? 'var(--s-3)' : 0 }}>
                  <div className="quiz-sheet form">
                    <div className="form-row">
                      <TextField label="Sheet title" value={sheet.title}
                        placeholder="Quiz 1 — Normalisation"
                        onChange={(e) => setSheet({ title: e.target.value })} />
                      <TextField label="University" value={sheet.university}
                        onChange={(e) => setSheet({ university: e.target.value })} />
                      <TextField label="Course" value={sheet.course} placeholder="Database Systems"
                        onChange={(e) => setSheet({ course: e.target.value })} />
                      <TextField label="Class" value={sheet.program} placeholder="BSCS 2023"
                        onChange={(e) => setSheet({ program: e.target.value })} />
                      <TextField label="Date" type="date" value={sheet.date}
                        onChange={(e) => setSheet({ date: e.target.value })} />
                      <TextField label="Time allowed" value={sheet.duration} placeholder="20 minutes"
                        onChange={(e) => setSheet({ duration: e.target.value })} />
                    </div>
                    <Checkbox
                      checked={includeKey}
                      onChange={(e) => setIncludeKey(e.target.checked)}
                      label="Add the answer key as a last page"
                      description="Leave this off for the copy students receive."
                    />
                  </div>
                  <Suspense fallback={<Skeleton h={520} className="sk-block" />}>
                    <PdfPane source={pdfSource} fileName={fileName} />
                  </Suspense>
                </div>
              )}
              {view === 'edit' && (
              <ol className="draft-list" style={{ marginTop: (!session || incomplete) ? 'var(--s-3)' : 0 }}>
                {drafts.map((d, i) => (
                  <li key={i} className="draft">
                    <div className="draft-head">
                      <span className="lq-key t-num">{i + 1}</span>
                      <Textarea
                        className="draft-prompt-input"
                        aria-label={`Question ${i + 1} prompt`}
                        value={d.prompt}
                        rows={Math.min(6, Math.max(2, Math.ceil(d.prompt.length / 70)))}
                        onChange={(e) => update(i, { prompt: e.target.value })}
                      />
                      <Button
                        size="xs" variant="tertiary" iconOnly
                        aria-label={`Remove question ${i + 1}`}
                        onClick={() => setDrafts((list) => list.filter((_, j) => j !== i))}
                      >
                        <IconTrash size={14} />
                      </Button>
                    </div>

                    {d.options?.length > 0 && (
                      <ul className="draft-options">
                        {d.options.map((o, j) => (
                          <li key={j} className={j === d.correctIndex ? 'is-correct' : ''}>
                            <span className="lq-key">{String.fromCharCode(65 + j)}</span>
                            <Input
                              aria-label={`Question ${i + 1} option ${String.fromCharCode(65 + j)}`}
                              value={o}
                              onChange={(e) =>
                                update(i, { options: d.options.map((x, k) => (k === j ? e.target.value : x)) })
                              }
                            />
                            <label className="draft-correct-pick">
                              <input
                                type="radio"
                                name={`draft-${i}-correct`}
                                checked={j === d.correctIndex}
                                onChange={() => update(i, { correctIndex: j })}
                              />
                              Correct
                            </label>
                          </li>
                        ))}
                      </ul>
                    )}

                    <div className="draft-foot">
                      <Textarea
                        className="draft-explain-input"
                        aria-label={`Question ${i + 1} explanation`}
                        placeholder="Explanation shown after the answer is revealed (optional)"
                        value={d.explanation ?? ''}
                        rows={Math.min(4, Math.max(1, Math.ceil((d.explanation ?? '').length / 80)))}
                        onChange={(e) => update(i, { explanation: e.target.value || null })}
                      />
                      <div className="draft-meta">
                        <NumberInput
                          min={1} max={MAX_MARKS}
                          aria-label={`Question ${i + 1} marks`}
                          value={d.marks}
                          onChange={(e) => update(i, { marks: Math.min(MAX_MARKS, Math.max(1, Number(e.target.value) || 1)) })}
                        />
                        <span className="t-caption t-muted">{d.marks === 1 ? 'mark' : 'marks'}</span>
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
              )}
            </>
          )}
        </section>
      </div>

      <Modal
        open={saveOpen}
        onClose={() => setSaveOpen(false)}
        title="Save quiz to your library"
        description="Questions, answer keys and marks are kept exactly as they are now."
        footer={
          <>
            <Button variant="secondary" onClick={() => setSaveOpen(false)}>Cancel</Button>
            <Button form="save-quiz-form" type="submit" loading={save.isPending}>Save</Button>
          </>
        }
      >
        <form
          id="save-quiz-form"
          className="form"
          onSubmit={(e: FormEvent<HTMLFormElement>) => {
            e.preventDefault();
            const title = String(new FormData(e.currentTarget).get('title') ?? '').trim();
            if (title) save.mutate(title);
          }}
        >
          <TextField
            label="Title" name="title" required maxLength={200} autoFocus
            defaultValue={lastTopic}
            hint={`${drafts.length} question${drafts.length === 1 ? '' : 's'} will be saved.`}
          />
        </form>
      </Modal>

      <ConfirmDialog
        open={removing !== null}
        onClose={() => setRemoving(null)}
        onConfirm={() => removing && remove.mutate(removing.id)}
        title={`Delete “${removing?.title ?? ''}”?`}
        description="This removes it from your library. Questions already broadcast to a session are not affected."
        confirmLabel="Delete"
      />
    </>
  );
}
