import type { ComponentRef, Ref } from 'react';
import { View } from 'react-native';

import type { CardAction, DailyCard } from '@shared/card.ts';
import { CATEGORY_LABEL } from '@shared/learning.ts';
import { radius, space, useColors } from '@/lib/theme';

import { Body, Callout, Footnote, Headline, Title } from './ui';

export type CardViewHandle = ComponentRef<typeof View>;
type Props = { card: DailyCard; action: CardAction; dateLabel: string; showWhy?: boolean; ref?: Ref<CardViewHandle> };

/** The card itself. `ref` lets the Today screen capture it as a shareable image. */
export function DailyCardView({ card, action, dateLabel, showWhy = true, ref }: Props) {
  const c = useColors();
  return (
    <View
      ref={ref}
      collapsable={false}
      style={{ backgroundColor: c.surface, borderRadius: radius.lg, padding: space.xl, gap: space.lg, borderWidth: 1, borderColor: c.border }}
    >
      <Footnote muted>{dateLabel.toUpperCase()}</Footnote>
      <Title>{card.headline}</Title>
      <Body>{card.body}</Body>

      <View style={{ backgroundColor: c.surfaceAlt, borderRadius: radius.md, padding: space.lg, gap: space.xs }} accessible accessibilityLabel={`Today's action: ${action.title}, about ${action.minutes} minutes`}>
        <Footnote muted>TODAY'S ACTION · {CATEGORY_LABEL[action.category].toUpperCase()} · {action.minutes} MIN</Footnote>
        <Headline>{action.title}</Headline>
      </View>

      {showWhy && card.why.length > 0 && (
        <View style={{ gap: space.xs }}>
          <Footnote muted>WHY THIS, TODAY</Footnote>
          {card.why.map((w) => (
            <Callout key={w} muted>
              · {w}
            </Callout>
          ))}
        </View>
      )}
      <Footnote muted>Soul Sync · wellness and self-reflection, not medical advice</Footnote>
    </View>
  );
}
