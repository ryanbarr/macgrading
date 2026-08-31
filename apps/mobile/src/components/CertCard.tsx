import type { CertDto } from '@macgrading/shared';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { theme } from '../theme';
import { StatusChip } from './StatusChip';

export function CertCard({ cert, onPress }: { cert: CertDto; onPress: () => void }) {
  return (
    <Pressable style={styles.card} onPress={onPress}>
      <View style={styles.header}>
        <Text style={styles.number}>{cert.certNumber}</Text>
        {cert.grade && (
          <Text style={styles.grade}>
            {cert.grade}
            {cert.gradeName ? ` · ${cert.gradeName}` : ''}
          </Text>
        )}
      </View>
      <Text style={styles.name}>{cert.cardName}</Text>
      <Text style={styles.set}>
        {cert.setName}
        {cert.releaseYear ? ` · ${cert.releaseYear}` : ''}
      </Text>
      <StatusChip status={cert.status} photoCount={cert.photos.length} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.card,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: 8,
    padding: theme.spacing(4),
    gap: theme.spacing(1),
  },
  header: { flexDirection: 'row', justifyContent: 'space-between' },
  number: { fontFamily: 'Menlo', fontSize: 15, color: theme.colors.text },
  grade: { fontSize: 14, fontWeight: '700', color: theme.colors.text },
  name: { fontSize: 17, fontWeight: '600', color: theme.colors.text },
  set: { fontSize: 13, color: theme.colors.subtle },
});
