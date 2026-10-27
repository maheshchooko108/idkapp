import { useEffect, useState } from 'react';

import { Body, Button, Callout, Footnote, Screen, Title } from '@/components/ui';
import { updateProfile } from '@/lib/api';
import { health } from '@/lib/health';
import { useSession } from '@/lib/session';
import { connectHealth } from '@/lib/sync';

export default function BodyStep() {
  const { refreshProfile } = useSession();
  const [available, setAvailable] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    health.isAvailable().then(setAvailable).catch(() => setAvailable(false));
  }, []);

  // Setting onboarded_at flips the root guard and lands the user on Today.
  const finish = async () => {
    await updateProfile({ onboarded_at: new Date().toISOString() });
    await refreshProfile();
  };

  return (
    <Screen>
      <Title>Your body's side of the story</Title>
      <Body muted>
        With {health.name ?? 'your health app'} connected, each card can notice a short night or a dip in HRV, and your Patterns
        will show how your well-being moves with your sleep.
      </Body>
      <Callout muted>We read sleep, HRV, resting heart rate and steps. We never write, sell or share them.</Callout>
      {available === false && <Footnote muted>Health data isn't available on this device. You can still use everything else.</Footnote>}
      <Button
        label={`Connect ${health.name ?? 'health data'}`}
        disabled={!available}
        loading={busy}
        onPress={async () => {
          setBusy(true);
          try {
            await connectHealth();
            await finish();
          } finally {
            setBusy(false);
          }
        }}
      />
      <Button variant="link" label="Maybe later" onPress={finish} />
    </Screen>
  );
}
