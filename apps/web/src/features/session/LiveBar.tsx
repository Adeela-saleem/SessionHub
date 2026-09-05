import { useEffect, useState, type ReactNode } from 'react';
import type { ClassSession } from '../../lib/types';
import { RoomCode } from '../../components/ui';

/* ============================================================
   Live status bar — the strip every live screen carries at the
   top: what is running, the room code, who is in, how long.
   ============================================================ */

function pad(n: number) { return String(n).padStart(2, '0'); }

/** Wall-clock elapsed since the session started, ticking each second. */
export function Elapsed({ since }: { since?: string | null }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  if (!since) return null;
  const secs = Math.max(0, Math.floor((now - new Date(since).getTime()) / 1000));
  const h = Math.floor(secs / 3600), m = Math.floor((secs % 3600) / 60), s = secs % 60;
  return (
    <span className="live-bar-clock t-data" aria-label="Elapsed time">
      {h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`}
    </span>
  );
}

export function LiveBar({ session, codeSize = 'sm', copyable, facts, actions }: {
  session: ClassSession & { startedAt?: string | null };
  codeSize?: 'sm' | 'md';
  copyable?: boolean;
  /** Label/value pairs shown after the code: in the room, answered… */
  facts?: { label: string; value: ReactNode }[];
  actions?: ReactNode;
}) {
  return (
    <div className="live-bar" role="region" aria-label="Session status">
      <div className="live-bar-id">
        <span className="live-bar-dot" aria-hidden="true" />
        <span className="live-bar-name t-clamp-1">{session.course?.name ?? session.title ?? 'Live session'}</span>
        {session.course?.code && <span className="t-data">{session.course.code}</span>}
        {session.title && session.course?.name && (
          <span className="live-bar-title t-clamp-1 hide-sm">{session.title}</span>
        )}
      </div>
      <div className="live-bar-code">
        <span className="live-bar-label">Room</span>
        <RoomCode code={session.roomCode} size={codeSize} copyable={copyable} />
      </div>
      {facts && facts.length > 0 && (
        <dl className="live-bar-facts">
          {facts.map((f) => (
            <div key={f.label}>
              <dt>{f.label}</dt>
              <dd className="t-num">{f.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {session.startedAt && (
        <div className="live-bar-fact hide-sm">
          <span className="live-bar-label">Elapsed</span>
          <Elapsed since={session.startedAt} />
        </div>
      )}
      {actions && <div className="live-bar-actions">{actions}</div>}
    </div>
  );
}
