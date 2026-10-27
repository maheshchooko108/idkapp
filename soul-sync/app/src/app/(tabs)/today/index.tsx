import { router, useFocusEffect } from 'expo-router';
import * as Haptics from 'expo-haptics';
import * as Sharing from 'expo-sharing';
import { useCallback, useRef, useState } from 'react';
import { View } from 'react-native';
import { captureRef } from 'react-native-view-shot';

import type { CardAction, DailyCard } from '@shared/card.ts';
import { addDays, localHour } from '@shared/dates.ts';
import type { Helped } from '@shared/learning.ts';
import { daysShowedUpThisMonth, showedUpMessage } from '@shared/streaks.ts';
import { WHO5_RECHECK_DAYS } from '@shared/who5.ts';
import { CrisisView } from '@/components/CrisisView';
import { DailyCardView, type CardViewHandle } from '@/components/DailyCardView';
import { Body, Button, Callout, Card, Disclaimer, Footnote, Headline, Loading, Row, Screen, Title } from '@/components/ui';
import {
  activityDates, cardFor, deviceTimeZone, feedbackFor, fetchTodayCard, hasCheckinToday, isCrisis, lastWho5,
  loadHistory, sendFeedback, setCardStatus, swapAction, today, type CardRow,
} from '@/lib/api';
import { useSession } from '@/lib/session';
import { syncHealth } from '@/lib/sync';
import { space, useColors } from '@/lib/theme';

const actionOf = (c: CardRow) => (c.chosen_action ?? (c.content as DailyCard).action) as CardAction;

function HelpedQuestion({ question, onAnswer }: { question: string; onAnswer: (h: Helped) => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const answer = (h: Helped) => async () => {
    setBusy(true);
    try {
      await onAnswer(h);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card>
      <Headline>{question}</Headline>
      <Row>
        <Button label="Yes" onPress={answer('yes')} disabled={busy} haptic />
        <Button label="Somewhat" variant="secondary" onPress={answer('somewhat')} disabled={busy} haptic />
        <Button label="Not really" variant="secondary" onPress={answer('no')} disabled={busy} haptic />
      </Row>
    </Card>
  );
}

export default function Today() {
  const c = useColors();
  const { profile } = useSession();
  const shotRef = useRef<CardViewHandle>(null);
  const [card, setCard] = useState<CardRow | null>(null);
  const [yesterday, setYesterday] = useState<CardRow | null>(null);
  const [helped, setHelped] = useState<Helped | null>(null);
  const [checkedIn, setCheckedIn] = useState(true);
  const [who5Due, setWho5Due] = useState(false);
  const [showedUp, setShowedUp] = useState<number | null>(null);
  const [swapOpen, setSwapOpen] = useState(false);
  const [thanks, setThanks] = useState<string | null>(null);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setError(false);
    try {
      await syncHealth();
      const [t, y, ci, w, h] = await Promise.all([
        fetchTodayCard(),
        cardFor(addDays(today(), -1)),
        hasCheckinToday(),
        lastWho5(),
        loadHistory(31),
      ]);
      setCard(t);
      setHelped(await feedbackFor(t.id));
      // Close yesterday's loop if they did it but never told us how it went.
      setYesterday(y && y.status === 'done' && !isCrisis(y) && !(await feedbackFor(y.id)) ? y : null);
      setCheckedIn(ci);
      setWho5Due(!w || Date.now() - new Date(w.taken_at).getTime() > WHO5_RECHECK_DAYS * 86_400_000);
      setShowedUp(daysShowedUpThisMonth(activityDates(h), today()));
    } catch {
      setError(true);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    load();
  }, [load]));

  if (error) {
    return (
      <Screen>
        <Title>Your card is taking a moment</Title>
        <Body muted>We couldn't reach the server. Pull it in again when you're ready.</Body>
        <Button label="Try again" onPress={load} />
      </Screen>
    );
  }
  if (!card) return <Loading label="Preparing today's card" />;

  if (isCrisis(card)) {
    return (
      <Screen>
        <CrisisView message={card.content.message} resources={card.content.resources} />
        <Disclaimer />
      </Screen>
    );
  }

  const content = card.content as DailyCard;
  const action = actionOf(card);
  const done = card.status !== 'ready';
  const evening = localHour(new Date(), deviceTimeZone()) >= 17;
  const dateLabel = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });

  const answer = (target: CardRow, cat: string) => async (h: Helped) => {
    await sendFeedback(target.id, h, cat);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    setThanks(
      h === 'no'
        ? "Thank you for telling us. We'll try a different kind of action next time."
        : 'Noted. Tomorrow\'s card will lean on what works for you.',
    );
    if (target.id === card.id) setHelped(h);
    else setYesterday(null);
  };

  const mark = (status: 'done' | 'skipped') => async () => {
    await setCardStatus(card.id, status);
    Haptics.notificationAsync(status === 'done' ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Warning).catch(() => {});
    setCard({ ...card, status });
    setSwapOpen(false);
  };

  const share = async () => {
    const uri = await captureRef(shotRef, { format: 'png', quality: 1, result: 'tmpfile' });
    await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: 'Share your card' });
  };

  return (
    <Screen>
      {yesterday && (
        <HelpedQuestion
          question={`Yesterday you did "${actionOf(yesterday).title}". Did it help?`}
          onAnswer={answer(yesterday, actionOf(yesterday).category)}
        />
      )}
      {thanks && <Callout muted>{thanks}</Callout>}

      <DailyCardView ref={shotRef} card={content} action={action} dateLabel={dateLabel} />

      {!done && (
        <View style={{ gap: space.sm }}>
          <Button label="I did it" onPress={mark('done')} hint="Marks today's action as done" />
          <Row style={{ justifyContent: 'center' }}>
            <Button variant="link" label={swapOpen ? 'Keep this one' : 'Swap action'} onPress={() => setSwapOpen((o) => !o)} />
            <Button variant="link" label="Rest day" onPress={mark('skipped')} hint="Skips today's action, no penalty" />
          </Row>
          {swapOpen && content.alternatives.map((alt) => (
            <Button
              key={alt.title}
              variant="secondary"
              label={`${alt.title} · ${alt.minutes} min`}
              onPress={async () => {
                await swapAction(card.id, alt);
                setCard({ ...card, chosen_action: alt });
                setSwapOpen(false);
              }}
            />
          ))}
        </View>
      )}

      {done && (
        <Card style={{ alignItems: 'center' }}>
          <Title>{card.status === 'done' ? "You're done for today." : 'Rest is part of it.'}</Title>
          <Callout muted center>
            {card.status === 'done' ? 'Close the app and go live your day.' : 'See you tomorrow. No catching up required.'}
          </Callout>
          {card.status === 'done' && <Button variant="secondary" label="Share my card" onPress={share} />}
        </Card>
      )}

      {card.status === 'done' && !helped && (evening ? (
        <HelpedQuestion question={content.evening_question} onAnswer={answer(card, action.category)} />
      ) : (
        <Footnote muted center>This evening we'll ask how it went, so tomorrow's card can learn.</Footnote>
      ))}

      {!checkedIn && !done && (
        <Card>
          <Headline>Tune today's card</Headline>
          <Callout muted>A 60-second check-in lets your card speak to what's actually here.</Callout>
          <Button variant="secondary" label="Check in" onPress={() => router.push('/checkin')} />
        </Card>
      )}

      {who5Due && profile?.onboarded_at && (
        <Button variant="link" label="Weekly reflection · 1 minute" onPress={() => router.push('/who5')} />
      )}

      {showedUp != null && <Footnote muted center>{showedUpMessage(showedUp)}</Footnote>}
      {card.kind === 'fallback' && <Footnote muted center>Today's card is a simpler one while our engine catches its breath.</Footnote>}
      <Disclaimer />
    </Screen>
  );
}
