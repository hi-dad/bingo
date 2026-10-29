// Who's signed in. Sign-in is native (Sign in with Apple, Google), and the provider's ID
// token is swapped for our own session token at the Worker, kept in the Keychain.

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import * as AppleAuthentication from 'expo-apple-authentication';
import { GoogleSignin, isSuccessResponse, isErrorWithCode, statusCodes } from '@react-native-google-signin/google-signin';
import { api, loadToken, saveToken, setSignedOutHandler, type Me, type SignInResult } from './api';
import { GOOGLE_IOS_CLIENT_ID, GOOGLE_WEB_CLIENT_ID } from './config';
import { registerForPush } from './push';

type Status = 'loading' | 'signedOut' | 'signedIn';

interface Auth {
  status: Status;
  me: Me | null;
  signInWithApple: () => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signInDev: (name: string) => Promise<void>;
  setName: (name: string) => Promise<void>;
  signOut: () => Promise<void>;
  deleteAccount: () => Promise<void>;
}

const AuthContext = createContext<Auth | null>(null);

export class Cancelled extends Error {}

// Without an iOS client ID the native module throws at launch, so builds made before the
// Google placeholders are filled in skip it (the Google button then reports the error).
if (GOOGLE_IOS_CLIENT_ID) {
  GoogleSignin.configure({
    webClientId: GOOGLE_WEB_CLIENT_ID || undefined,
    iosClientId: GOOGLE_IOS_CLIENT_ID,
  });
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('loading');
  const [me, setMe] = useState<Me | null>(null);

  const signedOut = useCallback(() => {
    setMe(null);
    setStatus('signedOut');
  }, []);

  useEffect(() => {
    setSignedOutHandler(signedOut);
    (async () => {
      if (!(await loadToken())) return signedOut();
      try {
        setMe(await api.me());
        setStatus('signedIn');
      } catch {
        // Offline at launch: stay signed in with what we know; screens show their own errors.
        setStatus((s) => (s === 'loading' ? 'signedIn' : s));
      }
    })();
    return () => setSignedOutHandler(null);
  }, [signedOut]);

  useEffect(() => {
    if (status === 'signedIn') registerForPush().catch(() => {});
  }, [status]);

  const finish = useCallback(async (result: SignInResult) => {
    await saveToken(result.token);
    setMe({ email: result.email, name: result.name });
    setStatus('signedIn');
  }, []);

  const value = useMemo<Auth>(() => ({
    status,
    me,
    async signInWithApple() {
      try {
        const credential = await AppleAuthentication.signInAsync({
          requestedScopes: [AppleAuthentication.AppleAuthenticationScope.FULL_NAME, AppleAuthentication.AppleAuthenticationScope.EMAIL],
        });
        if (!credential.identityToken) throw new Error('Apple didn’t send a sign-in token');
        // Apple shares the name only on the very first sign-in.
        await finish(await api.signIn('apple', { idToken: credential.identityToken, name: credential.fullName?.givenName ?? null }));
      } catch (err) {
        if ((err as { code?: string }).code === 'ERR_REQUEST_CANCELED') throw new Cancelled();
        throw err;
      }
    },
    async signInWithGoogle() {
      try {
        await GoogleSignin.hasPlayServices();
        const res = await GoogleSignin.signIn();
        if (!isSuccessResponse(res)) throw new Cancelled();
        const idToken = res.data.idToken;
        if (!idToken) throw new Error('Google didn’t send a sign-in token');
        await finish(await api.signIn('google', { idToken }));
      } catch (err) {
        if (isErrorWithCode(err) && err.code === statusCodes.IN_PROGRESS) throw new Cancelled();
        throw err;
      }
    },
    async signInDev(name: string) {
      await finish(await api.signIn('dev', { name }));
    },
    async setName(name: string) {
      setMe(await api.setName(name));
    },
    async signOut() {
      await api.signOut().catch(() => {});
      await GoogleSignin.signOut().catch(() => {});
      await saveToken(null);
      signedOut();
    },
    async deleteAccount() {
      await api.deleteAccount();
      await GoogleSignin.signOut().catch(() => {});
      await saveToken(null);
      signedOut();
    },
  }), [status, me, finish, signedOut]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): Auth {
  const auth = useContext(AuthContext);
  if (!auth) throw new Error('useAuth outside AuthProvider');
  return auth;
}
