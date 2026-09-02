import * as SecureStore from 'expo-secure-store';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

const MODE_KEY = 'macgrading.mode';

interface ModeState {
  /** Test Mode: mints go to the T-prefixed training sequences. */
  isTestMode: boolean;
  toggleMode: () => Promise<void>;
}

const ModeContext = createContext<ModeState | undefined>(undefined);

export function ModeProvider({ children }: { children: ReactNode }) {
  const [isTestMode, setIsTestMode] = useState(false);

  useEffect(() => {
    let cancelled = false;
    SecureStore.getItemAsync(MODE_KEY)
      .then((stored) => {
        if (!cancelled && stored === 'test') setIsTestMode(true);
      })
      .catch(() => {
        // unreadable store — stay in Live Mode
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const toggleMode = useCallback(async () => {
    setIsTestMode((current) => {
      const next = !current;
      SecureStore.setItemAsync(MODE_KEY, next ? 'test' : 'live').catch(() => {
        // persistence is best-effort; in-memory mode still switches
      });
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({ isTestMode, toggleMode }),
    [isTestMode, toggleMode],
  );
  return <ModeContext.Provider value={value}>{children}</ModeContext.Provider>;
}

export function useMode(): ModeState {
  const context = useContext(ModeContext);
  if (!context) {
    throw new Error('useMode must be used inside ModeProvider');
  }
  return context;
}
