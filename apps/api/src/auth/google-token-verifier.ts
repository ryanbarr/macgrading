import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OAuth2Client } from 'google-auth-library';

export interface GoogleProfile {
  email: string;
  googleId: string;
  name: string;
}

export interface GoogleTokenVerifier {
  verify(idToken: string): Promise<GoogleProfile>;
}

export const GOOGLE_TOKEN_VERIFIER = Symbol('GOOGLE_TOKEN_VERIFIER');

/** GOOGLE_CLIENT_ID holds one or more accepted audiences, comma-separated
 * (web + iOS clients mint tokens with different audiences). */
export function parseGoogleClientIds(raw: string): string[] {
  return raw
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
}

@Injectable()
export class GoogleAuthTokenVerifier implements GoogleTokenVerifier {
  private readonly client: OAuth2Client;
  private readonly audiences: string[];

  constructor(config: ConfigService) {
    this.audiences = parseGoogleClientIds(
      config.getOrThrow<string>('GOOGLE_CLIENT_ID'),
    );
    this.client = new OAuth2Client(this.audiences[0]);
  }

  async verify(idToken: string): Promise<GoogleProfile> {
    try {
      const ticket = await this.client.verifyIdToken({
        idToken,
        audience: this.audiences,
      });
      const payload = ticket.getPayload();
      if (!payload?.email || !payload.sub || payload.email_verified !== true) {
        throw new Error('missing or unverified email');
      }
      return {
        email: payload.email,
        googleId: payload.sub,
        name: payload.name ?? payload.email,
      };
    } catch {
      throw new UnauthorizedException('Invalid Google token');
    }
  }
}
