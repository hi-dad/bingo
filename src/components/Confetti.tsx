import { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useTheme } from '@/theme';

const PIECES = 48;
const EXTRA = ['#F4B63F', '#3E9B5C', '#FF8FB1', '#4C8DF6'];

// A burst of falling confetti. Changing `burst` (e.g. a bingo timestamp) fires it again.
export function Confetti({ burst }: { burst: number | null }) {
  const { width, height } = useWindowDimensions();
  const { t } = useTheme();
  const palette = [t.strong, t.accent, t.free, ...EXTRA];
  const fall = useRef(new Animated.Value(0)).current;
  const pieces = useMemo(() => Array.from({ length: PIECES }, () => ({
    x: Math.random() * width,
    drift: (Math.random() - 0.5) * 120,
    spin: (Math.random() - 0.5) * 1440,
    delay: Math.random() * 0.25,
    color: palette[Math.floor(Math.random() * palette.length)],
    w: 6 + Math.random() * 6,
  })), [burst, width, t.name]);

  useEffect(() => {
    if (!burst) return;
    fall.setValue(0);
    Animated.timing(fall, { toValue: 1, duration: 2600, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
  }, [burst, fall]);

  if (!burst) return null;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {pieces.map((p, i) => {
        const t = fall.interpolate({ inputRange: [0, p.delay, 1], outputRange: [0, 0, 1], extrapolate: 'clamp' });
        return (
          <Animated.View
            key={i}
            style={{
              position: 'absolute', left: p.x, top: -20, width: p.w, height: p.w * 1.6, backgroundColor: p.color, borderRadius: 2,
              opacity: fall.interpolate({ inputRange: [0, 0.85, 1], outputRange: [1, 1, 0] }),
              transform: [
                { translateY: t.interpolate({ inputRange: [0, 1], outputRange: [0, height + 40] }) },
                { translateX: t.interpolate({ inputRange: [0, 1], outputRange: [0, p.drift] }) },
                { rotate: t.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${p.spin}deg`] }) },
              ],
            }}
          />
        );
      })}
    </View>
  );
}
