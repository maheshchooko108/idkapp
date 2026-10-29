import { Stack } from 'expo-router';
import { Platform } from 'react-native';

import { useColors } from '@/lib/theme';

export default function Layout() {
  const c = useColors();
  return (
    <Stack
      screenOptions={{
        headerLargeTitleEnabled: true,
        // Browsers don't inset scroll content under a see-through header.
        headerTransparent: Platform.OS !== 'web',
        headerBlurEffect: 'systemMaterial',
        headerShadowVisible: false,
        headerLargeTitleShadowVisible: false,
        headerStyle: { backgroundColor: c.bg },
        headerTintColor: c.accent,
        headerTitleStyle: { color: c.text },
        contentStyle: { backgroundColor: c.bg },
      }}
    >
      <Stack.Screen name="index" options={{ title: 'Check-in' }} />
    </Stack>
  );
}
