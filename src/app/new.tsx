import { useState } from 'react';
import { ScrollView } from 'react-native';
import { router } from 'expo-router';
import { api } from '@/api';
import { Button, ErrorText, Field, Heading, Muted, useUi } from '@/components/ui';

export default function NewGame() {
  const ui = useUi();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    setBusy(true);
    try {
      const { id } = await api.createGame(name.trim());
      router.dismissTo(`/game/${id}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <ScrollView style={ui.screen} contentContainerStyle={ui.content} keyboardShouldPersistTaps="handled">
      <Heading>What’s the occasion?</Heading>
      <Field value={name} onChangeText={setName} placeholder="Lake trip, Roommates, Thanksgiving…" autoFocus maxLength={40} />
      <Muted>Boards are 5×5. The game starts automatically once everyone has 25 lines.</Muted>
      <ErrorText>{error}</ErrorText>
      <Button title="Create game" disabled={!name.trim()} busy={busy} onPress={create} />
    </ScrollView>
  );
}
