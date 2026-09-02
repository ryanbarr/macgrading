import { router, Stack } from 'expo-router';
import { useState } from 'react';
import {
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useCerts } from '../../src/api/queries';
import { useAuth } from '../../src/auth/auth-context';
import { CertCard } from '../../src/components/CertCard';
import { useMode } from '../../src/mode/mode-context';
import { theme } from '../../src/theme';

export default function Home() {
  const { signOut } = useAuth();
  const { isTestMode, toggleMode } = useMode();
  const [q, setQ] = useState('');
  const certs = useCerts(q, isTestMode);

  const openSettings = () => {
    Alert.alert('Settings', undefined, [
      {
        text: isTestMode ? 'Switch to Live Mode' : 'Switch to Test Mode',
        onPress: () => void toggleMode(),
      },
      { text: 'Sign Out', style: 'destructive', onPress: () => void signOut() },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: isTestMode ? 'Test Certs' : 'Certs',
          headerRight: () => (
            <Pressable onPress={openSettings} accessibilityLabel="Settings">
              <Text style={styles.cog}>⚙️</Text>
            </Pressable>
          ),
        }}
      />
      <TextInput
        style={styles.search}
        placeholder="Search certs (name, set, number)"
        autoCapitalize="none"
        value={q}
        onChangeText={setQ}
      />
      <FlatList
        data={certs.data?.items ?? []}
        keyExtractor={(cert) => cert.certNumber}
        contentContainerStyle={styles.list}
        refreshing={certs.isFetching}
        onRefresh={() => certs.refetch()}
        renderItem={({ item }) => (
          <CertCard cert={item} onPress={() => router.push(`/cert/${item.certNumber}`)} />
        )}
        ListEmptyComponent={
          <Text style={styles.empty}>
            {certs.isLoading ? 'Loading…' : 'No certs yet.'}
          </Text>
        }
      />
      <Pressable style={styles.fab} onPress={() => router.push('/new-cert')}>
        <Text style={styles.fabText}>+ New Cert</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.bg },
  cog: { fontSize: 20 },
  search: {
    margin: theme.spacing(4),
    marginBottom: 0,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 8,
    padding: theme.spacing(3),
    backgroundColor: theme.colors.card,
  },
  list: { padding: theme.spacing(4), gap: theme.spacing(3), paddingBottom: 96 },
  empty: { textAlign: 'center', color: theme.colors.subtle, marginTop: theme.spacing(10) },
  fab: {
    position: 'absolute',
    bottom: theme.spacing(8),
    right: theme.spacing(6),
    backgroundColor: theme.colors.accent,
    borderRadius: 999,
    paddingVertical: theme.spacing(3),
    paddingHorizontal: theme.spacing(5),
  },
  fabText: { color: '#ffffff', fontWeight: '700', fontSize: 16 },
});
