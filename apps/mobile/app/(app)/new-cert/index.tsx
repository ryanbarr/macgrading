import type { CardDetailDto } from '@macgrading/shared';
import { router, Stack } from 'expo-router';
import { useState } from 'react';
import {
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useCardSearch } from '../../../src/api/queries';
import { theme } from '../../../src/theme';

export default function CardSearch() {
  const [q, setQ] = useState('');
  const search = useCardSearch(q);

  const select = (card: CardDetailDto) => {
    router.push({
      pathname: '/new-cert/card',
      params: { card: JSON.stringify(card) },
    });
  };

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: 'Find the card' }} />
      <TextInput
        style={styles.search}
        placeholder="Card name, set, or category"
        autoFocus
        autoCapitalize="none"
        value={q}
        onChangeText={setQ}
      />
      <FlatList
        data={search.data ?? []}
        keyExtractor={(card) => card.cardboardTensId}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <Pressable style={styles.row} onPress={() => select(item)}>
            {item.cardThumbUrl ? (
              <Image
                source={{ uri: item.cardThumbUrl }}
                style={styles.thumb}
                resizeMode="cover"
                accessibilityLabel={`Card image for ${item.cardName}`}
              />
            ) : (
              <View style={[styles.thumb, styles.thumbPlaceholder]} />
            )}
            <View style={styles.rowText}>
              <Text style={styles.name}>{item.cardName}</Text>
              <Text style={styles.meta}>
                {item.setName}
                {item.cardNumber ? ` · ${item.cardNumber}` : ''}
                {item.releaseYear ? ` · ${item.releaseYear}` : ''}
              </Text>
              {item.variants.length > 0 && (
                <Text style={styles.variants} numberOfLines={1}>
                  {item.variants.join(' · ')}
                </Text>
              )}
            </View>
          </Pressable>
        )}
        ListEmptyComponent={
          <Text style={styles.empty}>
            {q.trim().length < 2
              ? 'Type at least 2 characters to search CardboardTens.'
              : search.isFetching
                ? 'Searching…'
                : 'No cards found.'}
          </Text>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.bg },
  search: {
    margin: theme.spacing(4),
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 8,
    padding: theme.spacing(3),
    backgroundColor: theme.colors.card,
  },
  list: { paddingHorizontal: theme.spacing(4), gap: theme.spacing(2) },
  row: {
    backgroundColor: theme.colors.card,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: 8,
    padding: theme.spacing(3),
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing(3),
  },
  rowText: { flex: 1 },
  thumb: { width: 46, height: 64, borderRadius: 4 },
  thumbPlaceholder: {
    backgroundColor: theme.colors.bg,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  name: { fontSize: 16, fontWeight: '600', color: theme.colors.text },
  meta: { fontSize: 13, color: theme.colors.subtle },
  variants: { fontSize: 12, color: theme.colors.accent, fontWeight: '600' },
  empty: { textAlign: 'center', color: theme.colors.subtle, marginTop: theme.spacing(8) },
});
