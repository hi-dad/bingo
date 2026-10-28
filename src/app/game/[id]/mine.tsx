import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { api } from '@/api';
import type { Board } from '@shared/types';
import type { Size } from '@shared/logic';
import { BingoGrid } from '@/components/BingoGrid';
import { ErrorText, Muted, styles as ui } from '@/components/ui';
import { colors } from '@/theme';

// Your own board, shown only once it's blacked out (the Worker refuses before that).
export default function MyBoard() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [board, setBoard] = useState<Board | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.mine(id).then(setBoard).catch((err) => setError((err as Error).message));
  }, [id]);

  if (!board) return <View style={[ui.screen, ui.content]}>{error ? <ErrorText>{error}</ErrorText> : <ActivityIndicator color={colors.accent} />}</View>;
  const size = Math.round(Math.sqrt(board.squares.length)) as Size;

  return (
    <ScrollView style={ui.screen} contentContainerStyle={ui.content}>
      <Text style={styles.title}>So this is what you sound like 😅</Text>
      <BingoGrid size={size} squares={board.squares} />
      <Muted style={{ textAlign: 'center' }}>✍︎ shows who wrote each line</Muted>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 20, fontWeight: '800', color: colors.ink, textAlign: 'center' },
});
