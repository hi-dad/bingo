import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { makeStyles, radius, shadow, useTheme } from '@/theme';

// The floating pill tab bar at the bottom of a game.
export function TabBar<K extends string>({ tabs, value, onChange }: {
  tabs: { key: K; label: string; badge?: boolean }[];
  value: K;
  onChange: (key: K) => void;
}) {
  const s = useStyles();
  const { t } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={[s.wrap, { paddingBottom: Math.max(insets.bottom, 12) }]}>
      <View accessibilityRole="tablist" style={s.bar}>
        {tabs.map((tab) => {
          const on = tab.key === value;
          return (
            <Pressable key={tab.key} accessibilityRole="tab" accessibilityState={{ selected: on }} onPress={() => onChange(tab.key)}
              style={[s.tab, on && { backgroundColor: t.strong }]}>
              <Text style={[s.text, { color: on ? t.strongInk : t.muted, fontWeight: on ? '800' : '600' }]}>{tab.label}</Text>
              {tab.badge && !on ? <View style={s.dot} /> : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  wrap: { paddingHorizontal: 18, paddingTop: 8, backgroundColor: t.bg },
  bar: { flexDirection: 'row', gap: 6, padding: 8, borderRadius: radius.xl, backgroundColor: t.card, ...shadow(t, 1.4) },
  tab: { flex: 1, minHeight: 46, borderRadius: 18, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6 },
  text: { fontSize: 15 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: t.strong },
}));
