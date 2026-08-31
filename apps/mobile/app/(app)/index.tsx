import { router, Stack } from 'expo-router';
import { useState } from 'react';
import {
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
import { theme } from '../../src/theme';

export default function Home() {
  const { signOut } = useAuth();
  const [q, setQ] = useState('');
  const certs = useCerts(q);

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: 'Certs',
          headerRight: () => (
            <Pressable onPress={signOut}>
              <Text style={styles.signOut}>Sign out</Text>
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
  signOut: { color: theme.colors.subtle, fontSize: 14 },
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
