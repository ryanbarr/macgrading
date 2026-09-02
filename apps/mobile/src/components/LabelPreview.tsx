import type { CardSummary } from '@macgrading/shared';
import { StyleSheet, Text, View } from 'react-native';
import { theme } from '../theme';

interface Props {
  card: CardSummary;
  certNumber: string | null;
  grade: string | null;
  gradeName: string | null;
  isPrototype: boolean;
  /** Training cert — renders a TEST badge beside the brand. */
  isTest?: boolean;
  /** Variant labels (e.g. "Holofoil · 1st Edition") shown under the set line. */
  variants?: string[];
}

/** Wireframe rendering of the physical MAC label. */
export function LabelPreview({
  card,
  certNumber,
  grade,
  gradeName,
  isPrototype,
  isTest,
  variants,
}: Props) {
  return (
    <View style={styles.label}>
      <View style={styles.top}>
        <Text style={styles.brand}>MAC GRADING</Text>
        <View style={styles.badges}>
          {isTest && <Text style={styles.testBadge}>TEST</Text>}
          {isPrototype && <Text style={styles.proto}>PROTOTYPE</Text>}
        </View>
      </View>
      <Text style={styles.cardName}>{card.cardName}</Text>
      <Text style={styles.meta}>
        {card.setName}
        {card.cardNumber ? ` · ${card.cardNumber}` : ''}
        {card.releaseYear ? ` · ${card.releaseYear}` : ''}
      </Text>
      {variants && variants.length > 0 && (
        <Text style={styles.meta}>{variants.join(' · ')}</Text>
      )}
      {card.category && <Text style={styles.meta}>{card.category}</Text>}
      <View style={styles.bottom}>
        <Text style={styles.cert}>{certNumber ?? ''}</Text>
        <Text style={styles.grade}>
          {grade ? `${grade}${gradeName ? ` ${gradeName.toUpperCase()}` : ''}` : ''}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  label: {
    backgroundColor: '#ffffff',
    borderWidth: 2,
    borderColor: theme.colors.text,
    borderRadius: 4,
    padding: theme.spacing(4),
    gap: 2,
  },
  top: { flexDirection: 'row', justifyContent: 'space-between' },
  brand: { fontSize: 12, fontWeight: '800', letterSpacing: 2, color: theme.colors.text },
  proto: { fontSize: 11, fontWeight: '800', color: theme.colors.danger },
  badges: { flexDirection: 'row', gap: theme.spacing(2) },
  testBadge: {
    fontSize: 11,
    fontWeight: '800',
    color: '#ffffff',
    backgroundColor: theme.colors.danger,
    paddingHorizontal: theme.spacing(1),
    borderRadius: 2,
    overflow: 'hidden',
  },
  cardName: { fontSize: 18, fontWeight: '700', color: theme.colors.text, marginTop: 4 },
  meta: { fontSize: 12, color: theme.colors.subtle },
  bottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginTop: theme.spacing(3),
  },
  cert: { fontFamily: 'Menlo', fontSize: 13, color: theme.colors.text },
  grade: { fontSize: 16, fontWeight: '800', color: theme.colors.text },
});
