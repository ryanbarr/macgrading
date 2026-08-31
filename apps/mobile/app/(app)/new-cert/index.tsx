import type { CardSummary } from '@macgrading/shared';
import { router, Stack } from 'expo-router';
import { useState } from 'react';
import {
  FlatList,
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

  const select = (card: CardSummary) => {
    router.push({
      pathname: '/new-cert/preview',
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
            <Text style={styles.name}>{item.cardName}</Text>
            <Text style={styles.meta}>
              {item.setName}
              {item.cardNumber ? ` · ${item.cardNumber}` : ''}
              {item.releaseYear ? ` · ${item.releaseYear}` : ''}
            </Text>
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
  },
  name: { fontSize: 16, fontWeight: '600', color: theme.colors.text },
  meta: { fontSize: 13, color: theme.colors.subtle },
  empty: { textAlign: 'center', color: theme.colors.subtle, marginTop: theme.spacing(8) },
});
