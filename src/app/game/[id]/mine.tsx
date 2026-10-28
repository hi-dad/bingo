import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { api } from '@/api';
import { useGame } from '@/useGame';
import { playerIndex } from '@/players';
import type { Board } from '@shared/types';
import type { Size } from '@shared/logic';
import { BingoGrid } from '@/components/BingoGrid';
import { ErrorText, Muted, useUi } from '@/components/ui';
import { makeStyles, useTheme } from '@/theme';

// Your own board, shown only once it's blacked out (the Worker refuses before that).
export default function MyBoard() {
  const ui = useUi();
  const s = useStyles();
  const { t } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { game } = useGame(id);
  const [board, setBoard] = useState<Board | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.mine(id).then(setBoard).catch((err) => setError((err as Error).message));
  }, [id]);

  if (!board) return <View style={[ui.screen, ui.content]}>{error ? <ErrorText>{error}</ErrorText> : <ActivityIndicator color={t.strong} />}</View>;
  const size = Math.round(Math.sqrt(board.squares.length)) as Size;

  return (
    <ScrollView style={ui.screen} contentContainerStyle={ui.content}>
      <Text style={s.title}>So this is what you sound like 😅</Text>
      <BingoGrid size={size} squares={board.squares} playerIndex={game ? playerIndex(game) : {}} />
      <Muted style={{ textAlign: 'center' }}>✍︎ shows who wrote each line · faces show who heard it</Muted>
    </ScrollView>
  );
}

const useStyles = makeStyles((t) => ({
  title: { fontSize: 20, fontWeight: '800', color: t.ink, textAlign: 'center' },
}));
