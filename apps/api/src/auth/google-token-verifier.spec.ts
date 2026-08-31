import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OAuth2Client, LoginTicket, TokenPayload } from 'google-auth-library';
import { GoogleAuthTokenVerifier } from './google-token-verifier';

function fakeConfigService(): ConfigService {
  return {
    getOrThrow: () => 'test-client-id.apps.googleusercontent.com',
  } as unknown as ConfigService;
}

function ticketWith(payload: Partial<TokenPayload>): LoginTicket {
  return new LoginTicket(undefined, {
    iss: 'https://accounts.google.com',
    sub: 'google-sub-123',
    aud: 'test-client-id.apps.googleusercontent.com',
    iat: 0,
    exp: 0,
    email: 'person@example.com',
    email_verified: true,
    name: 'Test Person',
    ...payload,
  });
}

describe('GoogleAuthTokenVerifier', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('rejects a token whose email is not verified', async () => {
    jest
      .spyOn(OAuth2Client.prototype, 'verifyIdToken')
      .mockResolvedValue(ticketWith({ email_verified: false }));
    const verifier = new GoogleAuthTokenVerifier(fakeConfigService());

    await expect(verifier.verify('some-id-token')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('returns the profile for a token with a verified email', async () => {
    jest
      .spyOn(OAuth2Client.prototype, 'verifyIdToken')
      .mockResolvedValue(ticketWith({ email_verified: true }));
    const verifier = new GoogleAuthTokenVerifier(fakeConfigService());

    await expect(verifier.verify('some-id-token')).resolves.toEqual({
      email: 'person@example.com',
      googleId: 'google-sub-123',
      name: 'Test Person',
    });
  });
});
