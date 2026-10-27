import { router } from 'expo-router';

import { Body, Button, Screen, Title } from '@/components/ui';
import { Who5Form } from '@/components/Who5Form';

export default function Baseline() {
  return (
    <Screen>
      <Title>Your starting point</Title>
      <Body muted>Five questions, about a minute. We ask again each week so you can see real change, not just feel it.</Body>
      <Who5Form onDone={() => router.push('/onboarding/body')} />
      <Button variant="link" label="Skip for now" onPress={() => router.push('/onboarding/body')} />
    </Screen>
  );
}
