import { useState } from 'react';
import { ScrollView } from 'react-native';
import { useAuth } from '@/auth';
import { Button, ErrorText, Field, Heading, Muted, useUi } from '@/components/ui';

// Asked once, when sign-in didn't come with a name (Apple only shares it the first time).
export default function Name() {
  const ui = useUi();
  const auth = useAuth();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    try {
      await auth.setName(name.trim());
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <ScrollView style={ui.screen} contentContainerStyle={ui.content} keyboardShouldPersistTaps="handled">
      <Heading>What do your friends call you?</Heading>
      <Muted>This is the name on your board. First name is perfect.</Muted>
      <Field value={name} onChangeText={setName} placeholder="First name" autoFocus autoCapitalize="words" maxLength={24}
        returnKeyType="done" onSubmitEditing={() => name.trim() && save()} />
      <ErrorText>{error}</ErrorText>
      <Button title="Continue" disabled={!name.trim()} busy={busy} onPress={save} />
    </ScrollView>
  );
}
