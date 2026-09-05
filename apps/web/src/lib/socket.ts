import { io, type Socket } from 'socket.io-client';
import { tokens } from './api';

const URL = import.meta.env.VITE_API_URL ?? '';
let socket: Socket | null = null;

/**
 * One shared connection. The token is sent in the handshake, so the
 * server pins the identity at connect time and later events never
 * carry a client-supplied user id.
 */
export function getSocket(): Socket {
  if (!socket) {
    socket = io(`${URL}/realtime`, {
      transports: ['websocket'],
      auth: { token: tokens.access },
      autoConnect: true,
      reconnection: true,
      reconnectionDelay: 500,
      reconnectionDelayMax: 5000,
    });
  }
  return socket;
}

/** Re-issues the handshake after a token refresh. */
export function reauthSocket() {
  if (!socket) return;
  socket.auth = { token: tokens.access };
  socket.disconnect().connect();
}

export function closeSocket() {
  socket?.disconnect();
  socket = null;
}
