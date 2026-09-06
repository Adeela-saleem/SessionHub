import {
  OnGatewayConnection, OnGatewayDisconnect, SubscribeMessage,
  WebSocketGateway, WebSocketServer, MessageBody, ConnectedSocket,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Server, Socket } from 'socket.io';
import { PrismaService } from '../prisma/prisma.service';

interface SocketUser { id: string; role: string; name: string; }
type AuthedSocket = Socket & {
  data: {
    user?: SocketUser;
    /** Resolves once the handshake token has been checked, so handlers can wait for it. */
    ready?: Promise<void>;
    lastReactionAt?: number;
  };
};

const REACTION_KINDS = ['confused', 'got-it'] as const;
type ReactionKind = (typeof REACTION_KINDS)[number];

const room = (sessionId: string) => `session:${sessionId}`;
const teacherRoom = (sessionId: string) => `session:${sessionId}:teacher`;

@WebSocketGateway({
  namespace: '/realtime',
  cors: { origin: (process.env.CORS_ORIGIN ?? 'http://localhost:8080').split(','), credentials: true },
})
export class RealtimeGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server!: Server;
  private readonly logger = new Logger(RealtimeGateway.name);

  constructor(
    private jwt: JwtService,
    private config: ConfigService,
    private prisma: PrismaService,
  ) {}

  /**
   * The socket is authenticated once, at connect, and the identity is
   * pinned to socket.data — later events never carry a client-supplied
   * user id, so a connected client cannot act as somebody else.
   *
   * Nest does not wait for this before dispatching events, and clients
   * subscribe the instant they connect, so the check is exposed as a
   * promise the handlers await. Without it the first subscribe after a
   * connect was refused whenever the token lookup lost the race.
   */
  handleConnection(client: AuthedSocket) {
    client.data.ready = this.authenticate(client);
  }

  private async authenticate(client: AuthedSocket) {
    try {
      const token =
        client.handshake.auth?.token ??
        client.handshake.headers?.authorization?.replace('Bearer ', '');
      if (!token) throw new Error('No token');

      const payload = await this.jwt.verifyAsync(token, {
        secret: this.config.getOrThrow('JWT_ACCESS_SECRET'),
      });
      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        select: { id: true, role: true, name: true, approvalStatus: true },
      });
      if (!user || (user.role === 'TEACHER' && user.approvalStatus !== 'APPROVED')) {
        throw new Error('Not permitted');
      }

      client.data.user = { id: user.id, role: user.role, name: user.name };
      // Personal room: lets services push notifications to one person
      // without tracking socket ids.
      client.join(`user:${user.id}`);
    } catch {
      client.emit('error', { message: 'Authentication failed' });
      client.disconnect(true);
    }
  }

  async handleDisconnect(client: AuthedSocket) {
    const user = client.data.user;
    if (!user) return;
    // Mark the student away, but keep the attendance row so a reconnect
    // resumes it instead of creating a duplicate.
    await this.prisma.attendance
      .updateMany({
        where: { studentId: user.id, leftAt: null },
        data: { leftAt: new Date() },
      })
      .catch(() => undefined);
  }

  @SubscribeMessage('session:subscribe')
  async subscribe(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: { sessionId: string },
  ) {
    await client.data.ready;
    const user = client.data.user;
    if (!user || !body?.sessionId) return { ok: false };

    const session = await this.prisma.classSession.findUnique({
      where: { id: body.sessionId },
      select: { id: true, teacherId: true, courseId: true },
    });
    if (!session) return { ok: false, message: 'Session not found' };

    // Membership is re-checked here; joining a socket room is an
    // authorisation decision, not a routing detail.
    const isTeacher = session.teacherId === user.id || user.role === 'ADMIN';
    if (!isTeacher) {
      const enrolled = await this.prisma.enrollment.findUnique({
        where: { courseId_studentId: { courseId: session.courseId, studentId: user.id } },
      });
      if (!enrolled) return { ok: false, message: 'Not enrolled' };
    }

    await client.join(room(session.id));
    if (isTeacher) await client.join(teacherRoom(session.id));

    const attendeeCount = await this.prisma.attendance.count({
      where: { sessionId: session.id, leftAt: null },
    });
    this.server.to(room(session.id)).emit('roster:updated', { attendeeCount });

    return { ok: true };
  }

  /**
   * "Confused / got it" is deliberately ephemeral: nothing is stored,
   * and no name travels with it — the teacher's counter moves, that is
   * all. Costing a student nothing to admit confusion is the point.
   */
  @SubscribeMessage('session:react')
  async react(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: { sessionId: string; kind: ReactionKind },
  ) {
    await client.data.ready;
    const user = client.data.user;
    if (!user || user.role !== 'STUDENT') return { ok: false };
    if (!body?.sessionId || !REACTION_KINDS.includes(body.kind)) return { ok: false };
    // Must already be in the room — subscribe did the enrolment check.
    if (!client.rooms.has(room(body.sessionId))) return { ok: false };

    // One tap a second per connection is plenty for a human thumb.
    const now = Date.now();
    if (now - (client.data.lastReactionAt ?? 0) < 1000) return { ok: false };
    client.data.lastReactionAt = now;

    this.server.to(teacherRoom(body.sessionId)).emit('reaction:received', { kind: body.kind });
    return { ok: true };
  }

  @SubscribeMessage('session:unsubscribe')
  async unsubscribe(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: { sessionId: string },
  ) {
    await client.leave(room(body.sessionId));
    await client.leave(teacherRoom(body.sessionId));
    return { ok: true };
  }

  // ── Server-side emitters, called by the services ────────────
  emitToSession(sessionId: string, event: string, payload: unknown) {
    this.server?.to(room(sessionId)).emit(event, payload);
  }

  /** Teacher-only channel — used for data students must not see. */
  emitToUser(userId: string, event: string, payload: unknown) {
    this.server?.to(`user:${userId}`).emit(event, payload);
  }

  emitToTeacher(sessionId: string, event: string, payload: unknown) {
    this.server?.to(teacherRoom(sessionId)).emit(event, payload);
  }
}
