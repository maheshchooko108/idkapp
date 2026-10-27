import Constants from 'expo-constants';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Switch, TextInput, View } from 'react-native';

import { DateTimeField, fromHhMm, toHhMm } from '@/components/DateTimeField';
import { Body, Button, Callout, Card, Disclaimer, Footnote, Headline, ScaleRow, Screen } from '@/components/ui';
import { deleteMyAccount, exportMyData, updateProfile } from '@/lib/api';
import { health } from '@/lib/health';
import { disableDailyCard, enableDailyCard } from '@/lib/notifications';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import { connectHealth, disconnectHealth, isHealthConnected, syncHealth } from '@/lib/sync';
import { MIN_TOUCH, radius, space, type, useColors } from '@/lib/theme';

export default function You() {
  const c = useColors();
  const { session, profile, refreshProfile, retry } = useSession();
  const [connected, setConnected] = useState(false);
  const [email, setEmail] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useFocusEffect(useCallback(() => {
    isHealthConnected().then(setConnected);
  }, []));

  if (!profile) return null;
  const anonymous = session?.user.is_anonymous ?? true;

  const run = (key: string, fn: () => Promise<void>) => async () => {
    setBusy(key);
    setMsg(null);
    try {
      await fn();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <Screen>
      <Card>
        <Headline>Daily card</Headline>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: MIN_TOUCH }}>
          <Body>One notification a day</Body>
          <Switch
            value={profile.notify_enabled}
            accessibilityLabel="One notification a day"
            onValueChange={(on) =>
              run('notify', async () => {
                if (on) {
                  const ok = await enableDailyCard(profile.notify_time.slice(0, 5));
                  if (!ok) setMsg('Notifications are blocked in Settings. Your card still waits for you in the app.');
                } else await disableDailyCard();
                await refreshProfile();
              })()
            }
          />
        </View>
        <DateTimeField
          label="Time"
          mode="time"
          value={fromHhMm(profile.notify_time)}
          onChange={(d) => run('time', async () => { await updateProfile({ notify_time: toHhMm(d) }); await refreshProfile(); })()}
        />
        <ScaleRow
          label="Depth"
          options={['Light', 'Deep']}
          value={profile.mode === 'light' ? 1 : 2}
          onChange={(v) => run('mode', async () => { await updateProfile({ mode: v === 1 ? 'light' : 'deep' }); await refreshProfile(); })()}
        />
      </Card>

      <Card>
        <Headline>Body data</Headline>
        <Callout muted>
          {connected ? `Connected to ${health.name}. We read sleep, HRV, resting heart rate and steps.` : `Connect ${health.name ?? 'a health app'} so your card can notice what your body is saying.`}
        </Callout>
        {connected ? (
          <>
            <Button variant="secondary" label="Sync now" loading={busy === 'sync'} onPress={run('sync', async () => {
              const n = await syncHealth({ force: true });
              setMsg(n ? `Synced ${n} days.` : 'No new data found. Check access in your health app.');
            })} />
            <Button variant="link" label="Stop reading body data" onPress={run('hd', async () => { await disconnectHealth(); setConnected(false); })} />
          </>
        ) : (
          <Button label={`Connect ${health.name ?? 'health data'}`} loading={busy === 'connect'} onPress={run('connect', async () => setConnected(await connectHealth()))} />
        )}
      </Card>

      <Card>
        <Headline>Weekly reflection</Headline>
        <Callout muted>Five questions (WHO-5). It's how we show real change over time.</Callout>
        <Button variant="secondary" label="Take it now" onPress={() => router.push('/who5')} />
      </Card>

      {anonymous ? (
        <Card>
          <Headline>Keep your journey</Headline>
          <Callout muted>Add your email so you can restore everything on a new phone. We'll send one confirmation link, nothing else.</Callout>
          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            placeholderTextColor={c.textMuted}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            accessibilityLabel="Email"
            style={{ ...type.body, color: c.text, backgroundColor: c.surfaceAlt, borderRadius: radius.md, paddingHorizontal: space.lg, minHeight: MIN_TOUCH }}
          />
          <Button label="Save my journey" disabled={!email.includes('@')} loading={busy === 'email'} onPress={run('email', async () => {
            const { error } = await supabase.auth.updateUser({ email: email.trim() });
            if (error) throw error;
            setMsg('Check your inbox to confirm. Your data is already safe on this phone.');
          })} />
        </Card>
      ) : (
        <Card>
          <Headline>Account</Headline>
          <Callout muted>{session?.user.email}</Callout>
        </Card>
      )}

      <Card>
        <Headline>Your data</Headline>
        <Callout muted>Everything you've shared is yours. Take it with you, or erase it.</Callout>
        <Button variant="secondary" label="Export my data" loading={busy === 'export'} onPress={run('export', exportMyData)} />
        <Button
          variant="link"
          label="Delete my account and data"
          onPress={() =>
            Alert.alert('Delete everything?', 'This permanently erases your check-ins, cards, chart and health data. It cannot be undone.', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Delete', style: 'destructive', onPress: run('delete', async () => { await deleteMyAccount(); retry(); }) },
            ])
          }
        />
      </Card>

      {msg && <Callout style={{ color: c.textMuted }}>{msg}</Callout>}

      <Card>
        <Headline>Need support?</Headline>
        <Callout muted>If you're struggling, you deserve a real person to talk to.</Callout>
        <Button variant="secondary" label="Crisis resources" onPress={() => router.push('/crisis')} />
      </Card>

      <Disclaimer />
      <Footnote muted center>Soul Sync pilot · v{Constants.expoConfig?.version}</Footnote>
    </Screen>
  );
}
