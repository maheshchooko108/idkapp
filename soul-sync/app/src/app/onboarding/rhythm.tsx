import { router } from 'expo-router';
import { useState } from 'react';
import { Platform } from 'react-native';

import { DateTimeField, fromHhMm, toHhMm } from '@/components/DateTimeField';
import { Body, Button, Callout, Footnote, Screen, ScaleRow, Title } from '@/components/ui';
import { updateProfile } from '@/lib/api';
import { enableDailyCard } from '@/lib/notifications';
import { useColors } from '@/lib/theme';

export default function Rhythm() {
  const c = useColors();
  const [time, setTime] = useState(fromHhMm('08:00'));
  const [mode, setMode] = useState<1 | 2>(1);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const save = async (withNotification: boolean) => {
    setSaving(true);
    setNote(null);
    try {
      await updateProfile({ mode: mode === 1 ? 'light' : 'deep', notify_time: toHhMm(time) });
      if (withNotification) {
        const ok = await enableDailyCard(toHhMm(time));
        if (!ok) {
          setNote(
            Platform.OS === 'web'
              ? 'Daily notifications come with the iPhone app. In this web preview, your card is waiting each time you open it.'
              : 'Notifications are off. You can turn them on later in Settings; your card is always waiting in the app.',
          );
          return;
        }
      }
      router.push('/onboarding/baseline');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen>
      <Title>Your rhythm</Title>
      <Body muted>One notification a day, at the time you choose. It is the insight itself, like "A slow start serves you today". Nothing else, ever.</Body>
      <DateTimeField label="Send my card at" mode="time" value={time} onChange={setTime} />
      <ScaleRow label="How deep do you want to go?" options={['Light', 'Deep']} value={mode} onChange={(v) => setMode(v as 1 | 2)} />
      <Footnote muted>{mode === 1 ? 'Light: a short card and a two-tap check-in.' : 'Deep: a fuller reading, dasha and transits by name, and room to write.'}</Footnote>
      {note && <Callout style={{ color: c.textMuted }}>{note}</Callout>}
      <Button label={note ? 'Continue' : 'Turn on my daily card'} loading={saving} onPress={() => (note ? router.push('/onboarding/baseline') : save(true))} />
      {!note && <Button variant="link" label="Not now" onPress={() => save(false)} />}
    </Screen>
  );
}
