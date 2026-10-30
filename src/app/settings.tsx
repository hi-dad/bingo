import { useCallback, useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { api } from '@/api';
import { useAuth } from '@/auth';
import { API_URL } from '@/config';
import { Button, Card, ErrorText, Field, Heading, Muted, useUi } from '@/components/ui';
import { THEMES, THEME_ORDER, makeStyles, radius, useTheme, type Theme } from '@/theme';

export default function Settings() {
  const ui = useUi();
  const s = useStyles();
  const auth = useAuth();
  const { t, setTheme } = useTheme();
  const [name, setName] = useState(auth.me?.name ?? '');
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [blocked, setBlocked] = useState<{ id: string; name: string }[]>([]);
  const [hurtfulOpen, setHurtfulOpen] = useState(false);

  useFocusEffect(useCallback(() => { api.blocks().then(setBlocked).catch(() => {}); }, []));

  async function unblock(b: { id: string; name: string }) {
    try {
      await api.unblock(b.id);
      setBlocked((list) => list.filter((x) => x.id !== b.id));
    } catch (err) {
      Alert.alert('Couldn’t unblock', (err as Error).message);
    }
  }

  async function save() {
    try {
      await auth.setName(name.trim());
      setSaved(true);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  function confirmDelete() {
    Alert.alert(
      'Delete your account?',
      'You’ll leave every game and your board will be deleted. Lines you wrote about friends stay on their boards, without your name.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive',
          onPress: () => auth.deleteAccount().catch((err) => Alert.alert('Couldn’t delete', (err as Error).message)),
        },
      ],
    );
  }

  return (
    <ScrollView style={ui.screen} contentContainerStyle={ui.content} keyboardShouldPersistTaps="handled">
      <Card>
        <Heading>Color</Heading>
        <View accessibilityRole="radiogroup" style={{ flexDirection: 'row', gap: 8 }}>
          {THEME_ORDER.map((n) => (
            <Swatch key={n} theme={THEMES[n]} selected={t.name === n} onPress={() => setTheme(n)} />
          ))}
        </View>
      </Card>
      <Card>
        <Heading>Your name</Heading>
        <Field value={name} onChangeText={(v) => { setName(v); setSaved(false); }} maxLength={24} autoCapitalize="words" />
        <ErrorText>{error}</ErrorText>
        <Button kind="secondary" title={saved ? 'Saved' : 'Save name'} disabled={!name.trim() || name.trim() === auth.me?.name} onPress={save} />
      </Card>
      {blocked.length ? (
        <Card>
          <Heading>Blocked</Heading>
          {blocked.map((b) => (
            <View key={b.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={{ flex: 1, fontSize: 16, color: t.ink }}>{b.name}</Text>
              <Button kind="secondary" title="Unblock" onPress={() => unblock(b)} style={{ minHeight: 40 }} />
            </View>
          ))}
        </Card>
      ) : null}
      <Card>
        <Muted>Signed in as {auth.me?.email}</Muted>
        <Button kind="secondary" title="Sign out" onPress={auth.signOut} />
      </Card>
      <Button kind="secondary" title="Privacy policy" onPress={() => Linking.openURL(`${API_URL}/privacy`)} />
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: hurtfulOpen }} onPress={() => setHurtfulOpen((open) => !open)} style={s.safety}>
        <View style={s.safetyRow}>
          <Text style={s.safetyTitle}>Report a concern</Text>
          <Text style={s.safetyToggle}>{hurtfulOpen ? 'Hide' : 'Help'}</Text>
        </View>
        {hurtfulOpen ? <Muted>Press and hold any square or line to report it. To block someone, press and hold their name in People.</Muted> : null}
      </Pressable>
      <Button kind="danger" title="Delete account" onPress={confirmDelete} />
    </ScrollView>
  );
}

// A theme shown in its own colors: a tiny board, crossed-off square and all.
function Swatch({ theme, selected, onPress }: { theme: Theme; selected: boolean; onPress: () => void }) {
  const s = useStyles();
  return (
    <Pressable accessibilityRole="radio" accessibilityState={{ selected }} accessibilityLabel={theme.label} onPress={onPress}
      style={[s.swatch, { backgroundColor: theme.bg, borderColor: selected ? theme.strong : theme.line }]}>
      <View style={s.mini}>
        {[0, 1, 2, 3].map((i) => (
          <View key={i} style={[s.cell, { backgroundColor: i === 1 || i === 2 ? theme.accent : theme.card }]} />
        ))}
      </View>
      <Text style={[s.name, { color: theme.ink }]}>{theme.label}</Text>
    </Pressable>
  );
}

const useStyles = makeStyles((t) => ({
  swatch: { flex: 1, borderRadius: radius.md, borderWidth: 2, paddingVertical: 10, alignItems: 'center', gap: 6 },
  mini: { width: 34, flexDirection: 'row', flexWrap: 'wrap', gap: 3 },
  cell: { width: 15, height: 15, borderRadius: 4 },
  name: { fontSize: 14, fontWeight: '700' },
  safety: { paddingHorizontal: 14, paddingVertical: 11, borderWidth: 1, borderColor: t.line, borderRadius: radius.md, gap: 8 },
  safetyRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  safetyTitle: { fontSize: 15, fontWeight: '700', color: t.ink },
  safetyToggle: { fontSize: 14, fontWeight: '800', color: t.strong },
}));
