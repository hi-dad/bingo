import { Pressable, Text, View } from 'react-native';
import type { Square } from '@shared/types';
import type { Size } from '@shared/logic';
import { makeStyles, radius, shadow, useTheme } from '@/theme';
import { Avatar } from './Avatar';

// A board. `onToggle` makes it tappable; `pending` holds taps still on their way to the
// server (shown right away). Each crossed-off square wears the face of whoever heard it
// (`playerIndex` maps player ids to avatar colors). Writers show once a board is blacked out.
export function BingoGrid({ size, squares, pending = {}, onToggle, onLongPress, playerIndex = {} }: {
  size: Size;
  squares: Square[];
  pending?: Record<string, boolean>;
  onToggle?: (square: Square, on: boolean) => void;
  onLongPress?: (square: Square) => void; // e.g. report the line
  playerIndex?: Record<string, number>;
}) {
  const s = useStyles();
  const { t } = useTheme();
  const fontSize = size === 5 ? 10 : size === 4 ? 12 : 15;
  return (
    <View style={s.grid}>
      {[...squares].sort((a, b) => a.pos - b.pos).map((sq) => {
        const marked = pending[sq.id] ?? !!sq.markedAt;
        const isPending = Object.prototype.hasOwnProperty.call(pending, sq.id);
        const lockedBySomeoneElse = marked && !sq.markedByMe;
        const disabled = !onToggle || sq.free || isPending || lockedBySomeoneElse;
        const by = marked && !sq.free ? (pending[sq.id] && !sq.markedAt ? null : sq.markedBy) : null;
        return (
          <View key={sq.id} style={{ width: `${100 / size}%`, aspectRatio: 1, padding: 3.5 }}>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ checked: marked, disabled }}
              accessibilityLabel={sq.free ? 'Free square' : `${sq.text}${marked ? `, crossed off${by ? ` by ${by}` : ''}` : ''}`}
              disabled={disabled}
              onPress={() => onToggle?.(sq, !marked)}
              onLongPress={onLongPress && sq.phraseId ? () => onLongPress(sq) : undefined}
              accessibilityHint={lockedBySomeoneElse ? 'Crossed off by another player' : onLongPress && sq.phraseId ? 'Press and hold to report this line' : undefined}
              style={({ pressed }) => [
                s.square,
                marked && !sq.free && s.marked,
                sq.free && s.free,
                pressed && { transform: [{ scale: 0.95 }] },
              ]}
            >
              <Text
                style={[s.text, { fontSize }, marked && !sq.free && s.markedText, sq.free && s.freeText]}
                numberOfLines={size === 5 ? 5 : 4}
                adjustsFontSizeToFit
                minimumFontScale={0.6}
              >
                {sq.free ? 'free' : sq.text}
              </Text>
              {sq.writer ? <Text style={[s.writer, marked && { color: t.accentInk }]} numberOfLines={1}>{sq.writer}</Text> : null}
            </Pressable>
            {by && sq.markedById ? (
              <Avatar name={by} index={playerIndex[sq.markedById] ?? 0} size={size === 5 ? 20 : 24} ring={t.bg}
                style={{ position: 'absolute', right: -1, bottom: -1 }} />
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -3.5 },
  square: {
    flex: 1, borderRadius: radius.md, backgroundColor: t.card,
    alignItems: 'center', justifyContent: 'center', padding: 4, ...shadow(t, 0.9),
  },
  marked: { backgroundColor: t.accent, shadowOpacity: 0 },
  free: { backgroundColor: t.free, shadowOpacity: 0 },
  text: { textAlign: 'center', color: t.ink, fontWeight: '600' },
  markedText: { color: t.accentInk, fontWeight: '700' },
  freeText: { color: t.freeInk, fontWeight: '800' },
  writer: { position: 'absolute', top: 3, fontSize: 8, color: t.muted },
}));
