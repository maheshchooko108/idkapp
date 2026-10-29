import { Tabs } from 'expo-router/js-tabs';

import { MIN_TOUCH, type, useColors } from '@/lib/theme';

// Web preview only: native tabs render as a floating top bar in browsers, so
// the web build uses a plain bottom tab bar. iOS/Android use _layout.tsx.
export default function TabsLayoutWeb() {
  const c = useColors();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: c.accent,
        tabBarInactiveTintColor: c.textMuted,
        tabBarStyle: { backgroundColor: c.surface, borderTopColor: c.border, minHeight: MIN_TOUCH + 12 },
        tabBarIcon: () => null,
        tabBarIconStyle: { display: 'none' },
        tabBarLabelStyle: { ...type.callout, fontWeight: '600' },
      }}
    >
      <Tabs.Screen name="today" options={{ title: 'Today' }} />
      <Tabs.Screen name="checkin" options={{ title: 'Check-in' }} />
      <Tabs.Screen name="patterns" options={{ title: 'Patterns' }} />
      <Tabs.Screen name="you" options={{ title: 'You' }} />
    </Tabs>
  );
}
