import { useRef, useState } from 'react';
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from '@/api';
import { useGame } from '@/useGame';
import { MAX_PHRASE } from '@shared/logic';
import { Button, ErrorText, Field, Muted, styles as ui, type InputRef } from '@/components/ui';
import { colors, radius } from '@/theme';

export default function WriteAbout() {
  const { id, target } = useLocalSearchParams<{ id: string; target: string }>();
  const { game, error, act } = useGame(id);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const input = useRef<InputRef>(null);
  const insets = useSafeAreaInsets();

  if (!game) return <View style={[ui.screen, ui.content]}>{error ? <ErrorText>{error}</ErrorText> : <ActivityIndicator color={colors.accent} />}</View>;
  const person = game.players.find((p) => p.id === target);
  const pool = game.pools[target] ?? [];
  const writing = game.status === 'writing';

  async function add() {
    const line = text.trim();
    if (!line) return;
    setBusy(true);
    try {
      await act(() => api.addPhrase(id, target, line));
      setText('');
      setProblem(null);
    } catch (err) {
      setProblem((err as Error).message);
    } finally {
      setBusy(false);
      input.current?.focus();
    }
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
            <Text style={styles.count}>{pool.length}/{game.needed} lines</Text>
            <Muted>
              What does {person?.name} always say or do? Catchphrases, habits, topics they can’t help bringing up.
              Nobody sees who wrote what until the board is done.
            </Muted>
          </View>
        }
        ListEmptyComponent={<Muted style={{ textAlign: 'center', marginTop: 24 }}>Be the first to write one ✍︎</Muted>}
        renderItem={({ item }) => (
          <View style={[styles.phrase, item.mine && styles.mine]}>
            <Text style={styles.phraseText}>{item.text}</Text>
            {item.mine && writing ? (
              <Pressable hitSlop={10} accessibilityLabel={`Delete “${item.text}”`}
                onPress={() => act(() => api.deletePhrase(item.id)).catch((err) => setProblem((err as Error).message))}>
                <Text style={styles.delete}>✕</Text>
              </Pressable>
            ) : null}
          </View>
        )}
      />
      {writing ? (
        <View style={[styles.composer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          <ErrorText>{problem}</ErrorText>
          <View style={styles.inputRow}>
            <Field
              ref={input}
              style={{ flex: 1 }}
              value={text}
              onChangeText={setText}
              placeholder={`“${person?.name ?? 'They'} says…”`}
              maxLength={MAX_PHRASE}
              returnKeyType="send"
              submitBehavior="submit"
              onSubmitEditing={add}
            />
            <Button title="Add" busy={busy} disabled={!text.trim()} onPress={add} style={{ minWidth: 76 }} />
          </View>
        </View>
      ) : (
        <View style={[styles.composer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          <Muted>The boards have been dealt.</Muted>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  count: { fontSize: 28, fontWeight: '900', color: colors.ink },
  phrase: {
    flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: radius.md,
    backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line,
  },
  mine: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  phraseText: { flex: 1, fontSize: 16, color: colors.ink },
  delete: { fontSize: 16, color: colors.muted, fontWeight: '700' },
  composer: { paddingHorizontal: 16, paddingTop: 10, gap: 6, borderTopWidth: 1, borderTopColor: colors.line, backgroundColor: colors.bg },
  inputRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
});
