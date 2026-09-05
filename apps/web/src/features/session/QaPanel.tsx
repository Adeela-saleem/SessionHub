import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import type { QaMessage } from '../../lib/types';
import { getSocket } from '../../lib/socket';
import {
  Avatar, Badge, Button, Card, CardBody, CardHead, EmptyState, Input, Skeleton, useToast,
} from '../../components/ui';
import { IconMessage, IconSend } from '../../components/icons';
import { relativeTime } from '../../lib/format';

/* ============================================================
   Session Q&A
   The quiet channel that runs alongside the questions: students
   ask, the teacher answers, everyone in the room sees both.
   ============================================================ */
export function QaPanel({ sessionId, canAsk, canAnswer }: {
  sessionId: string; canAsk?: boolean; canAnswer?: boolean;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const [draft, setDraft] = useState('');
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [reply, setReply] = useState('');

  const messages = useQuery({
    queryKey: ['qa', sessionId],
    queryFn: () => api.get<QaMessage[]>(`/sessions/${sessionId}/qa`),
  });

  // New questions and answers arrive over the same socket the live
  // questions use, so the list never needs polling.
  useEffect(() => {
    const socket = getSocket();
    const refresh = () => qc.invalidateQueries({ queryKey: ['qa', sessionId] });
    socket.on('qa:new', refresh);
    socket.on('qa:answered', refresh);
    return () => { socket.off('qa:new', refresh); socket.off('qa:answered', refresh); };
  }, [sessionId, qc]);

  const ask = useMutation({
    mutationFn: (body: string) => api.post(`/sessions/${sessionId}/qa`, { body }),
    onSuccess: () => { setDraft(''); qc.invalidateQueries({ queryKey: ['qa', sessionId] }); },
    onError: () => toast.error('Could not send your question', 'Check your connection and try again.'),
  });

  const answer = useMutation({
    mutationFn: ({ id, answerText }: { id: string; answerText: string }) =>
      api.post(`/qa/${id}/answer`, { answerText }),
    onSuccess: () => {
      setReplyTo(null); setReply('');
      qc.invalidateQueries({ queryKey: ['qa', sessionId] });
      toast.success('Answer posted', 'Everyone in the session can see it.');
    },
    onError: () => toast.error('Could not post that answer'),
  });

  const list = messages.data ?? [];
  const unanswered = list.filter((m) => !m.answerText).length;

  return (
    <Card>
      <CardHead
        title="Questions from the room"
        sub={canAsk ? 'Ask anything — your teacher sees it immediately' : undefined}
        action={unanswered > 0 ? <Badge tone="warning">{unanswered} waiting</Badge> : undefined}
      />

      {canAsk && (
        <div className="qa-compose">
          <form onSubmit={(e: FormEvent<HTMLFormElement>) => {
            e.preventDefault();
            if (draft.trim().length >= 3) ask.mutate(draft.trim());
          }}>
            <Input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Ask a question…"
              aria-label="Your question"
              maxLength={1000}
            />
            <Button type="submit" size="sm" iconOnly loading={ask.isPending} disabled={draft.trim().length < 3} aria-label="Send question">
              <IconSend size={15} />
            </Button>
          </form>
        </div>
      )}

      {messages.isLoading ? (
        <CardBody><Skeleton h={64} className="sk-block" /></CardBody>
      ) : !list.length ? (
        <EmptyState
          tight
          icon={<IconMessage size={20} />}
          title="No questions yet"
          description={canAsk
            ? 'Be the first to ask. Questions are visible to the whole session.'
            : 'When a student asks something it will appear here so you can answer the whole room at once.'}
        />
      ) : (
        <ul className="qa-list">
          {list.map((m) => (
            <li key={m.id} className="qa-item">
              <Avatar name={m.student?.name} size="sm" />
              <div className="grow" style={{ minWidth: 0 }}>
                <div className="qa-meta">
                  <strong>{m.student?.name ?? 'Student'}</strong>
                  <span className="t-caption t-muted">{relativeTime(m.createdAt)}</span>
                </div>
                <p className="qa-body">{m.body}</p>

                {m.answerText ? (
                  <div className="qa-answer">
                    <span className="t-label">Answered</span>
                    <p>{m.answerText}</p>
                  </div>
                ) : canAnswer ? (
                  replyTo === m.id ? (
                    <form
                      className="qa-reply"
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (reply.trim()) answer.mutate({ id: m.id, answerText: reply.trim() });
                      }}
                    >
                      <Input
                        autoFocus
                        value={reply}
                        onChange={(e) => setReply(e.target.value)}
                        placeholder="Type your answer…"
                        aria-label="Your answer"
                        maxLength={2000}
                      />
                      <Button type="submit" size="sm" loading={answer.isPending} disabled={!reply.trim()}>Post</Button>
                      <Button type="button" size="sm" variant="tertiary" onClick={() => { setReplyTo(null); setReply(''); }}>
                        Cancel
                      </Button>
                    </form>
                  ) : (
                    <Button size="xs" variant="secondary" onClick={() => { setReplyTo(m.id); setReply(''); }}>
                      Answer
                    </Button>
                  )
                ) : (
                  <span className="t-caption t-muted">Waiting for an answer</span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
