import { StyleSheet, Text, View } from 'react-native';
import type { Progress } from '@shared/types';
import type { Size } from '@shared/logic';
import { colors } from '@/theme';
import { Card, Muted } from './ui';

// Your own board, as far as you're allowed to know: how much is crossed off, never what.
export function ProgressCard({ progress, size }: { progress: Progress; size: Size }) {
  const { marked, total, best, bingoAt, blackoutAt } = progress;
  const headline = blackoutAt
    ? 'Blacked out 🖤 You said all of it.'
    : bingoAt
      ? 'You got BINGO’d 😳'
      : best === size - 1
        ? 'One away from bingo 👀'
        : marked === 0
          ? 'Nothing crossed off yet 😇'
          : 'They’re listening…';
  return (
    <Card>
      <Text style={styles.label}>YOUR BOARD (SECRET)</Text>
      <Text style={styles.headline}>{headline}</Text>
      <View style={styles.bar}>
        <View style={[styles.fill, { width: `${total ? (marked / total) * 100 : 0}%` }]} />
      </View>
      <Muted>{marked} of {total} crossed off · best line {best}/{size}</Muted>
    </Card>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 12, fontWeight: '800', letterSpacing: 1, color: colors.muted },
  headline: { fontSize: 22, fontWeight: '800', color: colors.ink },
  bar: { height: 10, borderRadius: 5, backgroundColor: colors.accentSoft, overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: colors.accent },
});
