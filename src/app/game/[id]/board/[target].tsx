import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, RefreshControl, ScrollView, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { api } from '@/api';
import { useGame } from '@/useGame';
import { confirmReport } from '@/report';
import { playerIndex } from '@/players';
import type { Square } from '@shared/types';
import { BingoGrid } from '@/components/BingoGrid';
import { Confetti } from '@/components/Confetti';
import { progressLine } from '@/components/ProgressCard';
import { ProgressRing } from '@/components/ProgressRing';
import { ErrorText, Muted, useUi } from '@/components/ui';
import { makeStyles, useTheme } from '@/theme';

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
        <BingoGrid size={game.size} squares={board.squares} pending={pending} onToggle={board.blackoutAt ? undefined : toggle} playerIndex={index}
          onLongPress={(sq) => sq.phraseId && sq.text && confirmReport(sq.text, () => act(() => api.report(sq.phraseId!)))} />
        <Muted style={{ textAlign: 'center', fontSize: 13 }}>
          {board.blackoutAt ? 'Names on top show who wrote each line.' : `Tap when ${person.name} says it.`}
        </Muted>
      </ScrollView>
      <Confetti burst={burst} />
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  title: { fontSize: 26, fontWeight: '800', color: t.ink, letterSpacing: -0.5 },
  status: { fontSize: 14, color: t.muted },
}));
