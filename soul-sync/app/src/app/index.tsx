import { Redirect } from 'expo-router';

import { useSession } from '@/lib/session';

// Entry point: new users start onboarding, everyone else lands on Today.
export default function Index() {
  const { profile } = useSession();
  return <Redirect href={profile?.onboarded_at ? '/today' : '/onboarding'} />;
}
