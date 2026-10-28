import { useEffect, useState } from 'react';
import { Alert, Platform, StyleSheet, View } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import { api } from '@/api';
import { Cancelled, useAuth } from '@/auth';
import { Button, Field } from './ui';

// Sign in with Apple (required by the App Store whenever Google sign-in is offered),
// Google, and in development builds against a local Worker, a name-only dev sign-in.
export function SignInButtons() {
  const auth = useAuth();
  const [apple, setApple] = useState(false);
  const [dev, setDev] = useState(false);
  const [devName, setDevName] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    AppleAuthentication.isAvailableAsync().then(setApple).catch(() => {});
    if (__DEV__) api.config().then((c) => setDev(c.dev)).catch(() => {});
  }, []);

  async function run(which: string, fn: () => Promise<void>) {
    setBusy(which);
    try {
      await fn();
    } catch (err) {
      if (!(err instanceof Cancelled)) Alert.alert('Couldn’t sign in', (err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <View style={styles.wrap}>
      {apple && Platform.OS === 'ios' ? (
        <AppleAuthentication.AppleAuthenticationButton
          buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
          buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
          cornerRadius={16}
          style={styles.apple}
          onPress={() => run('apple', auth.signInWithApple)}
        />
      ) : null}
      <Button kind="secondary" title="Continue with Google" busy={busy === 'google'} onPress={() => run('google', auth.signInWithGoogle)} />
      {dev ? (
        <View style={styles.dev}>
          <Field placeholder="Dev sign-in: any name" value={devName} onChangeText={setDevName} autoCapitalize="words" />
          <Button kind="secondary" title="Developer sign-in" disabled={!devName.trim()} busy={busy === 'dev'}
            onPress={() => run('dev', () => auth.signInDev(devName.trim()))} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 12, alignSelf: 'stretch' },
  apple: { height: 52, width: '100%' },
  dev: { gap: 8, marginTop: 12 },
});
