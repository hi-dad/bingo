import { useState } from 'react';
import { ScrollView } from 'react-native';
import { router } from 'expo-router';
import { api } from '@/api';
import type { Size } from '@shared/logic';
import { SizePicker } from '@/components/SizePicker';
import { Button, ErrorText, Field, Heading, Muted, styles as ui } from '@/components/ui';

export default function NewGame() {
  const [name, setName] = useState('');
  const [size, setSize] = useState<Size>(5);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    setBusy(true);
    try {
      const { id } = await api.createGame(name.trim(), size);
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
      <Heading>Board size</Heading>
      <Muted>Bigger boards need more lines written about each person. You can change this before dealing.</Muted>
      <SizePicker value={size} onChange={setSize} />
      <ErrorText>{error}</ErrorText>
      <Button title="Create game" disabled={!name.trim()} busy={busy} onPress={create} />
    </ScrollView>
  );
}
