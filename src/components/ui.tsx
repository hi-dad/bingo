import type { ComponentRef, ReactNode, Ref } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View, type StyleProp, type TextInputProps, type TextStyle, type ViewStyle } from 'react-native';
import { makeStyles, radius, shadow, useTheme } from '@/theme';

export function Button({ title, onPress, kind = 'primary', disabled, busy, style }: {
  title: string;
  onPress: () => void;
  kind?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
  busy?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const s = useUi();
  const { t } = useTheme();
  const primary = kind === 'primary';
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled || busy}
      onPress={onPress}
      style={({ pressed }) => [
        s.button,
        primary ? s.primary : kind === 'danger' ? s.danger : s.secondary,
        (disabled || busy) && { opacity: 0.45 },
        pressed && { transform: [{ scale: 0.98 }] },
        style,
      ]}
    >
      {busy ? <ActivityIndicator color={primary ? t.strongInk : t.ink} /> : (
        <Text style={[s.buttonText, { color: primary ? t.strongInk : kind === 'danger' ? t.danger : t.ink }]}>{title}</Text>
      )}
    </Pressable>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const s = useUi();
  return <View style={[s.card, style]}>{children}</View>;
}

export type InputRef = ComponentRef<typeof TextInput>;

export function Field({ ref, ...props }: TextInputProps & { ref?: Ref<InputRef> }) {
  const s = useUi();
  const { t } = useTheme();
  return <TextInput ref={ref} placeholderTextColor={t.muted} {...props} style={[s.field, props.style]} />;
}

export function Heading({ children }: { children: ReactNode }) {
  return <Text style={useUi().heading}>{children}</Text>;
}

export function Label({ children }: { children: ReactNode }) {
  return <Text style={useUi().label}>{children}</Text>;
}

export function Muted({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[useUi().muted, style]}>{children}</Text>;
}

export function ErrorText({ children }: { children: ReactNode }) {
  const s = useUi();
  return children ? <Text style={s.error}>{children}</Text> : null;
}

export const useUi = makeStyles((t) => ({
  screen: { flex: 1, backgroundColor: t.bg },
  content: { padding: 18, gap: 16 },
  button: { minHeight: 52, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 },
  primary: { backgroundColor: t.strong },
  secondary: { backgroundColor: t.card, ...shadow(t) },
  danger: { backgroundColor: 'transparent' },
  buttonText: { fontSize: 17, fontWeight: '700' },
  card: { backgroundColor: t.card, borderRadius: radius.lg, padding: 16, gap: 8, ...shadow(t) },
  field: {
    backgroundColor: t.card, borderRadius: radius.md, borderWidth: 1, borderColor: t.line,
    paddingHorizontal: 16, paddingVertical: 14, fontSize: 17, color: t.ink,
  },
  heading: { fontSize: 20, fontWeight: '800', color: t.ink },
  label: { fontSize: 13, fontWeight: '800', letterSpacing: 1, color: t.muted },
  muted: { fontSize: 15, color: t.muted, lineHeight: 21 },
  error: { fontSize: 15, color: t.danger, fontWeight: '600' },
}));
