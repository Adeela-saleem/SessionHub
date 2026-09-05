import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../../lib/api';
import type { DraftQuestion } from '../../lib/types';
import { useLiveSession } from '../../features/session/LiveSessionContext';
import {
  Badge, Banner, Button, Card, CardBody, CardHead, EmptyState, LinkButton,
  PageHeader, SelectField, Skeleton, TextField, useToast,
} from '../../components/ui';
import { IconCheck, IconSparkle, IconTrash } from '../../components/icons';

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

  const generate = useMutation({
    mutationFn: (body: unknown) => api.post<DraftQuestion[]>('/ai/quiz', body),
    onSuccess: (list) => {
      setDrafts(list);
      toast.success(`${list.length} questions drafted`, 'Review each answer key before broadcasting.');
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Generation failed. Try a narrower topic.'),
  });

  const publish = useMutation({
    mutationFn: () => api.post(`/sessions/${session!.id}/questions`, { questions: drafts }),
    onSuccess: () => {
      setDrafts([]);
      qc.invalidateQueries({ queryKey: ['questions', session?.id] });
      toast.success('Questions broadcast', 'They are queued in your live session, ready to open.');
    },
    onError: () => toast.error('Could not broadcast', 'The session may have closed. Start a new one and try again.'),
  });

  return (
    <>
      <PageHeader
        eyebrow="Teaching"
        title="Quiz studio"
        lede="Draft a question set from a topic, check every answer, then send it to your live session."
        actions={session
          ? <Badge tone="live">Session live · {session.course?.code}</Badge>
          : <LinkButton to="/teacher/live" variant="secondary">Start a session</LinkButton>}
      />

      <div className="studio-grid">
        {/* ── Generator ─────────────────────────────────── */}
        <Card>
          <CardHead title="Generate a draft" sub="Describe what the class has just covered" />
          <CardBody>
            {error && <Banner tone="error" title="Generation failed">{error}</Banner>}
            <form
              className="col"
              onSubmit={(e: FormEvent<HTMLFormElement>) => {
                e.preventDefault();
                setError('');
                const f = new FormData(e.currentTarget);
                generate.mutate({
                  topic: String(f.get('topic')),
                  difficulty: String(f.get('difficulty')),
                  format: String(f.get('format')),
                  count: Number(f.get('count')),
                });
              }}
            >
              <TextField
                label="Topic" name="topic" required
                placeholder="Normalisation and functional dependencies"
                hint="Be specific — a narrow topic produces sharper questions than a whole syllabus."
              />
              <div className="grid-2">
                <SelectField label="Difficulty" name="difficulty" defaultValue="Medium">
                  <option>Easy</option><option>Medium</option><option>Hard</option>
                </SelectField>
                <SelectField label="Format" name="format" defaultValue="MCQ">
                  <option value="MCQ">Multiple choice</option>
                  <option value="SHORT">Short answer</option>
                  <option value="MIXED">Mixed</option>
                </SelectField>
              </div>
              <TextField
                label="How many questions" name="count" type="number"
                min={1} max={20} defaultValue={5}
                hint="Five is about right for a single lecture."
              />
              <Button type="submit" block loading={generate.isPending}>
                <IconSparkle size={15} />Generate draft
              </Button>
            </form>
          </CardBody>
        </Card>

        {/* ── Review ────────────────────────────────────── */}
        <Card>
          <CardHead
            title={drafts.length ? `Review ${drafts.length} question${drafts.length === 1 ? '' : 's'}` : 'Review'}
            sub={drafts.length ? 'Correct answers are marked. Remove anything that is wrong.' : undefined}
            action={drafts.length ? (
              <div className="row-tight">
                <Button size="sm" variant="tertiary" onClick={() => setDrafts([])}>Discard all</Button>
                <Button size="sm" disabled={!session} loading={publish.isPending} onClick={() => publish.mutate()}>
                  Broadcast
                </Button>
              </div>
            ) : undefined}
          />

          {generate.isPending ? (
            <CardBody>
              <Skeleton h={64} className="sk-line" />
              <Skeleton h={64} className="sk-line" />
              <Skeleton h={64} className="sk-line" />
            </CardBody>
          ) : !drafts.length ? (
            <EmptyState
              icon={<IconSparkle size={20} />}
              title="Nothing drafted yet"
              description="Generated questions appear here for review. You approve every one before a student ever sees it."
            />
          ) : (
            <>
              {!session && (
                <div style={{ padding: '0 var(--s-6) var(--s-4)' }}>
                  <Banner tone="warning" title="No live session">
                    Start a session before broadcasting — questions are queued into the session you are running.
                  </Banner>
                </div>
              )}
              <ol className="draft-list">
                {drafts.map((d, i) => (
                  <li key={i} className="draft">
                    <div className="draft-head">
                      <span className="q-order t-num">{i + 1}</span>
                      <p className="draft-prompt">{d.prompt}</p>
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
                            <span className="grow">{o}</span>
                            {j === d.correctIndex && (
                              <span className="draft-correct"><IconCheck size={13} />Correct</span>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}

                    {d.explanation && <p className="draft-explain">{d.explanation}</p>}
                    <span className="t-caption t-muted">{d.marks} {d.marks === 1 ? 'mark' : 'marks'}</span>
                  </li>
                ))}
              </ol>
            </>
          )}
        </Card>
      </div>
    </>
  );
}
