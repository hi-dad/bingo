import { useCallback, useState } from 'react';
import { FlatList, Pressable, RefreshControl, Text, View } from 'react-native';
import { Icon } from '@/components/Icon';
import { Link, Stack, router, useFocusEffect } from 'expo-router';
import { api } from '@/api';
import type { GameSummary } from '@shared/types';
import { Button, ErrorText, Muted, useUi } from '@/components/ui';
import { makeStyles, radius, shadow, useTheme } from '@/theme';

function MiniBoard({ item }: { item: GameSummary }) {
  const s = useStyles();
  const cells = item.myMarks ?? Array<boolean>(item.size * item.size).fill(false);
  return (
    <View accessibilityLabel={item.progress ? `${item.progress.marked} of ${item.progress.total} squares spotted` : 'Board not dealt yet'} style={[s.miniBoard, { width: item.size * 12 + (item.size - 1) * 3 }]}>
      {cells.map((marked, index) => <View key={index} style={[s.miniSquare, marked && s.miniSquareMarked]} />)}
    </View>
  );
}

function progressCopy(item: GameSummary): string {
  if (!item.progress) return 'Your board is being written';
  if (item.progress.blackoutAt) return 'Board complete';
  if (item.progress.bingoAt) return 'Bingo · Going for blackout';
  return item.round > 1 ? `Your board ${item.round}` : 'Your board';
}

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
        ListHeaderComponent={(
          <View style={s.header}>
            <ErrorText>{error}</ErrorText>
            {games?.length ? <Text style={s.sectionTitle}>YOUR GAMES</Text> : null}
          </View>
        )}
        ListEmptyComponent={games ? (
          <View style={s.empty}>
            <Text style={s.emptyTitle}>No games yet</Text>
            <Muted style={{ textAlign: 'center' }}>Start one and send the link to your group chat, or join with a code a friend sent you.</Muted>
          </View>
        ) : undefined}
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${item.name}, ${item.status === 'playing' ? 'playing' : 'needs info'}`}
            onPress={() => router.push(`/game/${item.id}`)}
            style={({ pressed }) => [s.gameCard, pressed && s.pressed]}
          >
            <View style={s.cardTop}>
              <View style={s.gameCopy}>
                <View style={s.row}>
                  <Text style={s.name}>{item.name}</Text>
                  <Text style={[s.badge, item.status === 'playing' && s.live]}>{item.status === 'playing' ? 'PLAYING' : 'NEEDS INFO'}</Text>
                </View>
                <Muted>{item.players} {item.players === 1 ? 'player' : 'players'}</Muted>
              </View>
              <MiniBoard item={item} />
            </View>
            <View style={s.progressTrack}>
              <View style={[s.progressFill, { width: `${item.progress ? (item.progress.marked / item.progress.total) * 100 : 0}%` as `${number}%` }]} />
            </View>
            <View style={s.progressRow}>
              <Muted style={s.progressLabel}>{progressCopy(item)}</Muted>
              <Text style={s.progressCount}>{item.progress ? `${item.progress.marked}/${item.progress.total}` : `${item.ownPoolCount}/25`}</Text>
            </View>
          </Pressable>
        )}
        ListFooterComponent={
          <View style={s.actions}>
            <Button style={s.action} title="New game" onPress={() => router.push('/new')} />
            <Button style={s.action} kind="secondary" title="Join" onPress={() => router.push('/join')} />
          </View>
        }
      />
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  header: { gap: 12 },
  sectionTitle: { color: t.muted, fontSize: 12, fontWeight: '800', letterSpacing: 1.4 },
  gameCard: { backgroundColor: t.card, borderRadius: radius.lg, padding: 18, gap: 14, marginBottom: 14, ...shadow(t) },
  pressed: { transform: [{ scale: 0.985 }] },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 },
  gameCopy: { flex: 1, gap: 5 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  name: { fontSize: 19, fontWeight: '800', color: t.ink, flexShrink: 1 },
  badge: { fontSize: 11, fontWeight: '800', letterSpacing: 1, color: t.muted, backgroundColor: t.soft, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, overflow: 'hidden' },
  live: { color: t.strongInk, backgroundColor: t.strong },
  miniBoard: { flexDirection: 'row', flexWrap: 'wrap', gap: 3 },
  miniSquare: { width: 12, height: 12, borderRadius: 3, backgroundColor: t.soft },
  miniSquareMarked: { backgroundColor: t.accent },
  progressTrack: { height: 7, borderRadius: 4, backgroundColor: t.soft, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 4, backgroundColor: t.strong },
  progressRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  progressLabel: { flex: 1, fontSize: 13, lineHeight: 18 },
  progressCount: { color: t.muted, fontSize: 13, fontWeight: '700' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 48 },
  emptyTitle: { fontSize: 22, fontWeight: '800', color: t.ink },
  actions: { flexDirection: 'row', gap: 12, marginTop: 4 },
  action: { flex: 1 },
}));
