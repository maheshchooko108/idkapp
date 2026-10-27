import { useState } from 'react';
import { View } from 'react-native';

import { scoreWho5, WHO5_INTRO, WHO5_ITEMS, WHO5_OPTIONS, who5Message, type Who5Score } from '@shared/who5.ts';
import { saveWho5 } from '@/lib/api';
import { space } from '@/lib/theme';

import { Body, Button, Callout, Card, Footnote, Headline, ScaleRow } from './ui';

// Short labels keep the six options on one or two rows; the full wording is
// read to screen readers via the option list below each item.
const SHORT = ['Never', 'Sometimes', '< Half', '> Half', 'Mostly', 'Always'];

export function Who5Form({ onDone, doneLabel = 'Continue' }: { onDone: (score: Who5Score) => void; doneLabel?: string }) {
  const [answers, setAnswers] = useState<(number | null)[]>([null, null, null, null, null]);
  const [saving, setSaving] = useState(false);
  const [score, setScore] = useState<Who5Score | null>(null);
  const complete = answers.every((a) => a != null);

  if (score) {
    return (
      <Card>
        <Headline>Well-being: {score.percent} / 100</Headline>
        <Body>{who5Message(score)}</Body>
        <Button label={doneLabel} onPress={() => onDone(score)} />
      </Card>
    );
  }

  return (
    <View style={{ gap: space.xl }}>
      <Callout muted>{WHO5_INTRO}</Callout>
      {WHO5_ITEMS.map((item, i) => (
        <ScaleRow
          key={item}
          label={item}
          options={SHORT}
          value={answers[i] == null ? null : answers[i]! + 1}
          onChange={(v) => setAnswers((a) => a.map((x, j) => (j === i ? v - 1 : x)))}
        />
      ))}
      <Footnote muted>{WHO5_OPTIONS.map((o, i) => `${SHORT[i]} = ${o}`).join(' · ')}</Footnote>
      <Button
        label="See my score"
        disabled={!complete}
        loading={saving}
        onPress={async () => {
          const a = answers as number[];
          setSaving(true);
          try {
            await saveWho5(a);
            setScore(scoreWho5(a));
          } finally {
            setSaving(false);
          }
        }}
      />
      <Footnote muted>WHO-5 Well-Being Index © World Health Organization. Not a diagnosis.</Footnote>
    </View>
  );
}
