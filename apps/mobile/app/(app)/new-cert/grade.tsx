import type { CardSummary } from '@macgrading/shared';
import { Redirect, router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useGradeNames } from '../../../src/api/queries';
import { GradePicker } from '../../../src/components/GradePicker';
import { LabelPreview } from '../../../src/components/LabelPreview';
import { theme } from '../../../src/theme';

/** Pre-mint grade entry: the label above builds live as the grade is picked. */
export default function NewCertGrade() {
  const params = useLocalSearchParams<{ card: string }>();
  const gradeNames = useGradeNames();
  const [selected, setSelected] = useState<string | null>(null);

  let card: CardSummary | null = null;
  try {
    card = params.card ? (JSON.parse(params.card) as CardSummary) : null;
  } catch {
    card = null;
  }
  if (!card) {
    return <Redirect href="/new-cert" />;
  }

  const selectedName = selected
    ? (gradeNames.data?.find(
        (entry) => Number(entry.gradeValue) === Number(selected),
      )?.name ?? null)
    : null;

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: 'Enter Grade' }} />
      <LabelPreview
        card={card}
        certNumber={null}
        grade={selected}
        gradeName={selectedName}
        isPrototype={false}
      />
      <GradePicker
        value={selected}
        gradeNames={gradeNames.data ?? []}
        onSelect={setSelected}
      />
      <Pressable
        style={[styles.button, !selected && styles.buttonDisabled]}
        disabled={!selected}
        onPress={() =>
          router.push({
            pathname: '/new-cert/confirm',
            params: { card: params.card, grade: selected },
          })
        }
      >
        <Text style={styles.buttonText}>Confirm Grade</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.bg,
    padding: theme.spacing(4),
    gap: theme.spacing(4),
  },
  button: {
    backgroundColor: theme.colors.accent,
    borderRadius: 8,
    padding: theme.spacing(4),
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.4 },
  buttonText: { color: '#ffffff', fontWeight: '700', fontSize: 16 },
});
