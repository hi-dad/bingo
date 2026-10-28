import { Pressable, Text, View } from 'react-native';
import { SIZES, phrasesNeeded, type Size } from '@shared/logic';
import { makeStyles, radius, shadow, useTheme } from '@/theme';

export function SizePicker({ value, onChange }: { value: Size; onChange: (s: Size) => void }) {
  const s = useStyles();
  const { t } = useTheme();
  return (
    <View style={s.row}>
      {SIZES.map((n) => {
        const on = n === value;
        return (
          <Pressable key={n} onPress={() => onChange(n)} accessibilityRole="radio" accessibilityState={{ selected: on }}
            style={[s.option, on && { backgroundColor: t.strong }]}>
            <Text style={[s.size, on && { color: t.strongInk }]}>{n}×{n}</Text>
            <Text style={[s.hint, on && { color: t.strongInk }]}>{phrasesNeeded(n)} lines each</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  row: { flexDirection: 'row', gap: 8 },
  option: { flex: 1, paddingVertical: 14, borderRadius: radius.md, backgroundColor: t.card, alignItems: 'center', gap: 2, ...shadow(t) },
  size: { fontSize: 20, fontWeight: '800', color: t.ink },
  hint: { fontSize: 12, color: t.muted },
}));
