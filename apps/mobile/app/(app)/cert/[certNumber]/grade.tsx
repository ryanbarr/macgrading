import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useCert, useGradeNames, useSetGrade } from '../../../../src/api/queries';
import { GradePicker } from '../../../../src/components/GradePicker';
import { theme } from '../../../../src/theme';

export default function GradeEntry() {
  const { certNumber } = useLocalSearchParams<{ certNumber: string }>();
  const cert = useCert(certNumber);
  const gradeNames = useGradeNames();
  const setGrade = useSetGrade(certNumber);
  const [selected, setSelected] = useState<string | null>(null);

  const selectedName = selected
    ? (gradeNames.data?.find((g) => Number(g.gradeValue) === Number(selected))?.name ?? null)
    : null;

  const confirm = () => {
    if (!selected) return;
    Alert.alert(
      'Confirm grade',
      `Grade ${selected}${selectedName ? ` — ${selectedName}` : ''} for ${certNumber}? Grades are frozen once saved.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Save grade',
          style: 'destructive',
          onPress: () =>
            setGrade.mutate(selected, {
              onSuccess: () => router.replace(`/cert/${certNumber}`),
              onError: (error) => Alert.alert('Grading failed', error.message),
            }),
        },
      ],
    );
  };

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: `Grade ${certNumber}` }} />
      <Text style={styles.card}>{cert.data?.cardName ?? ''}</Text>
      <Text style={styles.prompt}>What did the dice say?</Text>
      <GradePicker
        value={selected}
        gradeNames={gradeNames.data ?? []}
        onSelect={setSelected}
      />
      <View style={styles.selectedBox}>
        <Text style={styles.selectedText}>
          {selected
            ? `${selected}${selectedName ? ` — ${selectedName}` : ' (no name configured yet)'}`
            : 'Pick a grade'}
        </Text>
      </View>
      <Pressable
        style={[styles.button, (!selected || setGrade.isPending) && styles.buttonDisabled]}
        disabled={!selected || setGrade.isPending}
        onPress={confirm}
      >
        <Text style={styles.buttonText}>
          {setGrade.isPending ? 'Saving…' : 'Confirm grade'}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.bg, padding: theme.spacing(4), gap: theme.spacing(4) },
  card: { fontSize: 18, fontWeight: '600', color: theme.colors.text },
  prompt: { fontSize: 14, color: theme.colors.subtle },
  selectedBox: {
    backgroundColor: theme.colors.card,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: 8,
    padding: theme.spacing(4),
    alignItems: 'center',
  },
  selectedText: { fontSize: 18, fontWeight: '700', color: theme.colors.text },
  button: {
    backgroundColor: theme.colors.accent,
    borderRadius: 8,
    padding: theme.spacing(4),
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.4 },
  buttonText: { color: '#ffffff', fontWeight: '700', fontSize: 16 },
});
