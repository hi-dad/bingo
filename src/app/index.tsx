import { useCallback, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { Link, Stack, router, useFocusEffect } from 'expo-router';
import { api } from '@/api';
import type { GameSummary } from '@shared/types';
import { Button, Card, ErrorText, Muted, styles as ui } from '@/components/ui';
import { colors } from '@/theme';

export default function Games() {
  const [games, setGames] = useState<GameSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setGames(await api.games());
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <View style={ui.screen}>
      <Stack.Screen options={{
        headerRight: () => (
          <Link href="/settings" asChild>
            <Pressable hitSlop={12} accessibilityLabel="Settings"><Text style={styles.gear}>⚙︎</Text></Pressable>
          </Link>
        ),
      }} />
      <FlatList
        data={games ?? []}
        keyExtractor={(g) => g.id}
        contentContainerStyle={[ui.content, { flexGrow: 1 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
        ListHeaderComponent={<ErrorText>{error}</ErrorText>}
        ListEmptyComponent={games ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>No games yet</Text>
            <Muted style={{ textAlign: 'center' }}>Start one and send the link to your group chat, or join with a code a friend sent you.</Muted>
          </View>
        ) : undefined}
        renderItem={({ item }) => (
          <Pressable onPress={() => router.push(`/game/${item.id}`)}>
            <Card>
              <View style={styles.row}>
                <Text style={styles.name}>{item.name}</Text>
                <Text style={[styles.badge, item.status === 'playing' && styles.live]}>
                  {item.status === 'playing' ? 'LIVE' : 'WRITING'}
                </Text>
              </View>
              <Muted>{item.players} {item.players === 1 ? 'player' : 'players'} · code {item.code}</Muted>
            </Card>
          </Pressable>
        )}
        ListFooterComponent={
          <View style={styles.actions}>
            <Button title="New game" onPress={() => router.push('/new')} />
            <Button kind="secondary" title="Join with a code" onPress={() => router.push('/join')} />
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  gear: { fontSize: 24, color: colors.ink },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  name: { fontSize: 19, fontWeight: '800', color: colors.ink, flexShrink: 1 },
  badge: { fontSize: 11, fontWeight: '800', letterSpacing: 1, color: colors.muted, backgroundColor: colors.line, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, overflow: 'hidden' },
  live: { color: colors.accentInk, backgroundColor: colors.accent },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 48 },
  emptyTitle: { fontSize: 22, fontWeight: '800', color: colors.ink },
  actions: { gap: 12, marginTop: 8 },
});
