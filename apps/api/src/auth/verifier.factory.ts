import { ConfigService } from '@nestjs/config';
import { DevGoogleTokenVerifier } from './dev-token-verifier';
import {
  GoogleAuthTokenVerifier,
  GoogleTokenVerifier,
} from './google-token-verifier';

export function createTokenVerifier(config: ConfigService): GoogleTokenVerifier {
  const devMode = config.get<string>('AUTH_DEV_MODE') === 'true';
  if (!devMode) {
    return new GoogleAuthTokenVerifier(config);
  }
  const nodeEnv = process.env.NODE_ENV;
  if (nodeEnv !== 'development' && nodeEnv !== 'test') {
    throw new Error(
      `AUTH_DEV_MODE must not be enabled in production — NODE_ENV is ${JSON.stringify(nodeEnv)}; set NODE_ENV=development for local dev or remove AUTH_DEV_MODE`,
    );
  }
  return new DevGoogleTokenVerifier();
}
