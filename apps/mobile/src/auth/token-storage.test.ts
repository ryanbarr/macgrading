jest.mock('expo-secure-store', () => {
  const store = new Map<string, string>();
  return {
    getItemAsync: jest.fn(async (k: string) => store.get(k) ?? null),
    setItemAsync: jest.fn(async (k: string, v: string) => void store.set(k, v)),
    deleteItemAsync: jest.fn(async (k: string) => void store.delete(k)),
  };
});

import { tokenStorage } from './token-storage';

describe('tokenStorage', () => {
  it('round-trips and clears the token', async () => {
    await expect(tokenStorage.get()).resolves.toBeNull();
    await tokenStorage.set('jwt-value');
    await expect(tokenStorage.get()).resolves.toBe('jwt-value');
    await tokenStorage.clear();
    await expect(tokenStorage.get()).resolves.toBeNull();
  });
});
