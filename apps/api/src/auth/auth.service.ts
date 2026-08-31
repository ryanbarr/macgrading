import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  GOOGLE_TOKEN_VERIFIER,
  type GoogleTokenVerifier,
} from './google-token-verifier';

export interface AuthUserDto {
  email: string;
  name: string;
  role: string;
}

export function toAuthUserDto(user: User): AuthUserDto {
  return { email: user.email, name: user.name, role: user.role };
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    @Inject(GOOGLE_TOKEN_VERIFIER) private readonly google: GoogleTokenVerifier,
  ) {}

  async exchangeGoogleToken(idToken: string) {
    const profile = await this.google.verify(idToken);
    const user = await this.prisma.user.findUnique({
      where: { email: profile.email },
    });
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Not a MAC Grading team member');
    }
    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: { googleId: profile.googleId },
    });
    const accessToken = await this.jwt.signAsync({
      sub: updated.id,
      email: updated.email,
      role: updated.role,
    });
    return { accessToken, user: toAuthUserDto(updated) };
  }
}
