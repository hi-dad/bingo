import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { api } from '@/api';
import { useGame } from '@/useGame';
import { playerIndex } from '@/players';
import type { ArchivedBoard } from '@shared/types';
import type { Size } from '@shared/logic';
import { BingoGrid } from '@/components/BingoGrid';
import { Button, ErrorText, useUi } from '@/components/ui';
import { makeStyles, useTheme } from '@/theme';

export default function FinishedBoardScreen() {
  const ui = useUi();
  const s = useStyles();
  const { t } = useTheme();
  const { id, board: boardId } = useLocalSearchParams<{ id: string; board: string }>();
  const { game } = useGame(id);
  const [board, setBoard] = useState<ArchivedBoard | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.archivedBoard(boardId).then(setBoard).catch((err) => setError((err as Error).message));
  }, [boardId]);

  if (!board) return <View style={[ui.screen, ui.content]}>{error ? <><ErrorText>{error}</ErrorText><Button kind="secondary" title="Back to game" onPress={() => router.replace(`/game/${id}`)} /></> : <ActivityIndicator color={t.strong} />}</View>;
  const size = Math.round(Math.sqrt(board.squares.length)) as Size;
  return (
    <ScrollView style={ui.screen} contentContainerStyle={ui.content}>
      <Stack.Screen options={{ title: `${board.name} · Board ${board.round}` }} />
      <View style={s.header}>
        <Text style={s.title}>{board.name}’s board</Text>
        <Text style={s.tag}>BLACKOUT</Text>
      </View>
      <BingoGrid size={size} squares={board.squares} playerIndex={game ? playerIndex(game) : {}} />
    </ScrollView>
  );
}

const useStyles = makeStyles((t) => ({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  title: { flex: 1, fontSize: 23, fontWeight: '900', color: t.ink },
  tag: { fontSize: 11, fontWeight: '900', letterSpacing: 1, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 7, overflow: 'hidden', backgroundColor: t.ink, color: t.bg },
}));
