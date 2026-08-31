import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { GoogleProfile, GoogleTokenVerifier } from './google-token-verifier';

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Development-only verifier: treats the submitted "idToken" as an email
 * address. Selected ONLY when AUTH_DEV_MODE=true. Real Google verification
 * is bypassed entirely — never enable outside local development.
 */
@Injectable()
export class DevGoogleTokenVerifier implements GoogleTokenVerifier {
  private readonly logger = new Logger(DevGoogleTokenVerifier.name);

  constructor() {
    this.logger.warn(
      'AUTH_DEV_MODE enabled — Google tokens are NOT being verified',
    );
  }

  async verify(idToken: string): Promise<GoogleProfile> {
    const email = idToken.trim().toLowerCase();
    if (!EMAIL_SHAPE.test(email)) {
      throw new UnauthorizedException('Invalid Google token');
    }
    return {
      email,
      googleId: `dev-${email}`,
      name: email.split('@')[0],
    };
  }
}
