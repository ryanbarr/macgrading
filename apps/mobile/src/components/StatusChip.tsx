import type { CertStatus } from '@macgrading/shared';
import { StyleSheet, Text, View } from 'react-native';
import { theme } from '../theme';

export function StatusChip({
  status,
  photoCount,
}: {
  status: CertStatus;
  photoCount: number;
}) {
  const label = status === 'PENDING_GRADE' ? 'Needs grade' : 'Graded';
  return (
    <View style={styles.row}>
      <View style={[styles.chip, status === 'GRADED' && styles.chipDone]}>
        <Text style={styles.chipText}>{label}</Text>
      </View>
      <Text style={styles.photos}>
        {photoCount === 0 ? 'No photos' : `${photoCount} photo${photoCount === 1 ? '' : 's'}`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2) },
  chip: {
    backgroundColor: '#e5e5e5',
    paddingHorizontal: theme.spacing(2),
    paddingVertical: 2,
    borderRadius: 999,
  },
  chipDone: { backgroundColor: '#d4d4d4' },
  chipText: { fontSize: 12, color: theme.colors.text },
  photos: { fontSize: 12, color: theme.colors.subtle },
});
