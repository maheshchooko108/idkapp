// Session + profile context. New users get an anonymous Supabase session on
// first launch, so the first reading happens before any sign-up form; they
// can attach an email later from the You tab.
import type { Session } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

import { deviceTimeZone, loadProfile, updateProfile, type Profile } from './api';
import { supabase } from './supabase';

type Ctx = {
  ready: boolean;
  session: Session | null;
  profile: Profile | null;
  error: string | null;
  refreshProfile: () => Promise<Profile | null>;
  retry: () => void;
};

const SessionContext = createContext<Ctx | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => {
    setError(null);
    setReady(false);
    setAttempt((a) => a + 1);
  }, []);

  const refreshProfile = useCallback(async () => {
    const p = await loadProfile();
    setProfile(p);
    return p;
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        let { data } = await supabase.auth.getSession();
        if (!data.session) {
          const res = await supabase.auth.signInAnonymously();
          if (res.error) throw res.error;
          data = { session: res.data.session };
        }
        if (cancelled) return;
        setSession(data.session);
        const p = await loadProfile();
        // Keep "today" right when people travel.
        if (p && p.timezone !== deviceTimeZone()) {
          await updateProfile({ timezone: deviceTimeZone() });
          p.timezone = deviceTimeZone();
        }
        if (!cancelled) setProfile(p);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [attempt]);

  return <SessionContext.Provider value={{ ready, session, profile, error, refreshProfile, retry }}>{children}</SessionContext.Provider>;
}

export function useSession(): Ctx {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession outside SessionProvider');
  return ctx;
}
