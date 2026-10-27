import { router } from 'expo-router';

import { CheckinForm } from '@/components/CheckinForm';
import { Body, Screen, Title } from '@/components/ui';

export default function Arrive() {
  return (
    <Screen>
      <Title>One quick question</Title>
      <Body muted>Two taps. This is how every day starts.</Body>
      <CheckinForm mode="light" compact submitLabel="See my reading" onSaved={() => router.push('/onboarding/reading')} />
    </Screen>
  );
}
