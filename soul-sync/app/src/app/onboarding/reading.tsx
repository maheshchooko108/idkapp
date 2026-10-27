import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import type { DailyCard } from '@shared/card.ts';
import { CrisisView } from '@/components/CrisisView';
import { DailyCardView } from '@/components/DailyCardView';
import { Body, Button, Callout, Card, Footnote, Headline, Loading, Screen, Title } from '@/components/ui';
import { fetchTodayCard, isCrisis, type CardRow } from '@/lib/api';
import { useSession } from '@/lib/session';
import { space } from '@/lib/theme';

export default function Reading() {
  const { profile, refreshProfile } = useSession();
  const [card, setCard] = useState<CardRow | null>(null);
  const [error, setError] = useState(false);

  const load = async () => {
    setError(false);
    try {
      setCard(await fetchTodayCard({ onboarding: true }));
      await refreshProfile();
    } catch {
      setError(true);
    }
  };
  useEffect(() => {
    load();
  }, []);

  if (error) {
    return (
      <Screen>
        <Title>That took longer than it should</Title>
        <Body muted>Your reading didn't come through. Let's try again.</Body>
        <Button label="Try again" onPress={load} />
      </Screen>
    );
  }
  if (!card) return <Loading label="Reading your chart, your words and your day" />;
  if (isCrisis(card)) {
    return (
      <Screen>
        <CrisisView message={card.content.message} resources={card.content.resources} />
        <Button variant="secondary" label="Continue setting up" onPress={() => router.push('/onboarding/rhythm')} />
      </Screen>
    );
  }

  const chart = profile?.natal_chart;
  const content = card.content as DailyCard;
  return (
    <Screen>
      <Title>{profile?.first_name ? `${profile.first_name}, here's your first reading` : "Here's your first reading"}</Title>
      {chart && (
        <Card>
          <Headline>Your chart at a glance</Headline>
          <View style={{ gap: space.xs }}>
            <Callout>Moon in {chart.natal_moon.sign}, {chart.natal_moon.nakshatra} nakshatra</Callout>
            {chart.ascendant && <Callout>{chart.ascendant.sign} rising</Callout>}
            <Callout>
              {chart.dasha.mahadasha}–{chart.dasha.antardasha} dasha, until {new Date(chart.dasha.antardasha_ends).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
            </Callout>
          </View>
          {chart.themes[1] && <Body muted>{chart.themes[1]}</Body>}
        </Card>
      )}
      <DailyCardView card={content} action={content.action} dateLabel="Today" />
      <Footnote muted center>Every morning you'll get one card like this. That's the whole habit.</Footnote>
      <Button label="Make it a daily ritual" onPress={() => router.push('/onboarding/rhythm')} />
    </Screen>
  );
}
