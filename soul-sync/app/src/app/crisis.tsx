import { router } from 'expo-router';

import { CrisisView } from '@/components/CrisisView';
import { Button, Screen } from '@/components/ui';

export default function Crisis() {
  return (
    <Screen>
      <CrisisView />
      <Button variant="link" label="Close" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
    </Screen>
  );
}
