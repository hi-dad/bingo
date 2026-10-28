import { Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { useTheme } from '@/theme';

// "8/24" inside a ring that fills as squares get crossed off.
export function ProgressRing({ done, total, size = 68, stroke = 8 }: { done: number; total: number; size?: number; stroke?: number }) {
  const { t } = useTheme();
  const r = (size - stroke) / 2;
  const length = 2 * Math.PI * r;
  const filled = total ? (done / total) * length : 0;
  return (
    <View accessible accessibilityLabel={`${done} of ${total} crossed off`} style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        <Circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={t.soft} strokeWidth={stroke} />
        {filled > 0 ? (
          <Circle
            cx={size / 2} cy={size / 2} r={r} fill="none" stroke={t.strong} strokeWidth={stroke} strokeLinecap="round"
            strokeDasharray={`${filled} ${length}`} transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        ) : null}
      </Svg>
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontSize: size * 0.23, fontWeight: '800', color: t.ink }}>{done}/{total}</Text>
      </View>
    </View>
  );
}

export function ProgressBar({ value, height = 6 }: { value: number; height?: number }) {
  const { t } = useTheme();
  return (
    <View style={{ height, borderRadius: height / 2, backgroundColor: t.soft, overflow: 'hidden' }}>
      <View style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%`, height: '100%', borderRadius: height / 2, backgroundColor: t.strong }} />
    </View>
  );
}
