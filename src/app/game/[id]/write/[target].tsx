import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Platform, Pressable, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from '@/api';
import { useGame } from '@/useGame';
import { confirmReport } from '@/report';
import { MAX_PHRASE } from '@shared/logic';
import { Button, ErrorText, Field, Muted, useUi, type InputRef } from '@/components/ui';
import { Icon } from '@/components/Icon';
import { makeStyles, radius, shadow, useTheme } from '@/theme';

// Placeholder ideas, one at a time. Quotes mark things they say; the rest are things they do.
const EXAMPLES = [
  '"Let’s go to Vegas"',
  'Goes to the gym 2x in one day',
  '"I’m not even that tired"',
  'Orders the same thing every time',
  '"Wait, who’s driving?"',
  'Brings up their ex',
  '"Trust me on this one"',
  'Falls asleep during the movie',
  '"No because…"',
  'Checks the weather app',
];

export default function WriteAbout() {
  const ui = useUi();
  const styles = useStyles();
  const { t } = useTheme();
  const { id, target } = useLocalSearchParams<{ id: string; target: string }>();
  const { game, error, act } = useGame(id);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const input = useRef<InputRef>(null);
  const insets = useSafeAreaInsets();
  const [example, setExample] = useState(0);
  const [editing, setEditing] = useState<string | null>(null); // id of your line being edited

  useEffect(() => {
    const timer = setInterval(() => setExample((i) => (i + 1) % EXAMPLES.length), 2500);
    return () => clearInterval(timer);
  }, []);

  if (!game) return <View style={[ui.screen, ui.content]}>{error ? <ErrorText>{error}</ErrorText> : <ActivityIndicator color={t.strong} />}</View>;
  const person = game.players.find((p) => p.id === target);
  const pool = game.pools[target] ?? [];
  // Writing is open before the deal, and later while they wait for their next board.
  const writing = game.status === 'writing' || !!person?.needsLines;

  // Adds a new line, or saves the one being edited.
  async function add() {
    const line = text.trim();
    if (!line) return;
    setBusy(true);
    try {
      await act(() => (editing ? api.editPhrase(editing, line) : api.addPhrase(id, target, line)));
      setText('');
      setEditing(null);
      setProblem(null);
    } catch (err) {
      setProblem((err as Error).message);
    } finally {
      setBusy(false);
      input.current?.focus();
    }
  }

  function startEdit(phraseId: string, current: string) {
    setEditing(phraseId);
    setText(current);
    setProblem(null);
    input.current?.focus();
  }

  function cancelEdit() {
    setEditing(null);
    setText('');
  }

  function remove(phraseId: string) {
    if (editing === phraseId) cancelEdit();
    act(() => api.deletePhrase(phraseId)).catch((err) => setProblem((err as Error).message));
  }

  return (
    <KeyboardAvoidingView style={ui.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={100}>
      <Stack.Screen options={{ title: `About ${person?.name ?? ''}` }} />
      <FlatList
        data={[...pool].reverse()}
        keyExtractor={(p) => p.id}
        contentContainerStyle={[ui.content, { flexGrow: 1 }]}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View style={{ gap: 6 }}>
            <Text style={styles.count}>{pool.length}/{game.needed} lines{person?.round ? ` for board ${person.round + 1}` : ''}</Text>
            <Muted>
              What does {person?.name} always say or do? Catchphrases, habits, topics they can’t help bringing up.
              Nobody sees who wrote what until the board is done.
            </Muted>
          </View>
        }
        ListEmptyComponent={<Muted style={{ textAlign: 'center', marginTop: 24 }}>Be the first to write one.</Muted>}
        renderItem={({ item }) => (
          <Pressable style={[styles.phrase, item.mine && styles.mine, editing === item.id && styles.editing]} disabled={item.mine}
            accessibilityHint={item.mine ? undefined : 'Press and hold to report this line'}
            onLongPress={() => confirmReport(item.text, () => act(() => api.report(item.id)))}>
            <Text style={styles.phraseText}>{item.text}</Text>
            {item.mine && writing ? (
              <View style={styles.tools}>
                <Pressable hitSlop={8} accessibilityLabel={`Edit “${item.text}”`} onPress={() => startEdit(item.id, item.text)}>
                  <Icon name="pencil" size={19} color={t.muted} />
                </Pressable>
                <Pressable hitSlop={8} accessibilityLabel={`Delete “${item.text}”`} onPress={() => remove(item.id)}>
                  <Icon name="trash" size={19} color={t.muted} />
                </Pressable>
              </View>
            ) : null}
          </Pressable>
        )}
      />
      {writing ? (
        <View style={[styles.composer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          <ErrorText>{problem}</ErrorText>
          {editing ? (
            <View style={styles.editBar}>
              <Text style={styles.editLabel}>Editing your line</Text>
              <Pressable hitSlop={10} accessibilityLabel="Cancel editing" onPress={cancelEdit}><Icon name="x" size={18} color={t.muted} /></Pressable>
            </View>
          ) : null}
          <View style={styles.inputRow}>
            <Field
              ref={input}
              style={{ flex: 1 }}
              value={text}
              onChangeText={setText}
              placeholder={EXAMPLES[example]}
              maxLength={MAX_PHRASE}
              returnKeyType="send"
              submitBehavior="submit"
              onSubmitEditing={add}
            />
            <Button title={editing ? 'Save' : 'Add'} busy={busy} disabled={!text.trim()} onPress={add} style={{ minWidth: 76 }} />
          </View>
        </View>
      ) : (
        <View style={[styles.composer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          <Muted>{person?.name}’s board is in play. You can write more once it’s blacked out.</Muted>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

const useStyles = makeStyles((t) => ({
  count: { fontSize: 28, fontWeight: '900', color: t.ink },
  phrase: {
    flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: radius.md,
    backgroundColor: t.card, ...shadow(t),
  },
  mine: { backgroundColor: t.soft, shadowOpacity: 0 },
  phraseText: { flex: 1, fontSize: 16, color: t.ink },
  editing: { borderWidth: 2, borderColor: t.strong },
  tools: { flexDirection: 'row', gap: 16, alignItems: 'center' },
  editBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  editLabel: { fontSize: 13, fontWeight: '700', color: t.strong },
  composer: { paddingHorizontal: 16, paddingTop: 10, gap: 6, borderTopWidth: 1, borderTopColor: t.line, backgroundColor: t.bg },
  inputRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
}));
