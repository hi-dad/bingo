import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { api } from '@/api';
import { inviteLink } from '@/config';
import { useGame } from '@/useGame';
import type { GameView, Player } from '@shared/types';
import { phrasesNeeded, type Size } from '@shared/logic';
import { ProgressCard } from '@/components/ProgressCard';
import { SizePicker } from '@/components/SizePicker';
import { Button, Card, ErrorText, Heading, Muted, styles as ui } from '@/components/ui';
import { colors } from '@/theme';

export default function GameHub() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { game, error, refreshing, refresh, act } = useGame(id);

  if (!game) {
    return (
      <View style={[ui.screen, ui.content]}>
        {error ? <ErrorText>{error}</ErrorText> : <ActivityIndicator color={colors.accent} />}
      </View>
    );
  }

  const invite = () => Share.share({
    message: `Join “${game.name}” on Bingo. We’re making bingo boards of the stuff we always say 😂\n${inviteLink(game.code)}\n(code ${game.code})`,
  });

  return (
    <ScrollView style={ui.screen} contentContainerStyle={ui.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}>
      <Stack.Screen options={{
        title: game.name,
        headerRight: () => <Pressable onPress={invite} hitSlop={12}><Text style={styles.link}>Invite</Text></Pressable>,
      }} />
      <ErrorText>{error}</ErrorText>
      {game.status === 'writing' ? <Writing game={game} invite={invite} act={act} /> : <Playing game={game} />}
    </ScrollView>
  );
}

// ---------- before the boards are dealt ----------

function Writing({ game, invite, act }: { game: GameView; invite: () => void; act: ReturnType<typeof useGame>['act'] }) {
  const me = game.players.find((p) => p.isMe)!;
  const others = game.players.filter((p) => !p.isMe);
  const owner = game.players.find((p) => p.isOwner);
  const [size, setSize] = useState<Size>(game.size);
  const [busy, setBusy] = useState(false);
  const need = phrasesNeeded(size);
  const short = game.players.filter((p) => p.poolCount < need);

  useEffect(() => setSize(game.size), [game.size]);

  async function deal() {
    setBusy(true);
    try {
      await act(() => api.start(game.id, size));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err) {
      Alert.alert('Not yet', (err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {others.length === 0 ? (
        <Card>
          <Heading>Invite your friends</Heading>
          <Muted>Send the link to your group chat. Everyone writes lines about everyone else.</Muted>
          <Text style={styles.code}>{game.code}</Text>
          <Button title="Share invite" onPress={invite} />
        </Card>
      ) : null}

      <Card>
        <Text style={styles.label}>ABOUT YOU (SECRET)</Text>
        <Text style={styles.big}>{me.poolCount === 0 ? 'Nobody’s written about you yet 😇' : `${me.poolCount} ${me.poolCount === 1 ? 'line' : 'lines'} written about you 👀`}</Text>
        <Muted>You’ll never see them. That’s the point.</Muted>
      </Card>

      {others.length ? <Heading>Write about your friends</Heading> : null}
      {others.map((p) => (
        <Pressable key={p.id} onPress={() => router.push(`/game/${game.id}/write/${p.id}`)}>
          <Card style={styles.row}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={styles.name}>{p.name}</Text>
              <Muted>{(game.pools[p.id] ?? []).filter((x) => x.mine).length} by you · {p.poolCount} total</Muted>
            </View>
            <Count have={p.poolCount} need={game.needed} />
          </Card>
        </Pressable>
      ))}

      {game.isOwner ? (
        <Card>
          <Heading>Deal the boards</Heading>
          <SizePicker value={size} onChange={setSize} />
          {short.length ? (
            <Muted>Waiting on lines for {short.map((p) => `${p.isMe ? 'you' : p.name} (${p.poolCount}/${need})`).join(', ')}.</Muted>
          ) : null}
          {others.length === 0 ? <Muted>Invite at least one friend first.</Muted> : null}
          <Button title="Deal the boards 🎲" busy={busy} disabled={others.length === 0 || short.length > 0} onPress={deal} />
        </Card>
      ) : (
        <Muted style={{ textAlign: 'center' }}>{owner ? `${owner.name} will deal the boards once everyone has ${game.needed} lines.` : ''}</Muted>
      )}
    </>
  );
}

function Count({ have, need }: { have: number; need: number }) {
  const done = have >= need;
  return (
    <View style={[styles.count, done && { backgroundColor: colors.green }]}>
      <Text style={[styles.countText, done && { color: '#fff' }]}>{done ? '✓' : `${have}/${need}`}</Text>
    </View>
  );
}

// ---------- playing ----------

function Playing({ game }: { game: GameView }) {
  const me = game.players.find((p) => p.isMe)!;
  const boards = game.players.filter((p) => !p.isMe && p.hasBoard);
  const predictable = game.players.filter((p) => p.progress?.bingoAt).sort((a, b) => a.progress!.bingoAt! - b.progress!.bingoAt!);
  const scores = [...game.scores].sort((a, b) => b.spotted + b.written - (a.spotted + a.written));

  return (
    <>
      {me.progress ? (
        <>
          <ProgressCard progress={me.progress} size={game.size} />
          {me.progress.blackoutAt ? <Button title="See your board" onPress={() => router.push(`/game/${game.id}/mine`)} /> : null}
        </>
      ) : (
        <Card><Muted>You joined after the boards were dealt, so there’s no board about you this round. You can still cross off everyone else’s.</Muted></Card>
      )}

      <Heading>Listen for…</Heading>
      {boards.map((p) => <BoardRow key={p.id} game={game} player={p} />)}

      <Heading>Scoreboard</Heading>
      <Card>
        {predictable.length ? (
          <Text style={styles.crown}>👑 Most predictable: {predictable[0].isMe ? 'you' : predictable[0].name}</Text>
        ) : <Muted>Nobody’s been BINGO’d yet.</Muted>}
        {scores.map((s) => (
          <View key={s.id} style={styles.scoreRow}>
            <Text style={styles.scoreName}>{s.id === game.me ? 'You' : s.name}</Text>
            <Text style={styles.scoreStat}>👂 {s.spotted}</Text>
            <Text style={styles.scoreStat}>✍︎ {s.written}</Text>
          </View>
        ))}
        <Muted style={{ fontSize: 13 }}>👂 squares you spotted · ✍︎ your lines that came true</Muted>
      </Card>
    </>
  );
}

function BoardRow({ game, player }: { game: GameView; player: Player }) {
  const p = player.progress!;
  const tag = p.blackoutAt ? 'BLACKOUT' : p.bingoAt ? 'BINGO' : p.best === game.size - 1 ? '1 AWAY' : null;
  return (
    <Pressable onPress={() => router.push(`/game/${game.id}/board/${player.id}`)}>
      <Card style={styles.row}>
        <View style={{ flex: 1, gap: 6 }}>
          <Text style={styles.name}>{player.name}</Text>
          <View style={styles.bar}><View style={[styles.fill, { width: `${(p.marked / p.total) * 100}%` }]} /></View>
          <Muted>{p.marked}/{p.total} crossed off</Muted>
        </View>
        {tag ? <Text style={[styles.tag, tag === '1 AWAY' && { backgroundColor: colors.gold }]}>{tag}</Text> : <Text style={styles.chev}>›</Text>}
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  link: { fontSize: 17, fontWeight: '700', color: colors.accent },
  code: { fontSize: 34, fontWeight: '900', letterSpacing: 6, color: colors.ink, textAlign: 'center', paddingVertical: 4 },
  label: { fontSize: 12, fontWeight: '800', letterSpacing: 1, color: colors.muted },
  big: { fontSize: 20, fontWeight: '800', color: colors.ink },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  name: { fontSize: 18, fontWeight: '800', color: colors.ink },
  count: { minWidth: 56, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, backgroundColor: colors.accentSoft, alignItems: 'center' },
  countText: { fontWeight: '800', color: colors.accent },
  bar: { height: 8, borderRadius: 4, backgroundColor: colors.accentSoft, overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: colors.accent },
  tag: { fontSize: 11, fontWeight: '900', letterSpacing: 1, color: colors.accentInk, backgroundColor: colors.accent, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, overflow: 'hidden' },
  chev: { fontSize: 28, color: colors.muted },
  crown: { fontSize: 17, fontWeight: '800', color: colors.ink, marginBottom: 4 },
  scoreRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4 },
  scoreName: { flex: 1, fontSize: 16, fontWeight: '600', color: colors.ink },
  scoreStat: { width: 56, textAlign: 'right', fontSize: 16, color: colors.ink },
});
