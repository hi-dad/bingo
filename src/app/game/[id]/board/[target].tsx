import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { api } from '@/api';
import { useGame } from '@/useGame';
import type { Square } from '@shared/types';
import { BingoGrid } from '@/components/BingoGrid';
import { Confetti } from '@/components/Confetti';
import { ErrorText, Muted, styles as ui } from '@/components/ui';
import { colors } from '@/theme';

export default function BoardScreen() {
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

  if (!game || !board) {
    return <View style={[ui.screen, ui.content]}>{error ? <ErrorText>{error}</ErrorText> : <ActivityIndicator color={colors.accent} />}</View>;
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

  const status = board.blackoutAt
    ? `Blackout! Every square is gone 🖤`
    : board.bingoAt
      ? `${person?.name} got BINGO’d 🎉 Keep going for a blackout.`
      : `Tap a square when ${person?.name} says it.`;

  return (
    <View style={ui.screen}>
      <Stack.Screen options={{ title: `${person?.name ?? ''}’s board` }} />
      <ScrollView contentContainerStyle={ui.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}>
        <Text style={[styles.status, board.bingoAt || board.blackoutAt ? { color: colors.accent } : null]}>{status}</Text>
        <ErrorText>{error}</ErrorText>
        <BingoGrid size={game.size} squares={board.squares} pending={pending} onToggle={toggle} />
        <Muted style={{ textAlign: 'center' }}>
          {board.blackoutAt ? 'Writers are revealed ✍︎' : 'Tapped by mistake? Tap again to undo.'}
        </Muted>
      </ScrollView>
      <Confetti burst={burst} />
    </View>
  );
}

const styles = StyleSheet.create({
  status: { fontSize: 18, fontWeight: '800', color: colors.ink, textAlign: 'center' },
});
