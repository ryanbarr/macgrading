import { Redirect, Stack } from 'expo-router';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../src/auth/auth-context';
import { useMode } from '../../src/mode/mode-context';
import { theme } from '../../src/theme';

/** Always-visible mode strip so graders know which world they are in. */
function ModeBanner() {
  const { isTestMode } = useMode();
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[
        styles.banner,
        { paddingTop: insets.top },
        isTestMode ? styles.bannerTest : styles.bannerLive,
      ]}
    >
      <Text style={isTestMode ? styles.bannerTestText : styles.bannerLiveText}>
        {isTestMode ? 'TEST MODE — certs mint on the T sequence' : 'Live'}
      </Text>
    </View>
  );
}

export default function AppLayout() {
  const { token, isLoading } = useAuth();
  if (isLoading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }
  if (!token) {
    return <Redirect href="/sign-in" />;
  }
  return (
    <View style={{ flex: 1 }}>
      <ModeBanner />
      <Stack
        screenOptions={{
          headerShown: true,
          headerTintColor: theme.colors.text,
          headerStyle: { backgroundColor: theme.colors.card },
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  banner: { alignItems: 'center' },
  bannerLive: { backgroundColor: theme.colors.bg },
  bannerTest: { backgroundColor: theme.colors.danger },
  bannerLiveText: {
    fontSize: 11,
    color: theme.colors.subtle,
    paddingVertical: 2,
  },
  bannerTestText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#ffffff',
    letterSpacing: 1,
    paddingVertical: 4,
  },
});
