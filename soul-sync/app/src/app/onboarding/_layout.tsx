import { Stack } from 'expo-router';

import { useColors } from '@/lib/theme';

export default function OnboardingLayout() {
  const c = useColors();
  return (
    <Stack
      screenOptions={{
        headerTransparent: false,
        headerShadowVisible: false,
        headerStyle: { backgroundColor: c.bg },
        headerTintColor: c.accent,
        headerTitle: '',
        headerBackButtonDisplayMode: 'minimal',
        contentStyle: { backgroundColor: c.bg },
      }}
    >
      <Stack.Screen name="index" options={{ headerShown: false }} />
      {/* No going back from the reading into the form; it's a moment, not a step. */}
      <Stack.Screen name="reading" options={{ headerBackVisible: false, gestureEnabled: false }} />
    </Stack>
  );
}
