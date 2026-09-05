import { useEffect } from 'react';
import { getSocket } from '../../lib/socket';

/** Subscribes to a session room and cleans up on unmount. */
export function useSessionSocket(
  sessionId: string | null,
  handlers: Record<string, (payload: any) => void>,
) {
  useEffect(() => {
    if (!sessionId) return;
    const socket = getSocket();

    const subscribe = () => socket.emit('session:subscribe', { sessionId });
    subscribe();
    // Re-subscribe after a reconnect, otherwise the client silently
    // stops receiving events after a dropped connection.
    socket.on('connect', subscribe);

    for (const [event, fn] of Object.entries(handlers)) socket.on(event, fn);

    return () => {
      socket.emit('session:unsubscribe', { sessionId });
      socket.off('connect', subscribe);
      for (const [event, fn] of Object.entries(handlers)) socket.off(event, fn);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);
}
