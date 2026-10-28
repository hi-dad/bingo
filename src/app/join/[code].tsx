import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { api } from '@/api';
import { useAuth } from '@/auth';
import { SignInButtons } from '@/components/SignInButtons';
import { Button, ErrorText, Heading, Muted, useUi } from '@/components/ui';
import { useTheme } from '@/theme';

// Where invite links (https://<domain>/join/CODE) land. Signed out, it asks you to sign
// in first and then joins, so the invite isn't lost on the way.
export default function JoinFromLink() {
  const ui = useUi();
  const { t } = useTheme();
  const { code } = useLocalSearchParams<{ code: string }>();
  const { status, me } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const ready = status === 'signedIn' && !!me?.name;

  useEffect(() => {
    if (!ready || !code) return;
    api.join(code.toUpperCase())
      .then(({ id }) => router.replace(`/game/${id}`))
      .catch((err) => setError((err as Error).message));
  }, [ready, code]);

  if (status === 'signedOut') {
    return (
      <ScrollView style={ui.screen} contentContainerStyle={ui.content}>
        <Heading>You’re invited to a bingo game 🎲</Heading>
        <Muted>Sign in to join. Your friends will write a board about you, and you’ll never see it.</Muted>
        <SignInButtons />
        <Muted style={{ fontSize: 13, textAlign: 'center' }}>By continuing you agree to the terms: no hateful or hurtful lines.</Muted>
      </ScrollView>
    );
  }
  if (status === 'signedIn' && !me?.name) {
    return (
      <ScrollView style={ui.screen} contentContainerStyle={ui.content}>
        <Muted>Pick a name first, then open the invite again.</Muted>
        <Button title="Pick a name" onPress={() => router.replace('/name')} />
      </ScrollView>
    );
  }
  return (
    <ScrollView style={ui.screen} contentContainerStyle={ui.content}>
      {error ? (
        <>
          <ErrorText>{error}</ErrorText>
          <Button kind="secondary" title="Back to my games" onPress={() => router.replace('/')} />
        </>
      ) : <ActivityIndicator color={t.strong} />}
    </ScrollView>
  );
}
