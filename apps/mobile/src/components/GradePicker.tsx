import type { GradeNameDto } from '@macgrading/shared';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { theme } from '../theme';

const WHOLE_GRADES = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'];

interface Props {
  value: string | null;
  gradeNames: GradeNameDto[];
  onSelect: (grade: string) => void;
}

export function GradePicker({ value, gradeNames, onSelect }: Props) {
  const nameFor = (grade: string) =>
    gradeNames.find((entry) => Number(entry.gradeValue) === Number(grade))?.name ?? null;

  return (
    <View style={styles.grid}>
      {WHOLE_GRADES.map((grade) => {
        const selected = value === grade;
        return (
          <Pressable
            key={grade}
            style={[styles.cell, selected && styles.cellSelected]}
            onPress={() => onSelect(grade)}
          >
            <Text style={[styles.gradeText, selected && styles.gradeTextSelected]}>
              {grade}
            </Text>
            {nameFor(grade) && (
              <Text style={[styles.nameText, selected && styles.gradeTextSelected]}>
                {nameFor(grade)}
              </Text>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) },
  cell: {
    width: '18%',
    minWidth: 64,
    aspectRatio: 1,
    backgroundColor: theme.colors.card,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 2,
  },
  cellSelected: { backgroundColor: theme.colors.accent, borderColor: theme.colors.accent },
  gradeText: { fontSize: 20, fontWeight: '700', color: theme.colors.text },
  gradeTextSelected: { color: '#ffffff' },
  nameText: { fontSize: 9, color: theme.colors.subtle, textAlign: 'center' },
});
