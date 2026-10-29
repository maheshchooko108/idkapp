import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { View } from 'react-native';

import { Body, Button, Loading, Title } from '@/components/ui';
import { startSessionTracking } from '@/lib/sessionTracking';
import { SessionProvider, useSession } from '@/lib/session';
import { syncHealth } from '@/lib/sync';
import { space, useColors } from '@/lib/theme';
import '@/lib/notifications';

function RootStack() {
  const { ready, session, profile, error, retry } = useSession();
  const c = useColors();

  useEffect(() => startSessionTracking(), []);
  useEffect(() => {
    if (session) syncHealth().catch(() => {});
  }, [session]);

  if (!ready) return <Loading label="Getting your space ready" />;
  if (error && !profile) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', padding: space.xl, gap: space.lg, backgroundColor: c.bg }}>
        <Title>We couldn't connect</Title>
        <Body muted>Check your connection and try again. ({error})</Body>
        <Button label="Try again" onPress={retry} />
      </View>
    );
  }

  const onboarded = Boolean(profile?.onboarded_at);
  return (
    <Stack screenOptions={{ contentStyle: { backgroundColor: c.bg }, headerShown: false }}>
      <Stack.Protected guard={!onboarded}>
        <Stack.Screen name="onboarding" />
      </Stack.Protected>
      <Stack.Protected guard={onboarded}>
        <Stack.Screen name="(tabs)" />
      </Stack.Protected>
      <Stack.Screen name="who5" options={{ presentation: 'modal', headerShown: true, title: 'Weekly reflection' }} />
      <Stack.Screen name="crisis" options={{ presentation: 'modal', headerShown: true, title: 'Support' }} />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <SessionProvider>
      <StatusBar style="auto" />
      <RootStack />
    </SessionProvider>
  );
}
