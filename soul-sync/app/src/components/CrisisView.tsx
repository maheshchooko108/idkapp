import { Linking, View } from 'react-native';

import { CRISIS_MESSAGE, CRISIS_RESOURCES, type CrisisResource } from '@shared/crisis.ts';
import { space } from '@/lib/theme';

import { Body, Button, Card, Callout, Footnote, Title } from './ui';

/** Replaces the normal card when a check-in contains crisis language. */
export function CrisisView({ message = CRISIS_MESSAGE, resources = CRISIS_RESOURCES }: { message?: string; resources?: CrisisResource[] }) {
  return (
    <Card style={{ gap: space.lg }}>
      <Title>Let's get you some support</Title>
      <Body>{message}</Body>
      <View style={{ gap: space.md }}>
        {resources.map((r) => (
          <View key={r.label} style={{ gap: space.xs }}>
            {r.action ? (
              <Button label={r.label} variant={r.action.startsWith('tel:988') ? 'primary' : 'secondary'} onPress={() => Linking.openURL(r.action!)} hint={r.detail} />
            ) : (
              <Callout>{r.label}</Callout>
            )}
            <Footnote muted center>{r.detail}</Footnote>
          </View>
        ))}
      </View>
      <Footnote muted>
        Soul Sync is a wellness and self-reflection tool, not a crisis or medical service.
      </Footnote>
    </Card>
  );
}
