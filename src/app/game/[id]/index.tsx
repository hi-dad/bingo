import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, Share, Text, View } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { api } from '@/api';
import { inviteLink } from '@/config';
import { useGame } from '@/useGame';
import { playerIndex } from '@/players';
import type { GameView, Player } from '@shared/types';
import { phrasesNeeded, type Size } from '@shared/logic';
import { Avatar } from '@/components/Avatar';
import { ProgressCard, progressLine } from '@/components/ProgressCard';
import { ProgressBar } from '@/components/ProgressRing';
import { SizePicker } from '@/components/SizePicker';
import { TabBar } from '@/components/TabBar';
import { Button, Card, ErrorText, Heading, Label, Muted, useUi } from '@/components/ui';
import { makeStyles, useTheme } from '@/theme';

type Tab = 'boards' | 'write' | 'scores';

export default function GameHub() {
  const ui = useUi();
  const s = useStyles();
  const { t } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { game, error, refreshing, refresh, act } = useGame(id);
  const [tab, setTab] = useState<Tab | null>(null);

  if (!game) {
    return (
      <View style={[ui.screen, ui.content]}>
        {error ? <ErrorText>{error}</ErrorText> : <ActivityIndicator color={t.strong} />}
      </View>
    );
  }

  // Start on Write while lines are being written, on Boards once they're dealt.
  const active: Tab = tab ?? (game.status === 'writing' ? 'write' : 'boards');
  const invite = () => Share.share({
    message: `Join “${game.name}” on Bingo. We’re making bingo boards of the stuff we always say 😂\n${inviteLink(game.code)}\n(code ${game.code})`,
  });
  const index = playerIndex(game);
  const myLinesShort = game.status === 'writing' && game.players.some((p) => !p.isMe && p.poolCount < game.needed);

  return (
    <View style={ui.screen}>
      <Stack.Screen options={{
        title: game.name,
        headerRight: () => <Pressable onPress={invite} hitSlop={12}><Text style={s.link}>Invite</Text></Pressable>,
      }} />
      <ScrollView contentContainerStyle={ui.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}>
        <ErrorText>{error}</ErrorText>
        {active === 'boards' ? <BoardsTab game={game} index={index} invite={invite} act={act} /> : null}
        {active === 'write' ? <WriteTab game={game} index={index} invite={invite} /> : null}
        {active === 'scores' ? <ScoresTab game={game} index={index} /> : null}
      </ScrollView>
      <TabBar<Tab>
        value={active}
        onChange={setTab}
        tabs={[
          { key: 'boards', label: 'Boards' },
          { key: 'write', label: 'Write', badge: myLinesShort },
          { key: 'scores', label: 'Scores' },
        ]}
      />
    </View>
  );
}

// ---------- Boards ----------

function BoardsTab({ game, index, invite, act }: { game: GameView; index: Record<string, number>; invite: () => void; act: ReturnType<typeof useGame>['act'] }) {
  const me = game.players.find((p) => p.isMe)!;
  if (game.status === 'writing') return <Dealing game={game} index={index} invite={invite} act={act} />;
  const boards = game.players.filter((p) => !p.isMe && p.hasBoard);
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
      <Label>LISTEN FOR…</Label>
      {boards.map((p) => <BoardRow key={p.id} game={game} player={p} index={index[p.id]} />)}
    </>
  );
}

function BoardRow({ game, player, index }: { game: GameView; player: Player; index: number }) {
  const s = useStyles();
  const { t } = useTheme();
  const p = player.progress!;
  const tag = p.blackoutAt ? 'BLACKOUT' : p.bingoAt ? 'BINGO' : p.best === game.size - 1 ? '1 AWAY' : null;
  return (
    <Pressable onPress={() => router.push(`/game/${game.id}/board/${player.id}`)}>
      <Card style={s.row}>
        <Avatar name={player.name} index={index} size={40} />
        <View style={{ flex: 1, gap: 6 }}>
          <View style={s.rowTop}>
            <Text style={s.name}>{player.name}</Text>
            {tag ? <Text style={[s.tag, tag === '1 AWAY' && { backgroundColor: t.free, color: t.freeInk }]}>{tag}</Text> : null}
          </View>
          <ProgressBar value={p.total ? p.marked / p.total : 0} />
          <Muted style={{ fontSize: 13 }}>{p.marked}/{p.total} · {progressLine(p, game.size)}</Muted>
        </View>
      </Card>
    </Pressable>
  );
}

function Dealing({ game, index, invite, act }: { game: GameView; index: Record<string, number>; invite: () => void; act: ReturnType<typeof useGame>['act'] }) {
  const s = useStyles();
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
      {others.length === 0 ? <InviteCard code={game.code} invite={invite} /> : null}
      <Card>
        <Heading>Boards get dealt when everyone has {need} lines</Heading>
        {game.players.map((p) => (
          <View key={p.id} style={s.readyRow}>
            <Avatar name={p.name} index={index[p.id]} size={26} />
            <Text style={s.readyName}>{p.isMe ? 'You' : p.name}</Text>
            <Text style={[s.readyCount, p.poolCount >= need && s.readyDone]}>{p.poolCount >= need ? 'ready ✓' : `${p.poolCount}/${need}`}</Text>
          </View>
        ))}
      </Card>
      {game.isOwner ? (
        <Card>
          <Heading>Deal the boards</Heading>
          <SizePicker value={size} onChange={setSize} />
          {others.length === 0 ? <Muted>Invite at least one friend first.</Muted> : null}
          <Button title="Deal the boards 🎲" busy={busy} disabled={others.length === 0 || short.length > 0} onPress={deal} />
        </Card>
      ) : (
        <Muted style={{ textAlign: 'center' }}>{owner ? `${owner.name} deals the boards once everyone’s ready.` : ''}</Muted>
      )}
    </>
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

// ---------- Write ----------

function WriteTab({ game, index, invite }: { game: GameView; index: Record<string, number>; invite: () => void }) {
  const s = useStyles();
  const me = game.players.find((p) => p.isMe)!;
  const others = game.players.filter((p) => !p.isMe);
  if (game.status === 'playing') {
    return <Card><Heading>Writing’s closed</Heading><Muted>The boards are dealt. Go listen for them on the Boards tab.</Muted></Card>;
  }
  return (
    <>
      <Card>
        <Label>ABOUT YOU · SECRET</Label>
        <Text style={s.big}>{me.poolCount === 0 ? 'Nobody’s written about you yet 😇' : `${me.poolCount} ${me.poolCount === 1 ? 'line' : 'lines'} written about you 👀`}</Text>
        <Muted>You’ll never see them. That’s the point.</Muted>
      </Card>
      {others.length === 0 ? <InviteCard code={game.code} invite={invite} /> : <Label>WRITE ABOUT YOUR FRIENDS</Label>}
      {others.map((p) => (
        <Pressable key={p.id} onPress={() => router.push(`/game/${game.id}/write/${p.id}`)}>
          <Card style={s.row}>
            <Avatar name={p.name} index={index[p.id]} size={40} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={s.name}>{p.name}</Text>
              <Muted style={{ fontSize: 13 }}>{(game.pools[p.id] ?? []).filter((x) => x.mine).length} by you · {p.poolCount} total</Muted>
            </View>
            <Count have={p.poolCount} need={game.needed} />
          </Card>
        </Pressable>
      ))}
    </>
  );
}

function Count({ have, need }: { have: number; need: number }) {
  const s = useStyles();
  const done = have >= need;
  return (
    <View style={[s.count, done && s.countDone]}>
      <Text style={[s.countText, done && s.countDoneText]}>{done ? '✓' : `${have}/${need}`}</Text>
    </View>
  );
}

// ---------- Scores ----------

function ScoresTab({ game, index }: { game: GameView; index: Record<string, number> }) {
  const s = useStyles();
  const predictable = game.players.filter((p) => p.progress?.bingoAt).sort((a, b) => a.progress!.bingoAt! - b.progress!.bingoAt!);
  const scores = [...game.scores].sort((a, b) => b.spotted + b.written - (a.spotted + a.written));
  return (
    <>
      <Card style={s.row}>
        <Text style={{ fontSize: 30 }}>👑</Text>
        <View style={{ flex: 1 }}>
          <Label>MOST PREDICTABLE</Label>
          <Text style={s.big}>{predictable.length ? (predictable[0].isMe ? 'You 😳' : predictable[0].name) : 'Nobody yet'}</Text>
        </View>
      </Card>
      <Card>
        {scores.map((sc) => (
          <View key={sc.id} style={s.scoreRow}>
            <Avatar name={sc.name} index={index[sc.id] ?? 0} size={30} />
            <Text style={s.scoreName}>{sc.id === game.me ? 'You' : sc.name}</Text>
            <Text style={s.scoreStat}>👂 {sc.spotted}</Text>
            <Text style={s.scoreStat}>✍︎ {sc.written}</Text>
          </View>
        ))}
        <Muted style={{ fontSize: 13 }}>👂 squares you heard first · ✍︎ your lines that came true</Muted>
      </Card>
    </>
  );
}

const useStyles = makeStyles((t) => ({
  link: { fontSize: 17, fontWeight: '700', color: t.strong },
  code: { fontSize: 34, fontWeight: '900', letterSpacing: 6, color: t.ink, textAlign: 'center', paddingVertical: 4 },
  big: { fontSize: 20, fontWeight: '800', color: t.ink },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  rowTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  name: { fontSize: 17, fontWeight: '800', color: t.ink },
  tag: { fontSize: 11, fontWeight: '900', letterSpacing: 1, color: t.strongInk, backgroundColor: t.strong, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, overflow: 'hidden' },
  readyRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 2 },
  readyName: { flex: 1, fontSize: 16, fontWeight: '600', color: t.ink },
  readyCount: { fontSize: 15, fontWeight: '700', color: t.muted },
  readyDone: { color: t.strong },
  count: { minWidth: 56, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, backgroundColor: t.soft, alignItems: 'center' },
  countDone: { backgroundColor: t.strong },
  countText: { fontWeight: '800', color: t.ink },
  countDoneText: { color: t.strongInk },
  scoreRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 },
  scoreName: { flex: 1, fontSize: 16, fontWeight: '600', color: t.ink },
  scoreStat: { width: 52, textAlign: 'right', fontSize: 16, color: t.ink },
}));
