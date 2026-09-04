import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  GoogleAuthTokenVerifier,
  parseGoogleClientIds,
} from './google-token-verifier';

const verifyIdToken = jest.fn();
jest.mock('google-auth-library', () => ({
  OAuth2Client: jest.fn().mockImplementation(() => ({ verifyIdToken })),
}));

function fakeConfig(values: Record<string, string>): ConfigService {
  return {
    get: (key: string) => values[key],
    getOrThrow: (key: string) => {
      const value = values[key];
      if (value === undefined) throw new Error(`missing ${key}`);
      return value;
    },
  } as unknown as ConfigService;
}

describe('parseGoogleClientIds', () => {
  it('returns a single id as a one-element list', () => {
    expect(parseGoogleClientIds('web-id')).toEqual(['web-id']);
  });

  it('splits a comma-separated list, trimming and dropping empties', () => {
    expect(parseGoogleClientIds('web-id, ios-id ,,')).toEqual([
      'web-id',
      'ios-id',
    ]);
  });
});

describe('GoogleAuthTokenVerifier audiences', () => {
  beforeEach(() => {
    verifyIdToken.mockReset();
  });

  it('accepts a token for any configured client id', async () => {
    verifyIdToken.mockResolvedValue({
      getPayload: () => ({
        email: 'grader@macgrading.com',
        sub: 'google-123',
        email_verified: true,
        name: 'Grader',
      }),
    });
    const verifier = new GoogleAuthTokenVerifier(
      fakeConfig({ GOOGLE_CLIENT_ID: 'web-id,ios-id' }),
    );
    const profile = await verifier.verify('token');
    expect(profile.googleId).toBe('google-123');
    expect(verifyIdToken).toHaveBeenCalledWith({
      idToken: 'token',
      audience: ['web-id', 'ios-id'],
    });
  });

  it('still rejects invalid tokens', async () => {
    verifyIdToken.mockRejectedValue(new Error('bad audience'));
    const verifier = new GoogleAuthTokenVerifier(
      fakeConfig({ GOOGLE_CLIENT_ID: 'web-id,ios-id' }),
    );
    await expect(verifier.verify('token')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
