import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { AuthProvider } from '../src/auth/auth-context';
import { ModeProvider } from '../src/mode/mode-context';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 15_000 } },
});

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ModeProvider>
          <Stack screenOptions={{ headerShown: false }} />
        </ModeProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
