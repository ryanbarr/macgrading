import * as SecureStore from 'expo-secure-store';

const KEY = 'macgrading.jwt';

export const tokenStorage = {
  get: (): Promise<string | null> => SecureStore.getItemAsync(KEY),
  set: (token: string): Promise<void> => SecureStore.setItemAsync(KEY, token),
  clear: (): Promise<void> => SecureStore.deleteItemAsync(KEY),
};
