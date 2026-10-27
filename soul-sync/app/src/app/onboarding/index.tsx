import { router } from 'expo-router';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Body, Button, Callout, Disclaimer, LargeTitle } from '@/components/ui';
import { space, useColors } from '@/lib/theme';

export default function Welcome() {
  const c = useColors();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={{ flex: 1, padding: space.xl, justifyContent: 'center', gap: space.xl }}>
        <LargeTitle>Soul Sync</LargeTitle>
        <Body>
          Each day we read your body, your mind and your timing, and give you one aligned action. Two minutes, then
          you're done.
        </Body>
        <View style={{ gap: space.sm }}>
          <Callout muted>· Body: sleep, HRV and movement, if you choose to connect them</Callout>
          <Callout muted>· Mind: a 60-second check-in in your own words</Callout>
          <Callout muted>· Timing: your Vedic chart, current dasha and today's sky</Callout>
        </View>
      </View>
      <View style={{ padding: space.xl, gap: space.md }}>
        <Button label="Get my first reading" onPress={() => router.push('/onboarding/birth')} />
        <Callout muted center>No account needed to start.</Callout>
        <Disclaimer />
      </View>
    </SafeAreaView>
  );
}
