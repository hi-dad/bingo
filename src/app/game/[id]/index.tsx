import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, Share, Text, View } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { inviteLink } from '@/config';
import { useGame } from '@/useGame';
import type { GameView, Player, Progress } from '@shared/types';
import type { Size } from '@shared/logic';
import { MiniBoard } from '@/components/MiniBoard';
import { Avatar } from '@/components/Avatar';
import { Icon } from '@/components/Icon';
import { DealAnimation } from '@/components/DealAnimation';
import { TabBar } from '@/components/TabBar';
import { Button, Card, ErrorText, Heading, Label, Muted, useUi } from '@/components/ui';
import { makeStyles, radius, shadow, useTheme } from '@/theme';
import { playerIndex } from '@/players';

type Tab = 'play' | 'scores';

export default function GameHub() {
  const ui = useUi();
  const s = useStyles();
  const { t } = useTheme();
  const { id, dealt } = useLocalSearchParams<{ id: string; dealt?: string }>();
  const { game, error, refreshing, refresh } = useGame(id);
  const [tab, setTab] = useState<Tab>('play');
  const [showDeal, setShowDeal] = useState(dealt === '1');
  const previousStatus = useRef(game?.status);

  useEffect(() => {
    if (!game) return;
    if (previousStatus.current === 'writing' && game.status === 'playing') setShowDeal(true);
    previousStatus.current = game.status;
  }, [game?.status]);

  if (!game) {
    return (
      <View style={[ui.screen, ui.content]}>
        {error ? <ErrorText>{error}</ErrorText> : <ActivityIndicator color={t.strong} />}
      </View>
    );
  }

  const invite = () => Alert.alert('Invite friends', `Game code: ${game.code}`, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Share code', onPress: () => { Share.share({ message: `Join “${game.name}” on Bingo with code ${game.code}.` }); } },
    { text: 'Share link', onPress: () => { Share.share({ message: `Join “${game.name}” on Bingo.\n${inviteLink(game.code)}` }); } },
  ]);
  const linesWanted = game.players.some((p) => !p.isMe && writable(game, p) && p.poolCount < game.needed);

  return (
    <View style={ui.screen}>
      <Stack.Screen options={{
        title: game.name,
        headerRight: () => <Pressable onPress={invite} hitSlop={10} accessibilityLabel="Invite friends"><Icon name="invite" size={23} color={t.strong} /></Pressable>,
      }} />
      <ScrollView contentContainerStyle={ui.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}>
        <ErrorText>{error}</ErrorText>
        {tab === 'play' ? <PlayTab game={game} invite={invite} /> : <ScoresTab game={game} />}
      </ScrollView>
      <TabBar<Tab>
        value={tab}
        onChange={setTab}
        tabs={[
          { key: 'play', label: 'Play', badge: linesWanted },
          { key: 'scores', label: 'Scores' },
        ]}
      />
      <DealAnimation visible={showDeal} onDone={() => setShowDeal(false)} />
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
function PlayTab({ game, invite }: { game: GameView; invite: () => void }) {
  const s = useStyles();
  const others = game.players.filter((p) => !p.isMe);
  const writing = game.players.filter((p) => writable(game, p));
  const playing = game.players
    .filter((p) => p.progress)
    .sort((a, b) => b.progress!.marked - a.progress!.marked || a.name.localeCompare(b.name));
  return (
    <>
      {game.status === 'writing' ? <FirstGameGuide /> : null}
      {others.length === 0 ? <InviteCard invite={invite} /> : null}
      {game.status === 'writing' && others.length ? <WaitingForPeople game={game} /> : null}
      {writing.length && others.length ? (
        <>
          <Label>NEW BOARDS</Label>
          {writing.map((p) => <NewBoardRow key={p.id} game={game} player={p} />)}
        </>
      ) : null}
      {playing.length ? (
        <>
          <CheatSheet game={game} />
          <Label>BOARDS</Label>
          {playing.map((p) => <BoardRow key={p.id} game={game} player={p} />)}
        </>
      ) : null}
    </>
  );
}

const GUIDE_KEY = 'first-game-guide-seen';

function FirstGameGuide() {
  const s = useStyles();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    SecureStore.getItemAsync(GUIDE_KEY).then((seen) => setVisible(!seen)).catch(() => setVisible(true));
  }, []);

  if (!visible) return null;
  const dismiss = () => {
    setVisible(false);
    SecureStore.setItemAsync(GUIDE_KEY, '1').catch(() => {});
  };
  return (
    <Card>
      <Heading>How Quote Bingo works</Heading>
      <View style={s.guideStep}><Text style={s.guideNumber}>1</Text><Text style={s.guideText}>Add the things your friends always say or do.</Text></View>
      <View style={s.guideStep}><Text style={s.guideNumber}>2</Text><Text style={s.guideText}>Boards deal automatically when everyone has 25 lines.</Text></View>
      <View style={s.guideStep}><Text style={s.guideNumber}>3</Text><Text style={s.guideText}>Get bingo first, then keep listening until blackout.</Text></View>
      <Button kind="secondary" title="Got it" onPress={dismiss} />
    </Card>
  );
}

function CheatSheet({ game }: { game: GameView }) {
  const s = useStyles();
  const [start, setStart] = useState(0);
  const people = game.players.filter((p) => !p.isMe && game.boards[p.id] && !p.progress?.blackoutAt);
  const reminders = Array.from({ length: game.size * game.size }, (_, pos) => people.flatMap((p) => {
    const square = game.boards[p.id]?.squares.find((sq) => sq.pos === pos && !sq.markedAt && !!sq.text);
    return square?.text ? [{ id: p.id, name: p.name, text: square.text }] : [];
  })).flat();

  useEffect(() => {
    setStart(0);
    if (reminders.length <= 3) return;
    const timer = setInterval(() => setStart((i) => (i + 3) % reminders.length), 10_000);
    return () => clearInterval(timer);
  }, [reminders.length]);

  if (!reminders.length) return null;
  const shown = Array.from({ length: Math.min(3, reminders.length) }, (_, offset) => reminders[(start + offset) % reminders.length]);
  const colors = playerIndex(game);
  return (
    <>
      <Label>QUICK GLANCE</Label>
      <View accessible style={s.cheat} accessibilityLiveRegion="polite" accessibilityLabel={`Quick glance. ${shown.map((r) => `${r.name}: ${r.text}`).join('. ')}`}>
        {shown.map((reminder, index) => (
          <View key={`${reminder.id}-${reminder.text}`} style={[s.cheatRow, index === shown.length - 1 && s.cheatLastRow]}>
            <Avatar name={reminder.name} index={colors[reminder.id]} size={34} />
            <Text style={s.cheatName} numberOfLines={1}>{reminder.name}</Text>
            <Text style={s.cheatText} numberOfLines={2}>{reminder.text}</Text>
          </View>
        ))}
      </View>
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
        <Text style={[s.sub, p.round > 0 && { color: t.strong }]}>Board {p.round + 1}</Text>
      </View>
      <View style={s.right}>
        {p.isMe ? null : <Text style={[s.action, { color: have >= game.needed ? t.muted : t.strong }]}>{have >= game.needed ? 'Complete' : 'Add'}</Text>}
        <Text style={s.sub}>{have}/{game.needed}</Text>
      </View>
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
        <Text style={[s.sub, p.round > 1 && { color: t.strong }]}>Board {p.round}</Text>
      </View>
      <View style={s.right}>
        {tag ? <Text style={[s.tag, tagStyle]}>{tag}</Text> : <Text style={s.count}>{pr.marked}/{pr.total}</Text>}
        {p.isMe && pr.blackoutAt ? <Text style={s.reveal}>See what people wrote</Text> : null}
      </View>
    </Pressable>
  );
}

function boardTag(p: Progress, size: Size) {
  if (p.blackoutAt) return 'BLACKOUT';
  if (p.bingoAt) return 'BINGO';
  if (p.best === size - 1) return '1 AWAY';
  return null;
}

function WaitingForPeople({ game }: { game: GameView }) {
  const short = game.players.filter((p) => p.poolCount < game.needed);
  return <Muted style={{ textAlign: 'center' }}>Waiting on {short.length} {short.length === 1 ? 'person' : 'people'} before the game starts.</Muted>;
}

function InviteCard({ invite }: { invite: () => void }) {
  return (
    <Card>
      <Heading>Invite your friends</Heading>
      <Muted>Invite them with a link or game code. Everyone writes lines about everyone else.</Muted>
      <Button title="Invite" onPress={invite} />
    </Card>
  );
}

// ---------- Scores ----------

// Ranked by bingos, then blackouts, then spots (lines they noticed first).
function ScoresTab({ game }: { game: GameView }) {
  const s = useStyles();
  const { t } = useTheme();
  const scores = [...game.scores].sort((a, b) => b.bingos - a.bingos || b.blackouts - a.blackouts || b.spotted - a.spotted || a.name.localeCompare(b.name));
  return (
    <>
      <Card>
        <View style={s.scoreRow}>
          <Text style={s.rank}> </Text>
          <Text style={[s.scoreName, s.scoreHead]}> </Text>
          <Text style={[s.scoreStat, s.scoreHead]}>BINGOS</Text>
          <Text style={[s.scoreStat, s.scoreHead]}>BLACKOUTS</Text>
          <Text style={[s.scoreStat, s.scoreHead]}>SPOTS</Text>
        </View>
        {scores.map((sc, i) => (
          <View key={sc.id} style={s.scoreRow}>
            <Text style={[s.rank, { backgroundColor: i === 0 ? t.accent : t.soft, color: i === 0 ? t.accentInk : t.ink }]}>{i + 1}</Text>
            <Text style={s.scoreName} numberOfLines={1}>{sc.id === game.me ? 'You' : sc.name}</Text>
            <View style={[s.scorePill, { backgroundColor: sc.bingos ? t.win : t.soft }]}><Text style={[s.scoreValue, { color: sc.bingos ? '#FFFFFF' : t.muted }]}>{sc.bingos}</Text></View>
            <View style={[s.scorePill, { backgroundColor: sc.blackouts ? t.ink : t.soft }]}><Text style={[s.scoreValue, { color: sc.blackouts ? t.bg : t.muted }]}>{sc.blackouts}</Text></View>
            <View style={[s.scorePill, { backgroundColor: sc.spotted ? t.accent : t.soft }]}><Text style={[s.scoreValue, { color: sc.spotted ? t.accentInk : t.muted }]}>{sc.spotted}</Text></View>
          </View>
        ))}
      </Card>
      {game.finishedBoards.length ? (
        <>
          <Label>FINISHED BOARDS</Label>
          {game.finishedBoards.map((board) => (
            <Pressable key={board.id} onPress={() => router.push(`/game/${game.id}/history/${board.id}`)} style={s.finished}>
              <View style={{ flex: 1 }}>
                <Text style={s.finishedName}>{board.mine ? 'You' : board.name}</Text>
                <Text style={s.sub}>Board {board.round}</Text>
              </View>
              <Text style={s.finishedAction}>View</Text>
            </Pressable>
          ))}
        </>
      ) : null}
      <Button kind="secondary" title="People in this game" onPress={() => router.push(`/game/${game.id}/players`)} />
    </>
  );
}

const useStyles = makeStyles((t) => ({
  name: { fontSize: 17, fontWeight: '800', color: t.ink },
  tag: { fontSize: 11, fontWeight: '900', letterSpacing: 1, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, overflow: 'hidden' },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14, borderRadius: radius.lg },
  card: { backgroundColor: t.card, ...shadow(t) },
  dashed: { borderWidth: 1.5, borderStyle: 'dashed', borderColor: t.line },
  sub: { fontSize: 14, color: t.muted, fontWeight: '600' },
  count: { fontSize: 16, color: t.ink, fontWeight: '800' },
  action: { fontSize: 15, fontWeight: '800' },
  right: { alignItems: 'flex-end', gap: 4, maxWidth: 130 },
  reveal: { fontSize: 12, lineHeight: 15, color: t.strong, fontWeight: '800', textAlign: 'right' },
  cheat: { paddingHorizontal: 14, paddingVertical: 10, gap: 2, borderRadius: radius.md, backgroundColor: t.card, ...shadow(t) },
  cheatRow: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 9, borderBottomWidth: 1, borderBottomColor: t.line },
  cheatLastRow: { borderBottomWidth: 0 },
  cheatName: { width: 58, fontSize: 13, fontWeight: '900', color: t.strong },
  cheatText: { flex: 1, fontSize: 14, lineHeight: 18, fontWeight: '600', color: t.ink },
  scoreRow: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingVertical: 5 },
  scoreHead: { fontSize: 9, fontWeight: '800', letterSpacing: 0.5, color: t.muted },
  rank: { width: 24, height: 24, borderRadius: 12, overflow: 'hidden', textAlign: 'center', lineHeight: 24, fontSize: 13, fontWeight: '900' },
  scoreName: { flex: 1, minWidth: 52, fontSize: 15, fontWeight: '600', color: t.ink },
  scoreStat: { width: 58, textAlign: 'center', fontSize: 14, color: t.ink },
  scorePill: { width: 58, minHeight: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  scoreValue: { fontSize: 17, fontWeight: '900' },
  finished: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: radius.md, backgroundColor: t.card, ...shadow(t) },
  finishedName: { fontSize: 16, fontWeight: '800', color: t.ink },
  finishedAction: { fontSize: 15, fontWeight: '800', color: t.strong },
  guideStep: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  guideNumber: { width: 26, height: 26, lineHeight: 26, borderRadius: 13, overflow: 'hidden', textAlign: 'center', backgroundColor: t.strong, color: t.strongInk, fontWeight: '900' },
  guideText: { flex: 1, fontSize: 15, lineHeight: 20, color: t.ink, fontWeight: '600' },
}));
