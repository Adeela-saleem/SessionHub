import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../../lib/api';
import { getSocket } from '../../lib/socket';
import {
  Badge, Banner, Button, Card, CardBody, CardHead, EmptyState, Input, Skeleton, useToast,
} from '../../components/ui';
import { IconChart, IconClose, IconPlus } from '../../components/icons';

/* ============================================================
   Polls — the unmarked question.
   The API (polls module) has been live for a while; this is the
   first UI on top of it. A poll is prompt + 2–6 options, one
   vote per student, no marks. Results travel over the same
   socket the quiz uses: poll:opened, poll:updated, poll:closed.
   ============================================================ */

export interface Poll {
  id: string; sessionId: string; prompt: string; options: string[];
  isOpen: boolean; createdAt: string;
  _count?: { votes: number };
}

export interface PollResults {
  pollId: string; prompt: string; isOpen: boolean; totalVotes: number;
  distribution: { index: number; label: string; count: number }[];
}

/** Keeps the poll queries in step with the room, for both roles. */
function usePollSocket(sessionId: string) {
  const qc = useQueryClient();
  useEffect(() => {
    const socket = getSocket();
    const opened = () => qc.invalidateQueries({ queryKey: ['polls', sessionId] });
    const updated = (r: PollResults) => qc.setQueryData(['poll-results', r.pollId], r);
    const closed = (r: PollResults) => {
      qc.setQueryData(['poll-results', r.pollId], r);
      qc.invalidateQueries({ queryKey: ['polls', sessionId] });
    };
    socket.on('poll:opened', opened);
    socket.on('poll:updated', updated);
    socket.on('poll:closed', closed);
    return () => {
      socket.off('poll:opened', opened);
      socket.off('poll:updated', updated);
      socket.off('poll:closed', closed);
    };
  }, [sessionId, qc]);
}

function usePolls(sessionId: string) {
  return useQuery({
    queryKey: ['polls', sessionId],
    queryFn: () => api.get<Poll[]>(`/sessions/${sessionId}/polls`),
  });
}

/* ── Result bars — shared visual, no correct answer to crown ── */
function PollBars({ results, mine }: { results: PollResults; mine?: number | null }) {
  const total = results.totalVotes || 1;
  return (
    <ul className="lq-results is-poll">
      {results.distribution.map((d) => (
        <li key={d.index} className={d.index === mine ? 'is-mine' : ''}>
          <span className="lq-key">{String.fromCharCode(65 + d.index)}</span>
          <span className="lq-opt-label">
            {d.label}
            {d.index === mine && <span className="lq-mark lq-mark-mine">Your vote</span>}
          </span>
          <span className="lq-bar"><i style={{ width: `${(d.count / total) * 100}%` }} /></span>
          <span className="lq-count t-num">
            {d.count} · {results.totalVotes ? Math.round((d.count / results.totalVotes) * 100) : 0}%
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Fetches once, then lives off poll:updated / poll:closed pushes. */
function LivePollBars({ pollId, mine }: { pollId: string; mine?: number | null }) {
  const results = useQuery({
    queryKey: ['poll-results', pollId],
    queryFn: () => api.get<PollResults>(`/polls/${pollId}/results`),
  });
  if (results.isLoading) return <Skeleton h={48} className="sk-block" />;
  if (!results.data) return null;
  return <PollBars results={results.data} mine={mine} />;
}

/* ============================================================
   Teacher: compose, watch the bars move, close.
   ============================================================ */
export function TeacherPollPanel({ sessionId, composeRequest = 0 }: {
  sessionId: string;
  /** Incremented by the control bar (or the `p` key) to open the composer. */
  composeRequest?: number;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  usePollSocket(sessionId);
  const polls = usePolls(sessionId);

  const [composing, setComposing] = useState(false);
  useEffect(() => { if (composeRequest > 0) setComposing(true); }, [composeRequest]);
  const [prompt, setPrompt] = useState('');
  const [options, setOptions] = useState<string[]>(['', '']);

  const create = useMutation({
    mutationFn: (body: { prompt: string; options: string[] }) =>
      api.post<Poll>(`/sessions/${sessionId}/polls`, body),
    onSuccess: () => {
      setPrompt(''); setOptions(['', '']); setComposing(false);
      qc.invalidateQueries({ queryKey: ['polls', sessionId] });
      toast.success('Poll is open', 'Everyone in the room can vote now.');
    },
    onError: (e) => toast.error(
      'Could not open the poll',
      e instanceof ApiError ? e.message : 'Check your connection and try again.',
    ),
  });

  const close = useMutation({
    mutationFn: (id: string) => api.post<PollResults>(`/polls/${id}/close`),
    onSuccess: (r) => {
      qc.setQueryData(['poll-results', r.pollId], r);
      qc.invalidateQueries({ queryKey: ['polls', sessionId] });
    },
    onError: () => toast.error('Could not close that poll'),
  });

  const list = polls.data ?? [];
  const trimmed = options.map((o) => o.trim());
  const canCreate = prompt.trim().length > 0 && trimmed.every((o) => o.length > 0);

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (canCreate) create.mutate({ prompt: prompt.trim(), options: trimmed });
  }

  return (
    <Card>
      <CardHead
        title="Polls"
        sub="Unmarked · votes land as they happen"
        action={
          composing ? undefined : (
            <Button size="sm" variant="secondary" onClick={() => setComposing(true)}>
              <IconPlus size={14} />New poll
            </Button>
          )
        }
      />

      {composing && (
        <CardBody>
          <form className="poll-compose" onSubmit={submit}>
            <Input
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="How confident do you feel about this topic?"
              aria-label="Poll question"
              maxLength={500}
              autoFocus
            />
            {options.map((opt, i) => (
              <div className="poll-opt-row" key={i}>
                <span className="lq-key">{String.fromCharCode(65 + i)}</span>
                <Input
                  value={opt}
                  onChange={(e) => setOptions(options.map((o, j) => (j === i ? e.target.value : o)))}
                  placeholder={`Option ${String.fromCharCode(65 + i)}`}
                  aria-label={`Option ${String.fromCharCode(65 + i)}`}
                  maxLength={200}
                />
                {options.length > 2 && (
                  <Button
                    type="button" size="sm" variant="tertiary" iconOnly
                    aria-label={`Remove option ${String.fromCharCode(65 + i)}`}
                    onClick={() => setOptions(options.filter((_, j) => j !== i))}
                  >
                    <IconClose size={14} />
                  </Button>
                )}
              </div>
            ))}
            <div className="poll-actions">
              <Button
                type="button" size="sm" variant="secondary"
                disabled={options.length >= 6}
                onClick={() => setOptions([...options, ''])}
              >
                <IconPlus size={13} />Add option
              </Button>
              <span className="grow" />
              <Button type="button" size="sm" variant="tertiary" onClick={() => setComposing(false)}>
                Cancel
              </Button>
              <Button type="submit" size="sm" loading={create.isPending} disabled={!canCreate}>
                Open poll
              </Button>
            </div>
          </form>
        </CardBody>
      )}

      {polls.isLoading ? (
        <CardBody><Skeleton h={64} className="sk-block" /></CardBody>
      ) : !list.length && !composing ? (
        <EmptyState
          tight
          icon={<IconChart size={20} />}
          title="No polls yet"
          description="Open one when you want a temperature check that does not count for marks."
        />
      ) : (
        <ul className="poll-list">
          {list.map((p) => (
            <li key={p.id} className="poll-item">
              <div className="poll-item-head">
                <div className="grow" style={{ minWidth: 0 }}>
                  <p className="poll-prompt">{p.prompt}</p>
                  <p className="poll-meta">
                    {p._count?.votes ?? 0} {p._count?.votes === 1 ? 'vote' : 'votes'}
                  </p>
                </div>
                {p.isOpen ? (
                  <>
                    <Badge tone="live">Open</Badge>
                    <Button size="sm" variant="secondary" loading={close.isPending}
                      onClick={() => close.mutate(p.id)}>
                      Close poll
                    </Button>
                  </>
                ) : (
                  <Badge tone="neutral">Closed</Badge>
                )}
              </div>
              <LivePollBars pollId={p.id} />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/* ============================================================
   Student: vote once, then watch the room.
   Only totals are ever shown — the results payload carries no
   names, so there are none to leak here.
   ============================================================ */
export function StudentPollPanel({ sessionId }: { sessionId: string }) {
  const toast = useToast();
  const qc = useQueryClient();
  usePollSocket(sessionId);
  const polls = usePolls(sessionId);

  const [choice, setChoice] = useState<number | null>(null);
  // pollId → the option this student voted for (-1 when the server says
  // "already voted" but the index is unknown, e.g. after a page reload).
  const [votes, setVotes] = useState<Record<string, number>>({});

  const vote = useMutation({
    mutationFn: ({ pollId, optionIndex }: { pollId: string; optionIndex: number }) =>
      api.post(`/polls/${pollId}/vote`, { optionIndex }),
    onSuccess: (_d, v) => {
      setVotes((m) => ({ ...m, [v.pollId]: v.optionIndex }));
      setChoice(null);
      qc.invalidateQueries({ queryKey: ['poll-results', v.pollId] });
    },
    onError: (e, v) => {
      if (e instanceof ApiError && e.status === 409) {
        setVotes((m) => ({ ...m, [v.pollId]: -1 }));
        toast.info('Already voted', 'Your earlier vote on this poll stands.');
      } else {
        toast.error('Could not record your vote', 'Check your connection and try again.');
      }
    },
  });

  // The newest poll, but only while it is worth looking at: open, or
  // freshly closed after this student took part.
  const latest = (polls.data ?? [])[0];
  const poll = latest && (latest.isOpen || votes[latest.id] !== undefined) ? latest : null;
  if (!poll) return null;

  const voted = votes[poll.id] !== undefined;
  const showResults = voted || !poll.isOpen;

  return (
    <Card>
      <CardHead
        title="Class poll"
        sub="Unmarked · only totals are shown"
        action={<Badge tone={poll.isOpen ? 'live' : 'neutral'}>{poll.isOpen ? 'Open' : 'Closed'}</Badge>}
      />
      <CardBody>
        <div className="lq">
          <p className="lq-prompt">{poll.prompt}</p>

          {showResults ? (
            <LivePollBars pollId={poll.id} mine={voted && votes[poll.id] >= 0 ? votes[poll.id] : null} />
          ) : (
            <>
              <div className="lq-options" role="radiogroup" aria-label="Poll options">
                {poll.options.map((opt, i) => (
                  <button
                    key={i}
                    type="button"
                    role="radio"
                    aria-checked={choice === i}
                    className={`lq-opt ${choice === i ? 'is-selected' : ''}`.trim()}
                    onClick={() => setChoice(i)}
                  >
                    <span className="lq-key">{String.fromCharCode(65 + i)}</span>
                    <span className="lq-opt-label">{opt}</span>
                  </button>
                ))}
              </div>
              <Button
                block
                loading={vote.isPending}
                disabled={choice === null}
                onClick={() => choice !== null && vote.mutate({ pollId: poll.id, optionIndex: choice })}
              >
                Cast vote
              </Button>
            </>
          )}

          {!poll.isOpen && (
            <Banner tone="info">This poll has closed — the bars above are the final result.</Banner>
          )}
        </div>
      </CardBody>
    </Card>
  );
}
