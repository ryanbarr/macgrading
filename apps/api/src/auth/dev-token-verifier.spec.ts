import { DevGoogleTokenVerifier } from './dev-token-verifier';

describe('DevGoogleTokenVerifier', () => {
  const verifier = new DevGoogleTokenVerifier();

  it('treats the token as an email and derives a profile', async () => {
    await expect(verifier.verify('  Team@MacGrading.com ')).resolves.toEqual({
      email: 'team@macgrading.com',
      googleId: 'dev-team@macgrading.com',
      name: 'team',
    });
  });

  it('rejects tokens that are not email-shaped', async () => {
    await expect(verifier.verify('not-an-email')).rejects.toThrow();
  });
});
