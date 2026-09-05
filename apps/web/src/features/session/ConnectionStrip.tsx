import { useEffect, useRef, useState } from 'react';
import { Banner } from '../../components/ui';
import { IconCheckCircle } from '../../components/icons';

/* ============================================================
   Connection health, said out loud.
   socket.io reconnects on its own, but during the gap the page
   quietly stops receiving questions — which, unannounced, looks
   identical to a teacher who has simply stopped asking them.
   ============================================================ */
export function ConnectionStrip({ connected }: { connected: boolean }) {
  const [restored, setRestored] = useState(false);
  const wasDown = useRef(false);
  // The socket reports "down" for a beat on first mount and on every
  // (re)join; only a drop that lasts long enough to matter counts as an
  // interruption worth announcing.
  const [down, setDown] = useState(false);

  useEffect(() => {
    if (!connected) {
      setRestored(false);
      const t = window.setTimeout(() => { wasDown.current = true; setDown(true); }, 2500);
      return () => window.clearTimeout(t);
    }
    setDown(false);
    if (wasDown.current) {
      wasDown.current = false;
      setRestored(true);
      const t = window.setTimeout(() => setRestored(false), 4000);
      return () => window.clearTimeout(t);
    }
  }, [connected]);

  if (!connected && down) {
    return (
      <Banner tone="warning" title="Connection interrupted — reconnecting…">
        New questions and results cannot reach you until the connection returns.
        Stay on this page; it reconnects on its own.
      </Banner>
    );
  }
  if (restored) {
    return (
      <p className="conn-restored" role="status">
        <IconCheckCircle size={14} />Connected — you are back in the room.
      </p>
    );
  }
  return null;
}
