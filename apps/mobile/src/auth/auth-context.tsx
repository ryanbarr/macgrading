import type { AuthUserDto, LoginResponseDto } from '@macgrading/shared';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { ApiError, apiFetch } from '../api/client';
import { tokenStorage } from './token-storage';

interface AuthState {
  token: string | null;
  user: AuthUserDto | null;
  isLoading: boolean;
  signIn: (idToken: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

export function shouldClearStoredToken(error: unknown): boolean {
  return error instanceof ApiError && error.status === 401;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUserDto | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const stored = await tokenStorage.get();
      if (!stored) {
        if (!cancelled) setIsLoading(false);
        return;
      }
      try {
        const me = await apiFetch<AuthUserDto>('/auth/me', { token: stored });
        if (!cancelled) {
          setToken(stored);
          setUser(me);
        }
      } catch (error) {
        if (shouldClearStoredToken(error)) {
          await tokenStorage.clear();
        } else if (!cancelled) {
          setToken(stored);
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const signIn = useCallback(async (idToken: string) => {
    const result = await apiFetch<LoginResponseDto>('/auth/google', {
      method: 'POST',
      body: { idToken },
    });
    await tokenStorage.set(result.accessToken);
    setToken(result.accessToken);
    setUser(result.user);
  }, []);

  const signOut = useCallback(async () => {
    await tokenStorage.clear();
    setToken(null);
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ token, user, isLoading, signIn, signOut }),
    [token, user, isLoading, signIn, signOut],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used inside AuthProvider');
  }
  return context;
}
