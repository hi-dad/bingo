import type { ComponentRef, ReactNode, Ref } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View, type TextInputProps, type ViewStyle } from 'react-native';
import { colors, radius } from '@/theme';

export function Button({ title, onPress, kind = 'primary', disabled, busy, style }: {
  title: string;
  onPress: () => void;
  kind?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
  busy?: boolean;
  style?: ViewStyle;
}) {
  const primary = kind === 'primary';
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled || busy}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        primary ? styles.primary : styles.secondary,
        (disabled || busy) && { opacity: 0.45 },
        pressed && { transform: [{ scale: 0.98 }] },
        style,
      ]}
    >
      {busy ? <ActivityIndicator color={primary ? colors.accentInk : colors.ink} /> : (
        <Text style={[styles.buttonText, { color: primary ? colors.accentInk : kind === 'danger' ? colors.accent : colors.ink }]}>{title}</Text>
      )}
    </Pressable>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export type InputRef = ComponentRef<typeof TextInput>;

export function Field({ ref, ...props }: TextInputProps & { ref?: Ref<InputRef> }) {
  return <TextInput ref={ref} placeholderTextColor={colors.muted} {...props} style={[styles.field, props.style]} />;
}

export function Heading({ children }: { children: ReactNode }) {
  return <Text style={styles.heading}>{children}</Text>;
}

export function Muted({ children, style }: { children: ReactNode; style?: object }) {
  return <Text style={[styles.muted, style]}>{children}</Text>;
}

export function ErrorText({ children }: { children: ReactNode }) {
  return children ? <Text style={styles.error}>{children}</Text> : null;
}

export const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, gap: 16 },
  button: { minHeight: 52, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 },
  primary: { backgroundColor: colors.accent },
  secondary: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line },
  buttonText: { fontSize: 17, fontWeight: '700' },
  card: { backgroundColor: colors.card, borderRadius: radius.lg, padding: 16, borderWidth: 1, borderColor: colors.line, gap: 8 },
  field: {
    backgroundColor: colors.card, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line,
    paddingHorizontal: 16, paddingVertical: 14, fontSize: 17, color: colors.ink,
  },
  heading: { fontSize: 20, fontWeight: '800', color: colors.ink },
  muted: { fontSize: 15, color: colors.muted, lineHeight: 21 },
  error: { fontSize: 15, color: colors.accent, fontWeight: '600' },
});
