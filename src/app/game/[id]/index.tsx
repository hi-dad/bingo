import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, Share, Text, View } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { api } from '@/api';
import { inviteLink } from '@/config';
import { useGame } from '@/useGame';
import type { GameView, Player, Progress } from '@shared/types';
import type { Size } from '@shared/logic';
import { MiniBoard } from '@/components/MiniBoard';
import { TabBar } from '@/components/TabBar';
import { Button, Card, ErrorText, Heading, Label, Muted, useUi } from '@/components/ui';
import { makeStyles, radius, shadow, useTheme } from '@/theme';

type Tab = 'play' | 'scores';

export default function GameHub() {
  const ui = useUi();
  const s = useStyles();
  const { t } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { game, error, refreshing, refresh, act } = useGame(id);
  const [tab, setTab] = useState<Tab>('play');

  if (!game) {
    return (
      <View style={[ui.screen, ui.content]}>
        {error ? <ErrorText>{error}</ErrorText> : <ActivityIndicator color={t.strong} />}
      </View>
    );
  }

  const invite = () => Share.share({
    message: `Join “${game.name}” on Bingo. We’re making bingo boards of the stuff we always say.\n${inviteLink(game.code)}\n(code ${game.code})`,
  });
  const linesWanted = game.players.some((p) => !p.isMe && writable(game, p) && p.poolCount < game.needed);

  return (
    <View style={ui.screen}>
      <Stack.Screen options={{
        title: game.name,
        headerRight: () => <Pressable onPress={invite} hitSlop={10}><Text style={s.link}>Invite</Text></Pressable>,
      }} />
      <ScrollView contentContainerStyle={ui.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}>
        <ErrorText>{error}</ErrorText>
        {tab === 'play' ? <PlayTab game={game} invite={invite} act={act} /> : <ScoresTab game={game} />}
      </ScrollView>
      <TabBar<Tab>
        value={tab}
        onChange={setTab}
        tabs={[
          { key: 'play', label: 'Play', badge: linesWanted },
          { key: 'scores', label: 'Scores' },
        ]}
      />
    </View>
  );
}

// Lines can be written about someone before the first deal, and later whenever they're
// waiting on their next board (joined late, or their last one blacked out).
function writable(game: GameView, p: Player) {
  return game.status === 'writing' || p.needsLines;
}

// ---------- Play ----------

// The same screen through the whole game, in two parts. On top, boards still being written:
// everyone before the deal, and later anyone who joined late or blacked out. Below, the
// boards in play, most crossed off first. A blacked-out board stays in the list until the
// next one about that person is dealt and takes its place.
function PlayTab({ game, invite, act }: { game: GameView; invite: () => void; act: ReturnType<typeof useGame>['act'] }) {
  const others = game.players.filter((p) => !p.isMe);
  const writing = game.players.filter((p) => writable(game, p));
  const playing = game.players
    .filter((p) => p.progress)
    .sort((a, b) => b.progress!.marked - a.progress!.marked || a.name.localeCompare(b.name));
  return (
    <>
      {others.length === 0 ? <InviteCard code={game.code} invite={invite} /> : null}
      {game.status === 'writing' && others.length ? <Dealing game={game} act={act} /> : null}
      {writing.length && others.length ? (
        <>
          <Label>NEW BOARDS</Label>
          {writing.map((p) => <NewBoardRow key={p.id} game={game} player={p} />)}
        </>
      ) : null}
      {playing.length ? (
        <>
          <Label>LISTEN FOR</Label>
          {playing.map((p) => <BoardRow key={p.id} game={game} player={p} />)}
        </>
      ) : null}
    </>
  );
}

// A board still being written. The mini board fills in as lines come in. You can't write
// about yourself, so your own row only shows the count.
function NewBoardRow({ game, player: p }: { game: GameView; player: Player }) {
  const s = useStyles();
  const { t } = useTheme();
  const have = Math.min(p.poolCount, game.needed);
  return (
    <Pressable disabled={p.isMe} onPress={() => router.push(`/game/${game.id}/write/${p.id}`)}
      accessibilityLabel={`${p.isMe ? 'Your next board' : p.name}, ${have} of ${game.needed} lines`}
      style={[s.listRow, s.dashed]}>
      <MiniBoard size={game.size} marks={null} filled={Math.round((have / game.needed) * game.size * game.size)} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={s.name} numberOfLines={1}>{p.isMe ? 'You' : p.name}</Text>
        <Text style={s.sub}>{have}/{game.needed}</Text>
      </View>
      {p.isMe ? null : <Text style={[s.action, { color: t.strong }]}>Write</Text>}
    </Pressable>
  );
}

const AMBER = { bg: '#FFE6B8', ink: '#6B4405' };

// A board in play: the grid, the name, how much is crossed off, and a tag when it matters.
// Your own shows only which spots are crossed off; it opens once it's blacked out.
function BoardRow({ game, player: p }: { game: GameView; player: Player }) {
  const s = useStyles();
  const { t } = useTheme();
  const pr = p.progress!;
  let marks = game.myMarks;
  if (!p.isMe) {
    marks = Array<boolean>(game.size * game.size).fill(false);
    for (const sq of game.boards[p.id]?.squares ?? []) marks[sq.pos] = !!sq.markedAt;
  }
  const tag = boardTag(pr, game.size);
  const tagStyle = tag === 'BLACKOUT' ? { backgroundColor: t.ink, color: t.bg }
    : tag === 'BINGO' ? { backgroundColor: t.win, color: '#FFFFFF' }
      : { backgroundColor: AMBER.bg, color: AMBER.ink };
  const locked = p.isMe && !pr.blackoutAt;
  return (
    <Pressable disabled={locked}
      onPress={() => router.push(p.isMe ? `/game/${game.id}/mine` : `/game/${game.id}/board/${p.id}`)}
      accessibilityLabel={`${p.isMe ? 'Your board' : p.name}, ${pr.marked} of ${pr.total}${tag ? `, ${tag}` : ''}`}
      style={[s.listRow, locked ? s.dashed : s.card]}>
      <MiniBoard size={game.size} marks={marks} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={s.name} numberOfLines={1}>{p.isMe ? 'You' : p.name}</Text>
        <Text style={s.sub}>{pr.marked}/{pr.total}</Text>
      </View>
      {tag ? <Text style={[s.tag, tagStyle]}>{tag}</Text> : null}
    </Pressable>
  );
}

function boardTag(p: Progress, size: Size) {
  if (p.blackoutAt) return 'BLACKOUT';
  if (p.bingoAt) return 'BINGO';
  if (p.best === size - 1) return '1 AWAY';
  return null;
}

function Dealing({ game, act }: { game: GameView; act: ReturnType<typeof useGame>['act'] }) {
  const owner = game.players.find((p) => p.isOwner);
  const [busy, setBusy] = useState(false);
  const short = game.players.filter((p) => p.poolCount < game.needed);

  async function deal() {
    setBusy(true);
    try {
      await act(() => api.start(game.id));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err) {
      Alert.alert('Not yet', (err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!game.isOwner) {
    return <Muted style={{ textAlign: 'center' }}>{owner ? `${owner.name} deals the boards once everyone has ${game.needed} lines.` : ''}</Muted>;
  }
  return (
    <Card>
      <Heading>{short.length ? 'Deal the boards' : 'Everyone’s ready'}</Heading>
      {short.length ? <Muted>Everyone needs {game.needed} lines first. {short.length === 1 ? '1 person is' : `${short.length} people are`} still short.</Muted> : null}
      <Button title="Deal the boards" busy={busy} disabled={short.length > 0} onPress={deal} />
    </Card>
  );
}

function InviteCard({ code, invite }: { code: string; invite: () => void }) {
  const s = useStyles();
  return (
    <Card>
      <Heading>Invite your friends</Heading>
      <Muted>Send the link to your group chat. Everyone writes lines about everyone else.</Muted>
      <Text style={s.code}>{code}</Text>
      <Button title="Share invite" onPress={invite} />
    </Card>
  );
}

// ---------- Scores ----------

// Ranked by blackouts (boards about them that got fully crossed off), then by squares heard.
function ScoresTab({ game }: { game: GameView }) {
  const s = useStyles();
  const scores = [...game.scores].sort((a, b) => b.boards - a.boards || b.spotted - a.spotted || a.name.localeCompare(b.name));
  return (
    <>
      <Card>
        <View style={s.scoreRow}>
          <Text style={s.rank}> </Text>
          <Text style={[s.scoreName, s.scoreHead]}> </Text>
          <Text style={[s.scoreStat, s.scoreHead]}>BLACKOUTS</Text>
          <Text style={[s.scoreStat, s.scoreHead]}>SQUARES</Text>
        </View>
        {scores.map((sc, i) => (
          <View key={sc.id} style={s.scoreRow}>
            <Text style={s.rank}>{i + 1}</Text>
            <Text style={s.scoreName} numberOfLines={1}>{sc.id === game.me ? 'You' : sc.name}</Text>
            <Text style={[s.scoreStat, s.scoreMain]}>{sc.boards}</Text>
            <Text style={s.scoreStat}>{sc.spotted}</Text>
          </View>
        ))}
        <Muted style={{ fontSize: 13 }}>Blackouts: boards about them that got fully crossed off. Squares: lines they heard first.</Muted>
      </Card>
      <Button kind="secondary" title="People in this game" onPress={() => router.push(`/game/${game.id}/players`)} />
    </>
  );
}

const useStyles = makeStyles((t) => ({
  link: { fontSize: 17, fontWeight: '700', color: t.strong },
  code: { fontSize: 34, fontWeight: '900', letterSpacing: 6, color: t.ink, textAlign: 'center', paddingVertical: 4 },
  name: { fontSize: 17, fontWeight: '800', color: t.ink },
  tag: { fontSize: 11, fontWeight: '900', letterSpacing: 1, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, overflow: 'hidden' },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14, borderRadius: radius.lg },
  card: { backgroundColor: t.card, ...shadow(t) },
  dashed: { borderWidth: 1.5, borderStyle: 'dashed', borderColor: t.line },
  sub: { fontSize: 14, color: t.muted, fontWeight: '600' },
  action: { fontSize: 15, fontWeight: '800' },
  scoreRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 5 },
  scoreHead: { fontSize: 11, fontWeight: '800', letterSpacing: 1, color: t.muted },
  rank: { width: 20, fontSize: 15, fontWeight: '700', color: t.muted },
  scoreName: { flex: 1, fontSize: 16, fontWeight: '600', color: t.ink },
  scoreStat: { width: 84, textAlign: 'right', fontSize: 16, color: t.ink },
  scoreMain: { fontWeight: '900' },
}));
