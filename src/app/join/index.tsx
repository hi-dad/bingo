import { useState } from 'react';
import { ScrollView } from 'react-native';
import { router } from 'expo-router';
import { api } from '@/api';
import { Button, ErrorText, Field, Heading, Muted, useUi } from '@/components/ui';

export default function JoinWithCode() {
  const ui = useUi();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const clean = code.replace(/[^A-Za-z0-9]/g, '').toUpperCase();

  async function join() {
    setBusy(true);
    try {
      const { id } = await api.join(clean);
      router.dismissTo(`/game/${id}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <ScrollView style={ui.screen} contentContainerStyle={ui.content} keyboardShouldPersistTaps="handled">
      <Heading>Got a code?</Heading>
      <Muted>It’s the 6 letters and numbers in the invite.</Muted>
      <Field value={code} onChangeText={setCode} placeholder="ABC234" autoFocus autoCapitalize="characters" autoCorrect={false}
        maxLength={8} style={{ fontSize: 28, letterSpacing: 6, textAlign: 'center', fontWeight: '800' }}
        returnKeyType="go" onSubmitEditing={() => clean.length === 6 && join()} />
      <ErrorText>{error}</ErrorText>
      <Button title="Join" disabled={clean.length !== 6} busy={busy} onPress={join} />
    </ScrollView>
  );
}
