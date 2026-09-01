import type { CardSummary } from '@macgrading/shared';
import { Redirect, router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { useMintCert } from '../../../src/api/queries';
import { LabelPreview } from '../../../src/components/LabelPreview';
import { theme } from '../../../src/theme';

export default function Preview() {
  const params = useLocalSearchParams<{ card: string }>();
  let card: CardSummary | null = null;
  try {
    card = params.card ? (JSON.parse(params.card) as CardSummary) : null;
  } catch {
    card = null;
  }
  if (!card) {
    return <Redirect href="/new-cert" />;
  }
  const [isPrototype, setIsPrototype] = useState(false);
  const mint = useMintCert();

  const confirm = () => {
    Alert.alert(
      'Mint certification?',
      `This permanently assigns the next ${isPrototype ? 'prototype ' : ''}number to "${card.cardName}". This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Mint it',
          style: 'destructive',
          onPress: () => {
            mint.mutate(
              { cardboardTensId: card.cardboardTensId, isPrototype },
              {
                onSuccess: (cert) =>
                  router.replace({
                    pathname: '/new-cert/created',
                    params: { certNumber: cert.certNumber },
                  }),
                onError: (error) =>
                  Alert.alert('Mint failed', error.message),
              },
            );
          },
        },
      ],
    );
  };

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: 'Confirm label' }} />
      <LabelPreview
        card={card}
        certNumber={null}
        grade={null}
        gradeName={null}
        isPrototype={isPrototype}
      />
      <View style={styles.protoRow}>
        <Text style={styles.protoLabel}>Prototype</Text>
        <Switch value={isPrototype} onValueChange={setIsPrototype} />
      </View>
      <Text style={styles.warning}>
        Check every detail — confirming mints a permanent sequential number.
      </Text>
      <Pressable style={styles.button} disabled={mint.isPending} onPress={confirm}>
        <Text style={styles.buttonText}>
          {mint.isPending ? 'Minting…' : 'Details are correct — mint cert'}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.bg, padding: theme.spacing(4), gap: theme.spacing(4) },
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
