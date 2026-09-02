import type { CardDetailDto } from '@macgrading/shared';
import { Redirect, router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import {
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { useGradeNames, useMintCert } from '../../../src/api/queries';
import { useMode } from '../../../src/mode/mode-context';
import { CardImageViewer } from '../../../src/components/CardImageViewer';
import { LabelPreview } from '../../../src/components/LabelPreview';
import { theme } from '../../../src/theme';

function DetailRow({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

/** Final double check — card AND label — before the irreversible mint. */
export default function ConfirmMint() {
  const params = useLocalSearchParams<{ card: string; grade: string }>();
  const [isPrototype, setIsPrototype] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);
  const { isTestMode } = useMode();
  const gradeNames = useGradeNames();
  const mint = useMintCert();

  let card: CardDetailDto | null = null;
  try {
    card = params.card ? (JSON.parse(params.card) as CardDetailDto) : null;
  } catch {
    card = null;
  }
  const grade = params.grade ?? null;
  if (!card || !grade) {
    return <Redirect href="/new-cert" />;
  }

  const gradeName =
    gradeNames.data?.find(
      (entry) => Number(entry.gradeValue) === Number(grade),
    )?.name ?? null;

  const confirm = () => {
    Alert.alert(
      isTestMode ? 'Mint TEST certification?' : 'Mint certification?',
      `This permanently assigns the next ${isTestMode ? 'test ' : ''}${isPrototype ? 'prototype ' : ''}number to “${card.cardName}” at grade ${grade}${gradeName ? ` — ${gradeName}` : ''}. This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Mint it',
          style: 'destructive',
          onPress: () => {
            mint.mutate(
              {
                cardboardTensId: card.cardboardTensId,
                isPrototype,
                isTest: isTestMode,
                grade,
              },
              {
                onSuccess: (cert) => {
                  if (cert.isTest !== isTestMode) {
                    // Mode mismatch means the API ignored our flag (version
                    // skew). The cert exists either way — say so loudly.
                    Alert.alert(
                      'Mode mismatch!',
                      `The API minted ${cert.certNumber} as a ${cert.isTest ? 'TEST' : 'LIVE'} cert, but the app is in ${isTestMode ? 'Test' : 'Live'} Mode. The API may be running outdated code — restart it and report this number.`,
                    );
                  }
                  router.replace({
                    pathname: '/new-cert/created',
                    params: { certNumber: cert.certNumber },
                  });
                },
                onError: (error) => Alert.alert('Mint failed', error.message),
              },
            );
          },
        },
      ],
    );
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: 'Final check' }} />

      <Text style={styles.sectionTitle}>The card</Text>
      <View style={styles.cardBox}>
        {card.cardThumbUrl ? (
          <Pressable
            onPress={() => setViewerOpen(true)}
            accessibilityLabel={`Card image for ${card.cardName} — tap to zoom`}
          >
            <Image
              source={{ uri: card.cardThumbUrl }}
              style={styles.thumb}
              resizeMode="cover"
            />
          </Pressable>
        ) : (
          <View style={[styles.thumb, styles.thumbPlaceholder]} />
        )}
        <View style={styles.details}>
          <DetailRow label="Card" value={card.cardName} />
          <DetailRow label="Set" value={card.setName} />
          <DetailRow label="Number" value={card.cardNumber} />
          <DetailRow
            label="Year"
            value={card.releaseYear ? String(card.releaseYear) : null}
          />
          <DetailRow
            label="Variants"
            value={card.variants.length > 0 ? card.variants.join(' · ') : null}
          />
          <DetailRow label="Rarity" value={card.rarity} />
          <DetailRow label="Category" value={card.category} />
        </View>
      </View>

      <Text style={styles.sectionTitle}>The label</Text>
      <LabelPreview
        card={card}
        certNumber={null}
        grade={grade}
        gradeName={gradeName}
        isPrototype={isPrototype}
        isTest={isTestMode}
        variants={card.variants}
      />

      <Pressable
        style={styles.protoRow}
        onPress={() => setIsPrototype((value) => !value)}
        accessibilityRole="switch"
        accessibilityState={{ checked: isPrototype }}
      >
        <Text style={styles.protoLabel}>Prototype</Text>
        <Switch value={isPrototype} onValueChange={setIsPrototype} />
      </Pressable>

      <Text style={styles.warning}>
        Check every detail — confirming mints a permanent sequential number
        with this grade already frozen.
      </Text>
      <Pressable style={styles.button} disabled={mint.isPending} onPress={confirm}>
        <Text style={styles.buttonText}>
          {mint.isPending ? 'Minting…' : 'Mint Certification'}
        </Text>
      </Pressable>
      <CardImageViewer
        visible={viewerOpen}
        imageUrl={card.cardImageUrl ?? card.cardThumbUrl ?? null}
        onClose={() => setViewerOpen(false)}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.bg },
  content: { padding: theme.spacing(4), gap: theme.spacing(4), paddingBottom: 48 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: theme.colors.text },
  cardBox: {
    flexDirection: 'row',
    gap: theme.spacing(4),
    backgroundColor: theme.colors.card,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: 8,
    padding: theme.spacing(4),
  },
  thumb: { width: 69, height: 96, borderRadius: 4 },
  thumbPlaceholder: {
    backgroundColor: theme.colors.bg,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  details: { flex: 1, gap: theme.spacing(1) },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', gap: theme.spacing(2) },
  detailLabel: { fontSize: 13, color: theme.colors.subtle },
  detailValue: { fontSize: 13, color: theme.colors.text, fontWeight: '600', flexShrink: 1, textAlign: 'right' },
  protoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: theme.colors.card,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: 8,
    padding: theme.spacing(3),
  },
  protoLabel: { fontSize: 16, color: theme.colors.text },
  warning: { color: theme.colors.subtle, fontSize: 13 },
  button: {
    backgroundColor: theme.colors.accent,
    borderRadius: 8,
    padding: theme.spacing(4),
    alignItems: 'center',
  },
  buttonText: { color: '#ffffff', fontWeight: '700', fontSize: 16 },
});
