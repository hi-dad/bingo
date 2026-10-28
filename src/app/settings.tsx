import { useState } from 'react';
import { Alert, Linking, ScrollView } from 'react-native';
import { useAuth } from '@/auth';
import { API_URL } from '@/config';
import { Button, Card, ErrorText, Field, Heading, Muted, styles as ui } from '@/components/ui';

export default function Settings() {
  const auth = useAuth();
  const [name, setName] = useState(auth.me?.name ?? '');
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        <Heading>Your name</Heading>
        <Field value={name} onChangeText={(t) => { setName(t); setSaved(false); }} maxLength={24} autoCapitalize="words" />
        <ErrorText>{error}</ErrorText>
        <Button kind="secondary" title={saved ? 'Saved ✓' : 'Save name'} disabled={!name.trim() || name.trim() === auth.me?.name} onPress={save} />
      </Card>
      <Card>
        <Muted>Signed in as {auth.me?.email}</Muted>
        <Button kind="secondary" title="Sign out" onPress={auth.signOut} />
      </Card>
      <Button kind="secondary" title="Privacy policy" onPress={() => Linking.openURL(`${API_URL}/privacy`)} />
      <Button kind="danger" title="Delete account" onPress={confirmDelete} style={{ backgroundColor: 'transparent', borderWidth: 0 }} />
    </ScrollView>
  );
}
