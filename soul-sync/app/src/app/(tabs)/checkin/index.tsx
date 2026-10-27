import { router } from 'expo-router';
import { useState } from 'react';

import { CheckinForm } from '@/components/CheckinForm';
import { Body, Button, Card, Disclaimer, Screen, Title } from '@/components/ui';
import { useSession } from '@/lib/session';

export default function Checkin() {
  const { profile } = useSession();
  const [saved, setSaved] = useState(false);
  // Remount the form for a fresh check-in after saving.
  const [formKey, setFormKey] = useState(0);

  if (saved) {
    return (
      <Screen>
        <Card>
          <Title>Thank you for checking in.</Title>
          <Body muted>Your card is listening. If you haven't acted on today's yet, it's been tuned to what you shared.</Body>
          <Button label="See today's card" onPress={() => router.navigate('/today')} />
          <Button variant="link" label="Add another check-in" onPress={() => { setSaved(false); setFormKey((k) => k + 1); }} />
        </Card>
        <Disclaimer />
      </Screen>
    );
  }

  return (
    <Screen>
      <Body muted>About 60 seconds. Name what's here; there are no wrong answers.</Body>
      <CheckinForm key={formKey} mode={profile?.mode ?? 'light'} onSaved={() => setSaved(true)} />
      <Disclaimer />
    </Screen>
  );
}
