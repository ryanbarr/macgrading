import { ApiError } from '../api/client';
import { shouldClearStoredToken } from './auth-context';

describe('shouldClearStoredToken', () => {
  it('returns true for a 401 ApiError', () => {
    expect(shouldClearStoredToken(new ApiError(401, 'unauthorized'))).toBe(true);
  });

  it('returns false for a non-401 ApiError', () => {
    expect(shouldClearStoredToken(new ApiError(500, 'server error'))).toBe(false);
  });

  it('returns false for a network error', () => {
    expect(shouldClearStoredToken(new TypeError('Network request failed'))).toBe(false);
  });
});
