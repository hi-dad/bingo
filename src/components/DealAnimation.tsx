import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { makeStyles, radius, shadow, useTheme } from '@/theme';

const CELL_COUNT = 25;

// A short transition between writing and play. The Worker does the real secure shuffle;
// this animation simply makes that automatic moment visible to everyone in the game.
export function DealAnimation({ visible, onDone }: { visible: boolean; onDone: () => void }) {
  const s = useStyles();
  const { t } = useTheme();
  const [ready, setReady] = useState(false);
  const cells = useRef(Array.from({ length: CELL_COUNT }, () => new Animated.Value(0))).current;
  const card = useRef(new Animated.Value(0)).current;
  const done = useRef(onDone);
  done.current = onDone;

  useEffect(() => {
    if (!visible) return;
    setReady(false);
    card.setValue(0);
    cells.forEach((cell) => cell.setValue(0));
    const order = [...cells].sort(() => Math.random() - 0.5);
    const animation = Animated.parallel([
      Animated.timing(card, { toValue: 1, duration: 220, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.stagger(28, order.map((cell) => Animated.sequence([
        Animated.timing(cell, { toValue: 1, duration: 180, useNativeDriver: true }),
        Animated.timing(cell, { toValue: 0.45, duration: 120, useNativeDriver: true }),
        Animated.timing(cell, { toValue: 1, duration: 160, useNativeDriver: true }),
      ]))),
    ]);
    let timer: ReturnType<typeof setTimeout> | undefined;
    animation.start(({ finished }) => {
      if (!finished) return;
      setReady(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      timer = setTimeout(() => done.current(), 850);
    });
    return () => {
      animation.stop();
      if (timer) clearTimeout(timer);
    };
  }, [visible, card, cells]);

  if (!visible) return null;
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, s.backdrop]}>
      <Animated.View style={[s.card, {
        opacity: card,
        transform: [{ scale: card.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] }) }],
      }]}>
        <View style={s.grid}>
          {cells.map((cell, i) => (
            <Animated.View key={i} style={[s.cell, {
              backgroundColor: i % 5 === Math.floor(i / 5) ? t.win : t.accent,
              opacity: cell,
              transform: [{ scale: cell.interpolate({ inputRange: [0, 1], outputRange: [0.45, 1] }) }],
            }]} />
          ))}
        </View>
        <Text style={s.title}>{ready ? 'Boards are live' : 'Randomizing boards'}</Text>
        <Text style={s.sub}>{ready ? 'Start listening.' : 'Mixing up 25 lines for each person.'}</Text>
      </Animated.View>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  backdrop: { zIndex: 20, alignItems: 'center', justifyContent: 'center', padding: 28, backgroundColor: `${t.bg}F2` },
  card: { width: '100%', maxWidth: 330, alignItems: 'center', gap: 16, padding: 28, borderRadius: radius.xl, backgroundColor: t.card, ...shadow(t, 2) },
  grid: { width: 142, flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  cell: { width: 23.6, height: 23.6, borderRadius: 6 },
  title: { fontSize: 25, fontWeight: '900', color: t.ink, textAlign: 'center' },
  sub: { fontSize: 15, color: t.muted, textAlign: 'center' },
}));
