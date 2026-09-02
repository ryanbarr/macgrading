import type { CardDetailDto } from '@macgrading/shared';
import { Redirect, router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import {
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
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

/** Pre-grade card inspection: every detail the catalog knows, zoomable art. */
export default function CardDetail() {
  const params = useLocalSearchParams<{ card: string }>();
  const [viewerOpen, setViewerOpen] = useState(false);

  let card: CardDetailDto | null = null;
  try {
    card = params.card ? (JSON.parse(params.card) as CardDetailDto) : null;
  } catch {
    card = null;
  }
  if (!card) {
    return <Redirect href="/new-cert" />;
  }

  const typeLine = [card.supertype, ...card.subtypes, ...card.types]
    .filter(Boolean)
    .join(' · ');

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: 'Card Details' }} />
      <ScrollView contentContainerStyle={styles.content}>
        {card.cardImageUrl ? (
          <Pressable
            onPress={() => setViewerOpen(true)}
            accessibilityLabel={`Card image for ${card.cardName} — tap to zoom`}
          >
            <Image
              source={{ uri: card.cardImageUrl }}
              style={styles.hero}
              resizeMode="contain"
            />
            <Text style={styles.zoomHint}>Tap to zoom</Text>
          </Pressable>
        ) : (
          <View style={[styles.hero, styles.heroPlaceholder]}>
            <Text style={styles.subtle}>No image available</Text>
          </View>
        )}

        <Text style={styles.name}>{card.cardName}</Text>
        {card.originalName && (
          <Text style={styles.originalName}>{card.originalName}</Text>
        )}

        <View style={styles.detailBox}>
          <DetailRow label="Set" value={card.setName} />
          <DetailRow label="Original set" value={card.originalSetName} />
          <DetailRow label="Series" value={card.setSeries} />
          <DetailRow label="Number" value={card.cardNumber} />
          <DetailRow
            label="Released"
            value={card.setReleaseDate ?? (card.releaseYear ? String(card.releaseYear) : null)}
          />
          <DetailRow label="Rarity" value={card.rarity} />
          <DetailRow
            label="Variants"
            value={card.variants.length > 0 ? card.variants.join(' · ') : null}
          />
          <DetailRow label="Type" value={typeLine || null} />
          <DetailRow label="HP" value={card.hp} />
          <DetailRow label="Artist" value={card.artist} />
          <DetailRow
            label="Pokédex"
            value={
              card.nationalPokedexNumbers.length > 0
                ? card.nationalPokedexNumbers.join(', ')
                : null
            }
          />
          <DetailRow label="Language" value={card.languageCode} />
          <DetailRow label="Category" value={card.category} />
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <Pressable
          style={styles.button}
          onPress={() =>
            router.push({
              pathname: '/new-cert/grade',
              params: { card: params.card },
            })
          }
        >
          <Text style={styles.buttonText}>Confirm Card</Text>
        </Pressable>
      </View>

      <Modal
        visible={viewerOpen}
        animationType="fade"
        onRequestClose={() => setViewerOpen(false)}
      >
        <View style={styles.viewer}>
          <ScrollView
            style={styles.viewerScroll}
            contentContainerStyle={styles.viewerContent}
            maximumZoomScale={5}
            minimumZoomScale={1}
            bouncesZoom
            centerContent
          >
            {card.cardImageUrl && (
              <Image
                source={{ uri: card.cardImageUrl }}
                style={styles.viewerImage}
                resizeMode="contain"
              />
            )}
          </ScrollView>
          <Pressable
            style={styles.viewerClose}
            onPress={() => setViewerOpen(false)}
            accessibilityLabel="Close image viewer"
          >
            <Text style={styles.viewerCloseText}>Close</Text>
          </Pressable>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.bg },
  content: { padding: theme.spacing(4), gap: theme.spacing(3), paddingBottom: 112 },
  hero: { width: '100%', height: 320 },
  heroPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.card,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 8,
  },
  zoomHint: {
    textAlign: 'center',
    fontSize: 12,
    color: theme.colors.subtle,
    marginTop: theme.spacing(1),
  },
  subtle: { color: theme.colors.subtle },
  name: { fontSize: 24, fontWeight: '700', color: theme.colors.text },
  originalName: { fontSize: 16, color: theme.colors.subtle, marginTop: -theme.spacing(2) },
  detailBox: {
    backgroundColor: theme.colors.card,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: 8,
    padding: theme.spacing(4),
    gap: theme.spacing(2),
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: theme.spacing(3),
  },
  detailLabel: { fontSize: 14, color: theme.colors.subtle },
  detailValue: {
    fontSize: 14,
    color: theme.colors.text,
    fontWeight: '600',
    flexShrink: 1,
    textAlign: 'right',
  },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: theme.spacing(4),
    paddingBottom: theme.spacing(8),
    backgroundColor: theme.colors.bg,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  button: {
    backgroundColor: theme.colors.accent,
    borderRadius: 8,
    padding: theme.spacing(4),
    alignItems: 'center',
  },
  buttonText: { color: '#ffffff', fontWeight: '700', fontSize: 16 },
  viewer: { flex: 1, backgroundColor: '#171717' },
  viewerScroll: { flex: 1 },
  viewerContent: { flexGrow: 1, alignItems: 'center', justifyContent: 'center' },
  viewerImage: { width: '100%', aspectRatio: 63 / 88 },
  viewerClose: {
    position: 'absolute',
    top: theme.spacing(14),
    right: theme.spacing(5),
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 999,
    paddingVertical: theme.spacing(2),
    paddingHorizontal: theme.spacing(4),
  },
  viewerCloseText: { color: '#ffffff', fontWeight: '600' },
});
