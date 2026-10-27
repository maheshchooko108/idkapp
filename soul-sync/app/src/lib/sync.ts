// Pulls the last two weeks of body data into health_daily. Runs on app
// foreground at most once an hour, and only after the user connected health.
import AsyncStorage from '@react-native-async-storage/async-storage';

import { deviceTimeZone } from './api';
import { health } from './health';
import { supabase } from './supabase';

const CONNECTED_KEY = 'health.connected';
const LAST_SYNC_KEY = 'health.lastSync';

export async function isHealthConnected() {
  return (await AsyncStorage.getItem(CONNECTED_KEY)) === '1';
}

export async function connectHealth(): Promise<boolean> {
  if (!(await health.isAvailable())) return false;
  const ok = await health.requestAccess();
  if (ok) {
    await AsyncStorage.setItem(CONNECTED_KEY, '1');
    await syncHealth({ force: true });
  }
  return ok;
}

export async function disconnectHealth() {
  // We stop reading; the OS-level grant is revoked by the user in Settings / Health Connect.
  await AsyncStorage.multiRemove([CONNECTED_KEY, LAST_SYNC_KEY]);
}

export async function syncHealth(opts: { force?: boolean } = {}): Promise<number> {
  if (!(await isHealthConnected())) return 0;
  const last = Number(await AsyncStorage.getItem(LAST_SYNC_KEY)) || 0;
  if (!opts.force && Date.now() - last < 60 * 60 * 1000) return 0;
  try {
    const rows = await health.readDaily(15, deviceTimeZone());
    if (rows.length) {
      const { error } = await supabase.from('health_daily').upsert(
        rows.map((r) => ({ ...r, updated_at: new Date().toISOString() })),
        { onConflict: 'user_id,local_date' },
      );
      if (error) throw error;
    }
    await AsyncStorage.setItem(LAST_SYNC_KEY, String(Date.now()));
    return rows.length;
  } catch (e) {
    console.warn('health sync failed', e);
    return 0;
  }
}
