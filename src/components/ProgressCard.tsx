import { Text, View } from 'react-native';
import type { Progress } from '@shared/types';
import type { Size } from '@shared/logic';
import { makeStyles } from '@/theme';
import { ProgressRing } from './ProgressRing';
import { Card, Label } from './ui';

export function progressLine(p: Progress, size: Size): string {
  if (p.blackoutAt) return 'Blacked out 🖤';
  if (p.bingoAt) return 'BINGO’d 🎉';
  if (p.best === size - 1) return 'One away from bingo 👀';
  if (p.marked === 0) return 'Nothing crossed off yet';
  return 'They’re listening…';
}

// Your own board, as far as you're allowed to know: how much is crossed off, never what.
export function ProgressCard({ progress, size }: { progress: Progress; size: Size }) {
  const s = useStyles();
  const headline = progress.blackoutAt
    ? 'Blacked out 🖤 You said all of it.'
    : progress.bingoAt
      ? 'You got BINGO’d 😳'
      : progress.best === size - 1
        ? 'One away from bingo 👀'
        : progress.marked === 0
          ? 'Nothing crossed off yet 😇'
          : 'They’re listening…';
  return (
    <Card style={s.row}>
      <View style={{ flex: 1, gap: 4 }}>
        <Label>YOUR BOARD · SECRET</Label>
        <Text style={s.headline}>{headline}</Text>
        <Text style={s.sub}>Best line {progress.best}/{size}</Text>
      </View>
      <ProgressRing done={progress.marked} total={progress.total} />
    </Card>
  );
}

const useStyles = makeStyles((t) => ({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headline: { fontSize: 20, fontWeight: '800', color: t.ink },
  sub: { fontSize: 14, color: t.muted },
}));
