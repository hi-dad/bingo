import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SIZES, phrasesNeeded, type Size } from '@shared/logic';
import { colors, radius } from '@/theme';

export function SizePicker({ value, onChange }: { value: Size; onChange: (s: Size) => void }) {
  return (
    <View style={styles.row}>
      {SIZES.map((s) => (
        <Pressable key={s} onPress={() => onChange(s)} accessibilityRole="radio" accessibilityState={{ selected: s === value }}
          style={[styles.option, s === value && styles.on]}>
          <Text style={[styles.size, s === value && styles.onText]}>{s}×{s}</Text>
          <Text style={[styles.hint, s === value && styles.onText]}>{phrasesNeeded(s)} lines each</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8 },
  option: { flex: 1, paddingVertical: 14, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.card, alignItems: 'center', gap: 2 },
  on: { backgroundColor: colors.ink, borderColor: colors.ink },
  size: { fontSize: 20, fontWeight: '800', color: colors.ink },
  hint: { fontSize: 12, color: colors.muted },
  onText: { color: colors.bg },
});
