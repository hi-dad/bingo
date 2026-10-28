import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Square } from '@shared/types';
import type { Size } from '@shared/logic';
import { colors, radius } from '@/theme';

// A board. `onToggle` makes it tappable; `pending` holds taps still on their way to the
// server (shown right away). Writers appear once a board is blacked out.
export function BingoGrid({ size, squares, pending = {}, onToggle }: {
  size: Size;
  squares: Square[];
  pending?: Record<string, boolean>;
  onToggle?: (square: Square, on: boolean) => void;
}) {
  const fontSize = size === 5 ? 11 : size === 4 ? 13 : 16;
  return (
    <View style={styles.grid}>
      {[...squares].sort((a, b) => a.pos - b.pos).map((sq) => {
        const marked = pending[sq.id] ?? !!sq.markedAt;
        return (
          <View key={sq.id} style={{ width: `${100 / size}%`, aspectRatio: 1, padding: 3 }}>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ checked: marked, disabled: !onToggle || sq.free }}
              accessibilityLabel={sq.free ? 'Free square' : `${sq.text}${marked ? ', crossed off' : ''}`}
              disabled={!onToggle || sq.free}
              onPress={() => onToggle?.(sq, !marked)}
              style={({ pressed }) => [
                styles.square,
                marked && styles.marked,
                sq.free && styles.free,
                pressed && { transform: [{ scale: 0.95 }] },
              ]}
            >
              <Text
                style={[styles.text, { fontSize }, marked && styles.markedText]}
                numberOfLines={size === 5 ? 5 : 4}
                adjustsFontSizeToFit
                minimumFontScale={0.6}
              >
                {sq.free ? '★ FREE' : sq.text}
              </Text>
              {marked && !sq.free && sq.markedBy && size < 5 ? (
                <Text style={styles.by} numberOfLines={1}>{sq.markedByMe ? 'you' : sq.markedBy}</Text>
              ) : null}
              {sq.writer ? <Text style={[styles.by, styles.writer]} numberOfLines={1}>✍︎ {sq.writer}</Text> : null}
            </Pressable>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -3 },
  square: {
    flex: 1, borderRadius: radius.sm, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line,
    alignItems: 'center', justifyContent: 'center', padding: 4,
  },
  marked: { backgroundColor: colors.accent, borderColor: colors.accent },
  free: { backgroundColor: colors.gold, borderColor: colors.gold },
  text: { textAlign: 'center', color: colors.ink, fontWeight: '600' },
  markedText: { color: colors.accentInk, textDecorationLine: 'line-through' },
  by: { position: 'absolute', bottom: 3, fontSize: 9, color: colors.accentInk, opacity: 0.85 },
  writer: { color: colors.muted, top: 3, bottom: undefined },
});
