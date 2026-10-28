import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { api } from '@/api';
import { useGame } from '@/useGame';
import { playerIndex } from '@/players';
import type { Square } from '@shared/types';
import { Avatar } from '@/components/Avatar';
import { BingoGrid } from '@/components/BingoGrid';
import { Confetti } from '@/components/Confetti';
import { progressLine } from '@/components/ProgressCard';
import { ProgressBar, ProgressRing } from '@/components/ProgressRing';
import { ErrorText, Label, Muted, useUi } from '@/components/ui';
import { makeStyles, radius, shadow, useTheme } from '@/theme';

export default function BoardScreen() {
  const ui = useUi();
  const s = useStyles();
  const { t } = useTheme();
  const { id, target } = useLocalSearchParams<{ id: string; target: string }>();
  const { game, error, refreshing, refresh, act } = useGame(id);
  const [pending, setPending] = useState<Record<string, boolean>>({});
  const [burst, setBurst] = useState<number | null>(null);
  const board = game?.boards[target];
  const person = game?.players.find((p) => p.id === target);

  // Celebrate when this board reaches bingo or blackout while you're looking at it
  // (whether you made the winning tap or a friend did).
  const seen = useRef<{ bingo: number | null; blackout: number | null } | null>(null);
  useEffect(() => {
    if (!board) return;
    const prev = seen.current;
    if (prev && ((board.bingoAt && !prev.bingo) || (board.blackoutAt && !prev.blackout))) {
      setBurst(Date.now());
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
    seen.current = { bingo: board.bingoAt, blackout: board.blackoutAt };
  }, [board?.bingoAt, board?.blackoutAt]);

  if (!game || !board || !person?.progress) {
    return <View style={[ui.screen, ui.content]}>{error ? <ErrorText>{error}</ErrorText> : <ActivityIndicator color={t.strong} />}</View>;
  }

  async function toggle(square: Square, on: boolean) {
    Haptics.impactAsync(on ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light);
    setPending((p) => ({ ...p, [square.id]: on }));
    try {
      await act(() => api.mark(square.id, on));
    } catch (err) {
      Alert.alert('Didn’t save', (err as Error).message);
    } finally {
      setPending(({ [square.id]: _, ...rest }) => rest);
    }
  }

  const index = playerIndex(game);
  const progress = person.progress;
  const others = game.players.filter((p) => !p.isMe && p.hasBoard && p.id !== target);

  return (
    <View style={ui.screen}>
      <Stack.Screen options={{ title: '' }} />
      <ScrollView contentContainerStyle={ui.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}>
        <View style={s.header}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={s.title}>{person.name}’s board</Text>
            <Text style={[s.status, board.bingoAt || board.blackoutAt ? { color: t.strong, fontWeight: '800' } : null]}>
              {progressLine(progress, game.size)}
            </Text>
          </View>
          <ProgressRing done={progress.marked} total={progress.total} />
        </View>
        <ErrorText>{error}</ErrorText>
        <BingoGrid size={game.size} squares={board.squares} pending={pending} onToggle={toggle} playerIndex={index} />
        <Muted style={{ textAlign: 'center', fontSize: 13 }}>
          {board.blackoutAt ? 'Writers are revealed ✍︎' : `Tap when ${person.name} says it · faces show who heard it first`}
        </Muted>
        {others.length ? (
          <View style={{ gap: 8 }}>
            <Label>OTHER BOARDS</Label>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {others.map((p) => (
                <Pressable key={p.id} onPress={() => router.replace(`/game/${game.id}/board/${p.id}`)} style={s.other}>
                  <View style={s.otherTop}>
                    <Avatar name={p.name} index={index[p.id]} size={24} />
                    <Text style={s.otherName} numberOfLines={1}>{p.name}{p.progress?.bingoAt ? ' · BINGO' : ''}</Text>
                  </View>
                  <ProgressBar value={p.progress ? p.progress.marked / p.progress.total : 0} />
                </Pressable>
              ))}
            </ScrollView>
          </View>
        ) : null}
      </ScrollView>
      <Confetti burst={burst} />
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  title: { fontSize: 26, fontWeight: '800', color: t.ink, letterSpacing: -0.5 },
  status: { fontSize: 14, color: t.muted },
  other: { width: 160, backgroundColor: t.card, borderRadius: radius.md, padding: 12, gap: 8, ...shadow(t) },
  otherTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  otherName: { flex: 1, fontSize: 15, fontWeight: '800', color: t.ink },
}));
