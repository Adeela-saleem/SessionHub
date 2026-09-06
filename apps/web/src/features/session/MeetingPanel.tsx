import { useEffect, useRef, useState } from 'react';
import { Spinner } from '../../components/ui';

/* ============================================================
   Video meeting — Jitsi Meet embedded in the live room.
   No accounts, keys or servers to set up: the public meet.jit.si
   instance hosts the call and this panel drops its iframe into
   the page. The room name is derived from the session so the
   teacher and every student land in the same call automatically.
   ============================================================ */

const JITSI_DOMAIN = 'meet.jit.si';
const SCRIPT_SRC = `https://${JITSI_DOMAIN}/external_api.js`;

/** Stable, hard-to-guess room name: the code students already know plus part of the session id. */
export function meetingRoomName(session: { id: string; roomCode: string }) {
  return `SessionHub-${session.roomCode.toUpperCase()}-${session.id.slice(0, 8)}`;
}

type JitsiApi = {
  dispose: () => void;
  addListener: (event: string, fn: (...args: unknown[]) => void) => void;
  executeCommand: (command: string, ...args: unknown[]) => void;
};
type JitsiCtor = new (domain: string, options: Record<string, unknown>) => JitsiApi;

let scriptPromise: Promise<JitsiCtor> | null = null;

/** Loads the Jitsi iframe API once per page. */
function loadJitsi(): Promise<JitsiCtor> {
  const w = window as unknown as { JitsiMeetExternalAPI?: JitsiCtor };
  if (w.JitsiMeetExternalAPI) return Promise.resolve(w.JitsiMeetExternalAPI);
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const el = document.createElement('script');
      el.src = SCRIPT_SRC;
      el.async = true;
      el.onload = () => (w.JitsiMeetExternalAPI ? resolve(w.JitsiMeetExternalAPI) : reject(new Error('Jitsi API missing')));
      el.onerror = () => { scriptPromise = null; reject(new Error('Could not load the meeting library')); };
      document.head.appendChild(el);
    });
  }
  return scriptPromise;
}

export function MeetingPanel({ roomName, displayName, email, subject, muted, onLeft }: {
  roomName: string;
  displayName: string;
  email?: string;
  /** Shown as the call's title inside Jitsi. */
  subject?: string;
  /** Students join muted so a class of thirty does not open with thirty mics. */
  muted?: boolean;
  /** The person hung up from inside the call. */
  onLeft?: () => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');

  useEffect(() => {
    let api: JitsiApi | null = null;
    let cancelled = false;
    setState('loading');

    loadJitsi()
      .then((Jitsi) => {
        if (cancelled || !host.current) return;
        api = new Jitsi(JITSI_DOMAIN, {
          roomName,
          parentNode: host.current,
          width: '100%',
          height: '100%',
          userInfo: { displayName, ...(email ? { email } : {}) },
          configOverwrite: {
            prejoinConfig: { enabled: false },
            startWithAudioMuted: !!muted,
            startWithVideoMuted: !!muted,
            disableDeepLinking: true,
            subject: subject ?? roomName,
          },
          interfaceConfigOverwrite: {
            SHOW_JITSI_WATERMARK: false,
            SHOW_WATERMARK_FOR_GUESTS: false,
            MOBILE_APP_PROMO: false,
            DISABLE_JOIN_LEAVE_NOTIFICATIONS: true,
          },
        });
        api.addListener('videoConferenceJoined', () => { if (!cancelled) setState('ready'); });
        api.addListener('readyToClose', () => { onLeft?.(); });
        // The iframe is up even before the join event fires.
        setState('ready');
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : 'Could not start the meeting');
        setState('error');
      });

    return () => {
      cancelled = true;
      api?.dispose();
    };
    // A new room or identity means a new call; other props only decorate it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomName, displayName]);

  return (
    <div className="meeting-panel">
      {state === 'loading' && (
        <div className="meeting-overlay"><Spinner size={16} /> Connecting to the meeting…</div>
      )}
      {state === 'error' && (
        <div className="meeting-overlay is-error" role="alert">
          {error} — open{' '}
          <a href={`https://${JITSI_DOMAIN}/${roomName}`} target="_blank" rel="noopener">the meeting in a new tab</a> instead.
        </div>
      )}
      <div ref={host} className="meeting-frame" />
    </div>
  );
}
