import { router } from 'expo-router';

import { Screen } from '@/components/ui';
import { Who5Form } from '@/components/Who5Form';

export default function Who5Modal() {
  return (
    <Screen>
      <Who5Form doneLabel="Done" onDone={() => router.back()} />
    </Screen>
  );
}
