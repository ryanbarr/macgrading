import { router } from 'expo-router';
import { useState } from 'react';
import {
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useAuth } from '../src/auth/auth-context';
import { signInWithGoogle } from '../src/auth/google-sign-in';
import { theme } from '../src/theme';

const DEV_AUTH = process.env.EXPO_PUBLIC_DEV_AUTH === 'true';

export default function SignIn() {
  const { signIn } = useAuth();
  const [devEmail, setDevEmail] = useState('');
  const [busy, setBusy] = useState(false);

  const finish = async (idToken: string) => {
    setBusy(true);
    try {
      await signIn(idToken);
      router.replace('/');
    } catch (error) {
      Alert.alert('Sign-in failed', error instanceof Error ? error.message : 'Unknown error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>MAC Grading</Text>
      <Text style={styles.subtitle}>Team sign-in</Text>

      <Pressable
        style={styles.button}
        disabled={busy}
        onPress={async () => {
          try {
            await finish(await signInWithGoogle());
          } catch (error) {
            Alert.alert(
              'Google sign-in',
              error instanceof Error ? error.message : 'Unknown error',
            );
          }
        }}
      >
        <Text style={styles.buttonText}>Sign in with Google</Text>
      </Pressable>

      {DEV_AUTH && (
        <View style={styles.devBox}>
          <Text style={styles.devLabel}>Dev sign-in (needs EXPO_PUBLIC_DEV_AUTH here + AUTH_DEV_MODE on the API)</Text>
          <TextInput
            style={styles.input}
            placeholder="team@macgrading.com"
            autoCapitalize="none"
            keyboardType="email-address"
            value={devEmail}
            onChangeText={setDevEmail}
          />
          <Pressable
            style={[styles.button, styles.devButton]}
            disabled={busy || devEmail.length < 3}
            onPress={() => finish(devEmail)}
          >
            <Text style={styles.buttonText}>Dev sign-in</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing(6),
  },
  title: { fontSize: 32, fontWeight: '700', color: theme.colors.text },
  subtitle: {
    fontSize: 16,
    color: theme.colors.subtle,
    marginBottom: theme.spacing(8),
  },
  button: {
    backgroundColor: theme.colors.accent,
    paddingVertical: theme.spacing(3),
    paddingHorizontal: theme.spacing(6),
    borderRadius: 8,
    alignItems: 'center',
  },
  buttonText: { color: '#ffffff', fontSize: 16, fontWeight: '600' },
  devBox: {
    marginTop: theme.spacing(10),
    width: '100%',
    padding: theme.spacing(4),
    backgroundColor: theme.colors.card,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: 8,
    gap: theme.spacing(3),
  },
  devLabel: { color: theme.colors.subtle, fontSize: 13 },
  devButton: { backgroundColor: theme.colors.subtle },
  input: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 6,
    padding: theme.spacing(3),
    backgroundColor: '#ffffff',
    color: theme.colors.text,
  },
});
