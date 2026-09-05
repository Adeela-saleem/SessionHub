import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';

export interface JwtPayload { sub: string; email: string; role: string; }

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(config: ConfigService, private prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_ACCESS_SECRET'),
    });
  }

  /**
   * Re-reads the user on every request. A token stays valid until it
   * expires, but a revoked or demoted account is rejected immediately —
   * the role in the token is never trusted on its own.
   */
  async validate(payload: JwtPayload) {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, name: true, role: true, approvalStatus: true, department: true, year: true, avatarUrl: true, createdAt: true },
    });

    if (!user) throw new UnauthorizedException('Account no longer exists');
    if (user.role === 'TEACHER' && user.approvalStatus !== 'APPROVED') {
      throw new UnauthorizedException('Teacher account is awaiting admin approval');
    }
    return user;
  }
}
