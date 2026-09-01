import { ConfigService } from '@nestjs/config';
import { DevGoogleTokenVerifier } from './dev-token-verifier';
import {
  GoogleAuthTokenVerifier,
  GoogleTokenVerifier,
} from './google-token-verifier';

export function createTokenVerifier(config: ConfigService): GoogleTokenVerifier {
  const devMode = config.get<string>('AUTH_DEV_MODE') === 'true';
  if (devMode && process.env.NODE_ENV === 'production') {
    throw new Error(
      'AUTH_DEV_MODE must not be enabled in production — remove it from the environment',
    );
  }
  return devMode ? new DevGoogleTokenVerifier() : new GoogleAuthTokenVerifier(config);
}
