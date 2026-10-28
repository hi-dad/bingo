import { Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { avatarColors } from '@/theme';

// A player's initial in their color (colors follow join order, the same on every phone).
export function Avatar({ name, index, size = 28, ring, style }: {
  name: string;
  index: number;
  size?: number;
  ring?: string; // border color, to sit cleanly on top of a square
  style?: StyleProp<ViewStyle>;
}) {
  const c = avatarColors(index);
  return (
    <View
      accessibilityLabel={name}
      style={[{
        width: size, height: size, borderRadius: size / 2, backgroundColor: c.bg,
        alignItems: 'center', justifyContent: 'center',
        ...(ring ? { borderWidth: 2, borderColor: ring } : {}),
      }, style]}
    >
      <Text style={{ color: c.ink, fontSize: size * 0.45, fontWeight: '800' }}>{(name.trim()[0] || '?').toUpperCase()}</Text>
    </View>
  );
}
