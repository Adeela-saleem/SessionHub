import { lazy, Suspense, useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { MAX_MARKS, MAX_QUESTIONS } from '../../lib/limits';
import type {
  GeneratedPaper, GeneratedPaperQuestion, PaperFields, PaperQuestionConfig, PaperType, SavedPaper,
} from '../../lib/types';
import {
  Badge, Banner, Button, ConfirmDialog, EmptyState,
  PageHeader, SectionHead, Segmented, SelectField, Skeleton, Tabs, TextareaField, TextField, useToast,
  NumberField, NumberInput,
} from '../../components/ui';
import { PaperEditor } from './PaperEditor';
import { IconPlus, IconSparkle, IconTrash } from '../../components/icons';
import { relativeTime } from '../../lib/format';
import { pdfFileName } from '../../features/pdf/pdfText';
import type { PdfSource } from '../../features/pdf/PdfPane';

const PdfPane = lazy(() => import('../../features/pdf/PdfPane'));

/* ============================================================
   Exam paper generator
   Two sheet formats — the terminal (theory) paper and the lab
   paper — each laid out from the department's sample. The
   teacher owns the marking scheme: question numbers, CLO/LLO,
   Bloom's level, subpart labels and marks are all set here and
   sent to the model as constraints. The model writes only the
   scenario, any data table, and the question text; the server
   rebuilds the paper around the teacher's configuration. The
   result is rendered straight to a PDF, which is what gets
   downloaded — there is no separate on-screen version. The
   header fields and the marking scheme stay live after
   generation, and the question text is editable in place.
   ============================================================ */

const BTL = [
  ['1', '1 — Remember'], ['2', '2 — Understand'], ['3', '3 — Apply'],
  ['4', '4 — Analyse'], ['5', '5 — Evaluate'], ['6', '6 — Create'],
] as const;
const LABELS = 'abcdefgh';
const FIELDS_KEY = 'sessionhub.paper.fields';

const DEFAULT_FIELDS: PaperFields = {
  paperType: 'TERMINAL',
  university: 'Jinnah University for Women',
  department: 'Computer Science and Software Engineering',
  instructor: '',
  subjectName: '',
  courseCode: '',
  program: '',
  semester: '',
  section: '',
  examType: 'Terminal',
  examDate: '',
  duration: '2 hours',
  totalMarks: '50',
  marksBreakdown: '',
  paperVersion: 'A',
  topics: '',
  clos: '',
  instructions: '',
};

function blankQuestion(num: number): PaperQuestionConfig {
  return { num, clo: '1', btl: '3', parts: [{ label: 'a', marks: 5 }, { label: 'b', marks: 5 }] };
}

/** The last form the teacher filled in, so a second paper is not typed from scratch. */
function loadFields(): Partial<PaperFields> {
  try {
    const raw = localStorage.getItem(FIELDS_KEY);
    return raw ? (JSON.parse(raw) as Partial<PaperFields>) : {};
  } catch { return {}; }
}
function storeFields(f: PaperFields) {
  try { localStorage.setItem(FIELDS_KEY, JSON.stringify(f)); } catch { /* private mode */ }
}

export default function PaperGenerator() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();

  const [fields, setFields] = useState<PaperFields>(() => ({
    ...DEFAULT_FIELDS, instructor: user?.name ?? '', ...loadFields(),
  }));
  const [config, setConfig] = useState<PaperQuestionConfig[]>([blankQuestion(1), blankQuestion(2)]);
  const [paper, setPaper] = useState<GeneratedPaper | null>(null);
  const [view, setView] = useState<'pdf' | 'edit'>('pdf');
  /** The library entry the paper was opened from, if any; Save then updates it. */
  const [loaded, setLoaded] = useState<SavedPaper | null>(null);
  const [error, setError] = useState('');
  const [removing, setRemoving] = useState<SavedPaper | null>(null);

  const lab = fields.paperType === 'LAB';
  const set = <K extends keyof PaperFields>(k: K, v: PaperFields[K]) =>
    setFields((f) => ({ ...f, [k]: v }));

  const saved = useQuery({ queryKey: ['papers'], queryFn: () => api.get<SavedPaper[]>('/ai/papers') });

  const generate = useMutation({
    mutationFn: (body: { fields: PaperFields; questionConfig: PaperQuestionConfig[] }) =>
      api.post<GeneratedPaper>('/ai/paper', body),
    onSuccess: (data) => {
      setPaper(data);
      setLoaded(null);
      setView('pdf');
      setError('');
      toast.success('Paper generated', 'Read every question in the PDF before you use it.');
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Generation failed. Try again.'),
  });

  const paperTitle = (p: GeneratedPaper) =>
    `${p.fields.subjectName} — ${p.fields.paperType === 'LAB' ? 'Lab exam' : p.fields.examType}`;

  /**
   * What the PDF shows and what gets saved: the generated questions under
   * the header fields as they are now, and the marking scheme as it is now
   * when its shape still matches the generated questions.
   */
  const livePaper = useMemo<GeneratedPaper | null>(() => {
    if (!paper) return null;
    const sameShape = config.length === paper.questionConfig.length
      && config.every((q, i) => q.parts.length === paper.questionConfig[i]!.parts.length);
    return {
      ...paper,
      fields: { ...fields, paperType: paper.fields.paperType },
      questionConfig: sameShape ? config : paper.questionConfig,
    };
  }, [paper, fields, config]);

  const save = useMutation({
    mutationFn: () => api.post<SavedPaper>('/ai/papers', { title: paperTitle(livePaper!), payload: livePaper }),
    onSuccess: (row) => {
      setLoaded(row);
      qc.invalidateQueries({ queryKey: ['papers'] });
      toast.success('Paper saved', 'Open it from your saved papers any time.');
    },
    onError: (e) => toast.error('Could not save', e instanceof ApiError ? e.message : 'Try again.'),
  });

  const saveChanges = useMutation({
    mutationFn: () => api.patch<SavedPaper>(`/ai/papers/${loaded!.id}`, {
      title: paperTitle(livePaper!), payload: livePaper,
    }),
    onSuccess: (row) => {
      setLoaded(row);
      qc.invalidateQueries({ queryKey: ['papers'] });
      toast.success('Changes saved');
    },
    onError: (e) => toast.error('Could not save', e instanceof ApiError ? e.message : 'Try again.'),
  });

  const open = useMutation({
    mutationFn: (id: string) => api.get<SavedPaper & { payload: GeneratedPaper }>(`/ai/papers/${id}`),
    onSuccess: (row) => {
      // Papers saved before the lab format existed have no paperType.
      const restored: GeneratedPaper = {
        ...row.payload,
        fields: { ...DEFAULT_FIELDS, ...row.payload.fields },
      };
      setPaper(restored);
      setConfig(restored.questionConfig);
      setFields(restored.fields);
      setLoaded({ id: row.id, title: row.title, createdAt: row.createdAt });
      setView('pdf');
      setError('');
    },
    onError: () => toast.error('Could not open that paper'),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.del(`/ai/papers/${id}`),
    onSuccess: (_, id) => {
      setRemoving(null);
      if (loaded?.id === id) setLoaded(null);
      qc.invalidateQueries({ queryKey: ['papers'] });
      toast.success('Paper deleted');
    },
    onError: () => { setRemoving(null); toast.error('Could not delete that paper'); },
  });

  const totalMarks = config.reduce(
    (sum, q) => sum + q.parts.reduce((s, p) => s + p.marks, 0), 0,
  );
  const overMarks = totalMarks > MAX_MARKS;

  function updateQuestion(i: number, patch: Partial<PaperQuestionConfig>) {
    setConfig((c) => c.map((q, qi) => (qi === i ? { ...q, ...patch } : q)));
  }
  function setParts(i: number, count: number) {
    setConfig((c) => c.map((q, qi) => {
      if (qi !== i) return q;
      const parts = Array.from({ length: count }, (_, pi) =>
        q.parts[pi] ?? { label: LABELS[pi]!, marks: 5 });
      return { ...q, parts };
    }));
  }
  function setMarks(qi: number, pi: number, marks: number) {
    setConfig((c) => c.map((q, i) => (i === qi
      ? { ...q, parts: q.parts.map((p, j) => (j === pi ? { ...p, marks } : p)) }
      : q)));
  }

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const printed = Number(fields.totalMarks);
    if (!Number.isInteger(printed) || printed < 1 || printed > MAX_MARKS) {
      setError(`Total marks must be a whole number between 1 and ${MAX_MARKS}.`);
      return;
    }
    if (overMarks) {
      setError(`Your question setup adds up to ${totalMarks}. A paper is out of at most ${MAX_MARKS} marks.`);
      return;
    }
    setError('');
    storeFields(fields);
    generate.mutate({ fields, questionConfig: config });
  }

  const setQuestions = (questions: GeneratedPaperQuestion[]) =>
    setPaper((p) => (p ? { ...p, questions } : p));

  const pdfSource = useMemo<PdfSource | null>(
    () => (livePaper ? { kind: 'paper', paper: livePaper } : null), [livePaper],
  );
  const fileName = livePaper
    ? pdfFileName(livePaper.fields.subjectName, livePaper.fields.paperType === 'LAB' ? 'Lab Exam' : `${livePaper.fields.examType} Exam`, livePaper.fields.program)
    : 'paper.pdf';

  const outcomesLabel = lab ? 'Lab learning outcomes' : 'Course learning outcomes';
  const outcomesAbbr = lab ? 'LLO' : 'CLO';

  return (
    <>
      <PageHeader
        title="Exam paper"
        lede="Pick the sheet, set the marking scheme; the model writes the questions and you download the PDF."
        actions={paper ? (
          loaded ? (
            <>
              <Button variant="tertiary" onClick={() => save.mutate()} loading={save.isPending}>Save as new</Button>
              <Button variant="secondary" loading={saveChanges.isPending} onClick={() => saveChanges.mutate()}>
                Save changes
              </Button>
            </>
          ) : (
            <Button variant="secondary" loading={save.isPending} onClick={() => save.mutate()}>
              Save paper
            </Button>
          )
        ) : undefined}
      />

      <div className="paper-type-tabs">
        <Tabs<PaperType>
          label="Paper type"
          value={fields.paperType}
          onChange={(v) => set('paperType', v)}
          items={[
            { value: 'TERMINAL', label: 'Terminal exam' },
            { value: 'LAB', label: 'Lab exam' },
          ]}
        />
      </div>

      {error && <Banner tone="error" title="Could not generate">{error}</Banner>}

      <div className="paper-grid">
        {/* ── Setup ──────────────────────────────────── */}
        <div>
          <section>
            <SectionHead
              title="Paper details"
              sub={lab ? 'Printed in the lab sheet header' : 'Printed in the paper header'}
            />
            <form id="paper-form" className="form" onSubmit={submit}>
              <div className="form-row">
                <TextField label="University" required value={fields.university}
                  onChange={(e) => set('university', e.target.value)} />
                <TextField label="Department" required value={fields.department}
                  placeholder="Computer Science and Software Engineering"
                  onChange={(e) => set('department', e.target.value)} />
                <TextField label="Course title" required value={fields.subjectName}
                  placeholder={lab ? 'Artificial Intelligence' : 'Software Engineering'}
                  onChange={(e) => set('subjectName', e.target.value)} />
                <TextField label="Course code" required value={fields.courseCode}
                  placeholder="CSC 3111"
                  onChange={(e) => set('courseCode', e.target.value)} />
                <TextField label="Course incharge" required value={fields.instructor}
                  onChange={(e) => set('instructor', e.target.value)} />
                <TextField label={lab ? 'Batch' : 'Class'} required value={fields.program}
                  placeholder={lab ? 'BS (CS) 2023' : 'BSCS 2023'}
                  onChange={(e) => set('program', e.target.value)} />
                <TextField label="Semester" required value={fields.semester}
                  placeholder="1st" hint="Printed as “1st Semester …”"
                  onChange={(e) => set('semester', e.target.value)} />
                <TextField label="Section" optional value={fields.section}
                  placeholder="A"
                  onChange={(e) => set('section', e.target.value)} />
                {!lab && (
                  <TextField label="Exam type" required value={fields.examType}
                    placeholder="Terminal" hint="Terminal, Mid-term, Sessional…"
                    onChange={(e) => set('examType', e.target.value)} />
                )}
                {lab && (
                  <TextField label="Paper version" optional value={fields.paperVersion}
                    placeholder="A" maxLength={2} hint="The letter in the top-right box"
                    onChange={(e) => set('paperVersion', e.target.value.toUpperCase())} />
                )}
                <TextField label="Exam date" type="date" optional value={fields.examDate}
                  onChange={(e) => set('examDate', e.target.value)} />
                <TextField label="Duration" required value={fields.duration}
                  placeholder={lab ? '1 hour' : '2 hours'}
                  onChange={(e) => set('duration', e.target.value)} />
                <NumberField label="Total marks" min={1} max={MAX_MARKS} required
                  value={fields.totalMarks}
                  onChange={(e) => set('totalMarks', e.target.value)}
                  hint={`Your question setup totals ${totalMarks}. Papers are out of at most ${MAX_MARKS}.`} />
              </div>
              {lab && (
                <TextField label="Marks breakdown" optional value={fields.marksBreakdown}
                  placeholder="Performance: 7, Lab Quiz: 5, Viva: 3, Project: 10, Lab file: 5"
                  hint="Printed in brackets after the total, exactly as typed."
                  onChange={(e) => set('marksBreakdown', e.target.value)} />
              )}
              <TextareaField
                label="Topics" required rows={4} value={fields.topics}
                onChange={(e) => set('topics', e.target.value)}
                placeholder={lab
                  ? 'Uniform cost search\nK-means clustering\nGenetic algorithms'
                  : 'Requirements engineering\nSystem design\nSoftware testing'}
                hint="One per line. The model is told to use these and nothing else." />
              <TextareaField
                label={outcomesLabel} required rows={4} value={fields.clos}
                onChange={(e) => set('clos', e.target.value)}
                placeholder={lab
                  ? 'Apply AI search and optimisation algorithms to solve computational problems\nDesign and implement intelligent systems using machine learning'
                  : 'Explain the phases, processes and activities of software engineering\nApply process models and quality assurance practices'}
                hint={`One per line. Printed in the ${outcomesAbbr} table; each question is locked to the ${outcomesAbbr} you assign it.`} />
              <TextareaField
                label="Instructions" optional rows={3} value={fields.instructions}
                onChange={(e) => set('instructions', e.target.value)}
                placeholder={lab
                  ? 'Attempt all questions:'
                  : 'Do not ask anything from the invigilator.\nAttempt ALL questions in sequence.'}
                hint={lab ? 'Printed in bold above the questions. Defaults to “Attempt all questions:”.' : 'One per line, printed under the CLO table.'} />
            </form>
          </section>

          <section className="section">
            <SectionHead
              title="Question setup"
              sub={`${config.length} of ${MAX_QUESTIONS} questions · ${totalMarks} of ${MAX_MARKS} marks`}
              action={
                <div className="row-tight">
                  <Button size="xs" variant="secondary"
                    disabled={config.length <= 1}
                    onClick={() => setConfig((c) => c.slice(0, -1))}>Remove last</Button>
                  <Button size="xs" variant="secondary"
                    disabled={config.length >= MAX_QUESTIONS}
                    onClick={() => setConfig((c) => [...c, blankQuestion(c.length + 1)])}>
                    <IconPlus size={13} />Add question
                  </Button>
                </div>
              }
            />
            <div className="paper-qlist">
              {config.map((q, i) => (
                <div className="paper-q" key={q.num}>
                  <span className="lq-key t-num">{q.num}</span>
                  <div>
                    <div className="paper-q-fields">
                      <TextField label={outcomesAbbr} name={`clo-${i}`} value={q.clo}
                        placeholder={lab ? '1,2' : '1'}
                        onChange={(e) => updateQuestion(i, { clo: e.target.value })} />
                      <SelectField label={lab ? 'BT level' : 'BTL'} name={`btl-${i}`} value={q.btl}
                        onChange={(e) => updateQuestion(i, { btl: e.target.value })}>
                        {/* Papers saved with the old C1–C6 labels still show their value. */}
                        {!BTL.some(([v]) => v === q.btl) && <option value={q.btl}>{q.btl}</option>}
                        {BTL.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                      </SelectField>
                      <SelectField label={lab ? 'Tasks' : 'Subparts'} name={`parts-${i}`} value={String(q.parts.length)}
                        onChange={(e) => setParts(i, Number(e.target.value))}>
                        {[1, 2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{n}</option>)}
                      </SelectField>
                    </div>
                    <div className="paper-marks">
                      {q.parts.map((p, pi) => (
                        <label key={p.label}>
                          <span>({p.label})</span>
                          <NumberInput
                            min={0} max={MAX_MARKS} step={0.5}
                            value={p.marks}
                            onChange={(e) => setMarks(i, pi, Math.min(MAX_MARKS, Math.max(0, Number(e.target.value) || 0)))}
                            aria-label={`Marks for question ${q.num} part ${p.label}`}
                          />
                        </label>
                      ))}
                      <span className="paper-q-total">
                        = {q.parts.reduce((s, p) => s + p.marks, 0)}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="form-actions">
              <span className={`t-caption grow ${overMarks ? 't-danger' : 't-muted'}`}>
                {overMarks
                  ? `${totalMarks} marks is over the ${MAX_MARKS} limit — reduce the marking scheme.`
                  : `${totalMarks} marks across ${config.length} questions.`}
              </span>
              <Button form="paper-form" type="submit" size="lg" loading={generate.isPending} disabled={overMarks}>
                <IconSparkle size={15} />{lab ? 'Generate lab paper' : 'Generate paper'}
              </Button>
            </div>
          </section>

          <section className="section">
            <SectionHead title="Saved papers" sub={loaded ? `Editing “${loaded.title}”` : 'Yours only'} />
            {saved.isLoading ? (
              <Skeleton h={60} className="sk-block" />
            ) : !saved.data?.length ? (
              <EmptyState row bare title="Nothing saved yet"
                description="Generate a paper and save it to reuse the setup later." />
            ) : (
              <ul className="feed-list">
                {saved.data.map((p) => (
                  <li key={p.id} className="feed-row" style={{ flexDirection: 'row', alignItems: 'center', gap: 'var(--s-3)' }}>
                    <span className="grow" style={{ minWidth: 0 }}>
                      <span className="feed-row-title t-clamp-1">{p.title}</span>
                      <span className="feed-row-meta">{relativeTime(p.createdAt)}</span>
                    </span>
                    <Button size="xs" variant="secondary"
                      disabled={loaded?.id === p.id}
                      loading={open.isPending && open.variables === p.id}
                      onClick={() => open.mutate(p.id)}>{loaded?.id === p.id ? 'Open now' : 'Open'}</Button>
                    <Button size="xs" variant="danger" onClick={() => setRemoving(p)}
                      aria-label={`Delete ${p.title}`}><IconTrash size={13} /></Button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        {/* ── PDF / editor ───────────────────────────── */}
        <section className="paper-preview">
          <SectionHead
            title={view === 'edit' ? 'Edit questions' : 'Paper PDF'}
            sub={paper
              ? (view === 'edit'
                ? 'Changes show in the PDF straight away'
                : (paper.fields.paperType === 'LAB' ? 'Lab sheet' : 'Terminal sheet'))
              : undefined}
            action={paper ? (
              <div className="row-tight">
                <Badge tone="warning">Draft — needs review</Badge>
                <Segmented<'pdf' | 'edit'>
                  label="Review as"
                  value={view}
                  onChange={setView}
                  options={[{ value: 'pdf', label: 'PDF' }, { value: 'edit', label: 'Edit' }]}
                />
              </div>
            ) : undefined}
          />
          {generate.isPending ? (
            <Skeleton h={520} className="sk-block" />
          ) : !pdfSource || !livePaper ? (
            <EmptyState
              row bare
              title="No paper yet"
              description="Fill in the details, set the question structure, and generate. The PDF appears here, ready to download."
            />
          ) : view === 'edit' ? (
            <PaperEditor paper={livePaper} onChange={setQuestions} />
          ) : (
            <Suspense fallback={<Skeleton h={520} className="sk-block" />}>
              <PdfPane source={pdfSource} fileName={fileName} />
            </Suspense>
          )}
        </section>
      </div>

      <ConfirmDialog
        open={!!removing}
        onClose={() => setRemoving(null)}
        onConfirm={() => removing && remove.mutate(removing.id)}
        title={`Delete "${removing?.title ?? 'this paper'}"?`}
        description="The saved paper and its question setup are removed. This cannot be undone."
        confirmLabel="Delete paper"
        destructive
        loading={remove.isPending}
      />
    </>
  );
}
