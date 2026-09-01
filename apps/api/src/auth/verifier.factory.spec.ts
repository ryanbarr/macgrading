import { ConfigService } from '@nestjs/config';
import { DevGoogleTokenVerifier } from './dev-token-verifier';
import { GoogleAuthTokenVerifier } from './google-token-verifier';
import { createTokenVerifier } from './verifier.factory';

function fakeConfig(values: Record<string, string | undefined>): ConfigService {
  return {
    get: (key: string) => values[key],
    getOrThrow: (key: string) => {
      const value = values[key];
      if (value === undefined) throw new Error(`missing ${key}`);
      return value;
    },
  } as unknown as ConfigService;
}

describe('createTokenVerifier', () => {
  const realNodeEnv = process.env.NODE_ENV;
  afterEach(() => {
    process.env.NODE_ENV = realNodeEnv;
  });

  it('returns the real Google verifier by default', () => {
    const verifier = createTokenVerifier(
      fakeConfig({ GOOGLE_CLIENT_ID: 'client-id' }),
    );
    expect(verifier).toBeInstanceOf(GoogleAuthTokenVerifier);
  });

  it('returns the dev verifier when AUTH_DEV_MODE=true outside production', () => {
    process.env.NODE_ENV = 'development';
    const verifier = createTokenVerifier(
      fakeConfig({ AUTH_DEV_MODE: 'true', GOOGLE_CLIENT_ID: 'client-id' }),
    );
    expect(verifier).toBeInstanceOf(DevGoogleTokenVerifier);
  });

  it('throws when AUTH_DEV_MODE=true in production', () => {
    process.env.NODE_ENV = 'production';
    expect(() =>
      createTokenVerifier(
        fakeConfig({ AUTH_DEV_MODE: 'true', GOOGLE_CLIENT_ID: 'client-id' }),
      ),
    ).toThrow('AUTH_DEV_MODE must not be enabled in production');
  });
});
