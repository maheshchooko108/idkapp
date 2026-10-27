import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { View } from 'react-native';

import { categoryScores, type FeedbackRow } from '@shared/learning.ts';
import { recurringFeelings, sleepMoodLink, weekdayMoodPattern, weeklyRecap, type Checkin, type HealthDay } from '@shared/patterns.ts';
import { daysShowedUpThisMonth, showedUpMessage } from '@shared/streaks.ts';
import { who5Change } from '@shared/who5.ts';
import { Bars } from '@/components/Bars';
import { Body, Callout, Card, Disclaimer, Footnote, Headline, Loading, Screen } from '@/components/ui';
import { activityDates, loadHistory, today } from '@/lib/api';
import { useSession } from '@/lib/session';
import { space, useColors } from '@/lib/theme';

type History = Awaited<ReturnType<typeof loadHistory>>;

export default function Patterns() {
  const c = useColors();
  const { profile } = useSession();
  const [h, setH] = useState<History | null>(null);

  useFocusEffect(useCallback(() => {
    loadHistory(60).then(setH).catch(() => {});
  }, []));

  if (!h) return <Loading label="Gathering your patterns" />;

  const t = today();
  const checkins: Checkin[] = h.checkins.map((r) => ({
    localDate: r.local_date, mood: r.mood, energy: r.energy, feelings: r.feelings ?? [], note: r.note,
  }));
  const health: HealthDay[] = h.health.map((r) => ({
    localDate: r.local_date, sleepMinutes: r.sleep_minutes, hrvMs: r.hrv_ms, restingHr: r.resting_hr, steps: r.steps,
  }));
  const scores = categoryScores(h.feedback as FeedbackRow[]);
  const dates = activityDates(h);
  const recap = weeklyRecap({ today: t, activityDates: dates, scores, health });
  const recurring = recurringFeelings(checkins, t).slice(0, 5);
  const insights = [weekdayMoodPattern(checkins), sleepMoodLink(checkins, health)].filter(Boolean) as string[];
  const weeks = h.outcomes.slice(-8);
  const weekLabel = (w: string) => new Date(`${w}T12:00:00`).toLocaleDateString(undefined, { month: 'numeric', day: 'numeric' });
  const who5 = h.who5;
  const change = who5.length >= 2 ? who5Change(who5[0].percent, who5[who5.length - 1].percent) : null;
  const hrvMethod = h.health.find((r) => r.hrv_method)?.hrv_method;
  const young = checkins.length < 5;

  return (
    <Screen>
      <Card>
        <Headline>{showedUpMessage(daysShowedUpThisMonth(dates, t))}</Headline>
        <Callout muted>Rest days count too. They're just not on the board.</Callout>
      </Card>

      <Card>
        <Headline>This week: what's working for you</Headline>
        {recap.whatsWorking.length ? (
          recap.whatsWorking.map((w) => <Body key={w}>· {w}</Body>)
        ) : (
          <Callout muted>Answer "Did it help?" a few evenings and we'll show what works for you here.</Callout>
        )}
        {recap.sleepTrend && <Callout>{recap.sleepTrend}</Callout>}
        {recap.hrvTrend && <Callout>{recap.hrvTrend}</Callout>}
        <Footnote muted>You showed up {recap.daysShowedUp} of the last 7 days.</Footnote>
      </Card>

      {young ? (
        <Card>
          <Headline>Your patterns are still forming</Headline>
          <Callout muted>After about a week of check-ins, this page starts noticing things: the feelings that return, the days that run heavier, how sleep moves your mood.</Callout>
        </Card>
      ) : (
        <Card>
          <Headline>What keeps showing up</Headline>
          {recurring.length > 0 && <Body>{recurring.map((r) => `${r.feeling} (${r.count}×)`).join(' · ')}</Body>}
          {insights.map((i) => <Callout key={i}>{i}</Callout>)}
          {recurring.length === 0 && insights.length === 0 && <Callout muted>No strong repeats yet, which is its own kind of news.</Callout>}
        </Card>
      )}

      <Card>
        <Headline>Real change</Headline>
        {change ? (
          <Body>
            Well-being {change.direction === 'up' ? 'up' : change.direction === 'down' ? 'down' : 'steady'} {Math.abs(change.delta)} points since you started
            {change.meaningful ? ', a meaningful change.' : '.'}
          </Body>
        ) : (
          <Callout muted>Your weekly reflection builds this chart. Two or more and you'll see the trend.</Callout>
        )}
        {weeks.length > 0 && (
          <View style={{ gap: space.xl }}>
            <Bars title="Well-being (WHO-5)" max={100} points={weeks.map((w) => ({ label: weekLabel(w.week), value: w.who5_percent }))} format={(v) => `${v} of 100`} />
            <Bars title="Average sleep" points={weeks.map((w) => ({ label: weekLabel(w.week), value: w.avg_sleep_minutes }))} format={(v) => `${Math.floor(v / 60)}h ${Math.round(v % 60)}m`} color={c.success} />
            <Bars title={`Average HRV${hrvMethod ? ` (${hrvMethod.toUpperCase()})` : ''}`} points={weeks.map((w) => ({ label: weekLabel(w.week), value: w.avg_hrv_ms }))} format={(v) => `${Math.round(v)} ms`} color={c.textMuted} />
          </View>
        )}
        <Footnote muted>HRV is compared only with your own baseline. Apple reports SDNN and Android reports RMSSD, so numbers differ between devices.</Footnote>
      </Card>

      {profile?.natal_chart && (
        <Card>
          <Headline>Your timing</Headline>
          <Callout>
            Moon in {profile.natal_chart.natal_moon.sign} ({profile.natal_chart.natal_moon.nakshatra})
            {profile.natal_chart.ascendant ? ` · ${profile.natal_chart.ascendant.sign} rising` : ''}
          </Callout>
          <Callout>
            {profile.natal_chart.dasha.mahadasha} mahadasha until {profile.natal_chart.dasha.mahadasha_ends.slice(0, 4)} · {profile.natal_chart.dasha.antardasha} sub-period until{' '}
            {new Date(profile.natal_chart.dasha.antardasha_ends).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}
          </Callout>
          {profile.natal_chart.themes.map((th) => <Callout key={th} muted>{th}</Callout>)}
          <Footnote muted>Sidereal zodiac, Lahiri ayanamsa, Vimshottari dasha.</Footnote>
        </Card>
      )}
      <Disclaimer />
    </Screen>
  );
}
