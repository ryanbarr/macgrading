import * as Clipboard from 'expo-clipboard';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { theme } from '../../../src/theme';

export default function Created() {
  const { certNumber } = useLocalSearchParams<{ certNumber: string }>();

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: 'Cert minted', headerBackVisible: false }} />
      <Text style={styles.caption}>Certification number</Text>
      <Pressable
        onPress={async () => {
          await Clipboard.setStringAsync(certNumber);
        }}
      >
        <Text style={styles.number}>{certNumber}</Text>
        <Text style={styles.hint}>Tap to copy — enter it in the label printer</Text>
      </Pressable>
      <Pressable
        style={styles.button}
        onPress={() => router.replace(`/cert/${certNumber}/grade`)}
      >
        <Text style={styles.buttonText}>Enter the grade</Text>
      </Pressable>
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
    gap: theme.spacing(4),
  },
  caption: { fontSize: 14, color: theme.colors.subtle },
  number: {
    fontFamily: 'Menlo',
    fontSize: 40,
    fontWeight: '700',
    color: theme.colors.text,
    textAlign: 'center',
  },
  hint: { fontSize: 12, color: theme.colors.subtle, textAlign: 'center', marginTop: 4 },
  button: {
    marginTop: theme.spacing(6),
    backgroundColor: theme.colors.accent,
    borderRadius: 8,
    paddingVertical: theme.spacing(4),
    paddingHorizontal: theme.spacing(8),
  },
  buttonText: { color: '#ffffff', fontWeight: '700', fontSize: 16 },
});
