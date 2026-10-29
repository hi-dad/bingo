import { useCallback, useState } from 'react';
import { FlatList, Pressable, RefreshControl, Text, View } from 'react-native';
import { Icon } from '@/components/Icon';
import { Link, Stack, router, useFocusEffect } from 'expo-router';
import { api } from '@/api';
import type { GameSummary } from '@shared/types';
import { Button, Card, ErrorText, Muted, useUi } from '@/components/ui';
import { makeStyles, useTheme } from '@/theme';

export default function Games() {
  const ui = useUi();
  const s = useStyles();
  const { t } = useTheme();
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
            <Pressable hitSlop={12} accessibilityLabel="Settings"><Icon name="settings" size={22} color={t.ink} /></Pressable>
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
          <View style={s.empty}>
            <Text style={s.emptyTitle}>No games yet</Text>
            <Muted style={{ textAlign: 'center' }}>Start one and send the link to your group chat, or join with a code a friend sent you.</Muted>
          </View>
        ) : undefined}
        renderItem={({ item }) => (
          <Pressable onPress={() => router.push(`/game/${item.id}`)}>
            <Card>
              <View style={s.row}>
                <Text style={s.name}>{item.name}</Text>
                <Text style={[s.badge, item.status === 'playing' && s.live]}>{item.status === 'playing' ? 'LIVE' : 'WRITING'}</Text>
              </View>
              <Muted>{item.players} {item.players === 1 ? 'player' : 'players'} · code {item.code}</Muted>
            </Card>
          </Pressable>
        )}
        ListFooterComponent={
          <View style={s.actions}>
            <Button title="New game" onPress={() => router.push('/new')} />
            <Button kind="secondary" title="Join with a code" onPress={() => router.push('/join')} />
          </View>
        }
      />
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  name: { fontSize: 19, fontWeight: '800', color: t.ink, flexShrink: 1 },
  badge: { fontSize: 11, fontWeight: '800', letterSpacing: 1, color: t.muted, backgroundColor: t.soft, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, overflow: 'hidden' },
  live: { color: t.strongInk, backgroundColor: t.strong },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 48 },
  emptyTitle: { fontSize: 22, fontWeight: '800', color: t.ink },
  actions: { gap: 12, marginTop: 8 },
}));
