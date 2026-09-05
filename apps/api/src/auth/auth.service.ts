import {
  BadRequestException,
  ConflictException, Injectable, UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Role, User } from '@prisma/client';
import { hash as argonHash, verify as argonVerify } from '@node-rs/argon2';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto, SignupDto } from './dto/auth.dto';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private config: ConfigService,
  ) {}

  async signup(dto: SignupDto) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) throw new ConflictException('That email is already registered');

    // Students are usable immediately; teachers wait for an admin.
    // The DTO enum makes ADMIN unreachable from this endpoint at all.
    const approvalStatus = dto.role === 'TEACHER' ? 'PENDING' : 'APPROVED';

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        name: dto.name,
        passwordHash: await argonHash(dto.password),
        role: dto.role as Role,
        approvalStatus,
        department: dto.department,
        year: dto.year,
      },
    });

    if (approvalStatus === 'PENDING') {
      return {
        pendingApproval: true,
        message: 'Account created. An administrator must approve it before you can sign in.',
      };
    }
    return this.issueTokens(user);
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });

    // Verify against a dummy hash when the user is missing so the response
    // time does not reveal whether an address is registered.
    const hash = user?.passwordHash ?? DUMMY_HASH;
    const ok = await argonVerify(hash, dto.password).catch(() => false);
    if (!user || !ok) throw new UnauthorizedException('Incorrect email or password');

    if (user.role === 'TEACHER' && user.approvalStatus !== 'APPROVED') {
      throw new UnauthorizedException('Your teacher account is still pending admin approval');
    }
    return this.issueTokens(user);
  }

  /**
   * Changing a password invalidates every refresh token the account
   * holds — if the old password leaked, sessions opened with it must
   * not survive. A fresh pair is issued so the caller stays signed in
   * on this device only.
   */
  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException('Session expired, please sign in again');

    const ok = await argonVerify(user.passwordHash, currentPassword).catch(() => false);
    if (!ok) throw new UnauthorizedException('Your current password is not correct');

    const same = await argonVerify(user.passwordHash, newPassword).catch(() => false);
    if (same) throw new BadRequestException('Choose a password you have not used here before');

    const passwordHash = await argonHash(newPassword);
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: userId }, data: { passwordHash } }),
      this.prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);

    return this.issueTokens(user);
  }

  async refresh(rawToken: string) {
    const tokenHash = sha256(rawToken);
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!stored || stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Session expired, please sign in again');
    }

    if (stored.revokedAt) {
      // Two tabs share one stored token: both boot, both present it, and
      // strict rotation would log the slower tab out. A short replay
      // grace keeps rotation's theft protection while letting the
      // concurrent tab through; outside the window it is still a hard
      // failure.
      const graceMs = 30_000;
      if (Date.now() - stored.revokedAt.getTime() > graceMs) {
        throw new UnauthorizedException('Session expired, please sign in again');
      }
      return this.issueTokens(stored.user);
    }

    // Rotate: the presented token is burned as the new pair is issued.
    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });
    return this.issueTokens(stored.user);
  }

  async logout(rawToken: string) {
    await this.prisma.refreshToken
      .updateMany({ where: { tokenHash: sha256(rawToken) }, data: { revokedAt: new Date() } });
    return { ok: true };
  }

  private async issueTokens(user: User) {
    const payload = { sub: user.id, email: user.email, role: user.role };

    const accessToken = await this.jwt.signAsync(payload, {
      secret: this.config.getOrThrow('JWT_ACCESS_SECRET'),
      expiresIn: this.config.get('JWT_ACCESS_TTL', '15m'),
    });

    // Refresh tokens are opaque random strings stored only as hashes,
    // so a database leak does not hand out usable sessions.
    const refreshToken = randomBytes(48).toString('base64url');
    const ttlDays = Number(String(this.config.get('JWT_REFRESH_TTL', '7d')).replace('d', '')) || 7;

    await this.prisma.refreshToken.create({
      data: {
        tokenHash: sha256(refreshToken),
        userId: user.id,
        expiresAt: new Date(Date.now() + ttlDays * 86_400_000),
      },
    });

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id, email: user.email, name: user.name,
        role: user.role, department: user.department, avatarUrl: user.avatarUrl,
        createdAt: user.createdAt,
      },
    };
  }
}

const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');
const DUMMY_HASH =
  '$argon2id$v=19$m=65536,t=3,p=4$c29tZXNhbHRzb21lc2FsdA$0000000000000000000000000000000000000000000';
