import { View } from 'react-native';
import { lines, type Size } from '@shared/logic';
import { makeStyles, useTheme } from '@/theme';

// A thumbnail of a board: which spots are crossed off, never what they say. A bingo line
// lights up, a blackout goes dark. With `marks` null the board isn't dealt yet: `filled`
// dashed cells fill in as lines get written about the person.
export function MiniBoard({ size, marks, filled = 0, cell = 10 }: { size: Size; marks: boolean[] | null; filled?: number; cell?: number }) {
  const s = useStyles();
  const { t } = useTheme();
  const count = size * size;
  const blackout = !!marks && marks.every(Boolean);
  const win = new Set(marks && !blackout ? lines(size).filter((l) => l.every((p) => marks[p])).flat() : []);
  return (
    <View style={{ width: size * cell + (size - 1) * 2, flexDirection: 'row', flexWrap: 'wrap', gap: 2 }}>
      {Array.from({ length: count }, (_, pos) => {
        const style = !marks
          ? [s.waiting, pos < filled && s.written]
          : blackout ? s.dark : win.has(pos) ? { backgroundColor: t.win } : marks[pos] ? s.on : s.off;
        return <View key={pos} style={[{ width: cell, height: cell, borderRadius: cell / 4 }, style]} />;
      })}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  off: { backgroundColor: t.soft },
  on: { backgroundColor: t.accent },
  dark: { backgroundColor: t.ink },
  waiting: { borderWidth: 1, borderStyle: 'dashed', borderColor: t.strong, opacity: 0.6 },
  written: { backgroundColor: t.accent, borderColor: t.accent, borderStyle: 'solid', opacity: 0.45 },
}));
