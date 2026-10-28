import { useEffect } from 'react';
import { Stack, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as Notifications from 'expo-notifications';
import { AuthProvider, useAuth } from '@/auth';
import { ThemeProvider, useTheme } from '@/theme';

export default function RootLayout() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <StatusBar style="dark" />
        <Navigation />
      </AuthProvider>
    </ThemeProvider>
  );
}

function Navigation() {
  const { status, me } = useAuth();
  const { t } = useTheme();
  const signedIn = status === 'signedIn';
  const needsName = signedIn && !!me && !me.name;
  useNotificationTaps(signedIn);

  if (status === 'loading') return null; // the splash screen stays up meanwhile

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: t.bg },
        headerShadowVisible: false,
        headerTintColor: t.ink,
        headerTitleStyle: { fontWeight: '800' },
        headerBackButtonDisplayMode: 'minimal',
        contentStyle: { backgroundColor: t.bg },
      }}
    >
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="sign-in" options={{ headerShown: false }} />
      </Stack.Protected>
      <Stack.Protected guard={needsName}>
        <Stack.Screen name="name" options={{ title: 'Your name', headerBackVisible: false }} />
      </Stack.Protected>
      <Stack.Protected guard={signedIn && !needsName}>
        <Stack.Screen name="index" options={{ title: 'Bingo' }} />
        <Stack.Screen name="new" options={{ title: 'New game', presentation: 'modal' }} />
        <Stack.Screen name="join/index" options={{ title: 'Join a game', presentation: 'modal' }} />
        <Stack.Screen name="settings" options={{ title: 'Settings' }} />
        <Stack.Screen name="game/[id]/index" options={{ title: '' }} />
        <Stack.Screen name="game/[id]/write/[target]" options={{ title: '' }} />
        <Stack.Screen name="game/[id]/board/[target]" options={{ title: '' }} />
        <Stack.Screen name="game/[id]/mine" options={{ title: 'Your board' }} />
      </Stack.Protected>
      {/* Invite links open here signed in or not; the screen offers sign-in itself. */}
      <Stack.Screen name="join/[code]" options={{ title: 'Join a game' }} />
    </Stack>
  );
}

// Tapping a notification ("Dan got BINGO'd") opens that game.
function useNotificationTaps(signedIn: boolean) {
  useEffect(() => {
    if (!signedIn) return;
    const open = (response: Notifications.NotificationResponse | null) => {
      const url = response?.notification.request.content.data?.url;
      if (typeof url === 'string' && url.startsWith('/game/')) router.push(url as never);
    };
    Notifications.getLastNotificationResponseAsync().then((r) => {
      open(r);
      Notifications.clearLastNotificationResponseAsync().catch(() => {});
    }).catch(() => {});
    const sub = Notifications.addNotificationResponseReceivedListener(open);
    return () => sub.remove();
  }, [signedIn]);
}
