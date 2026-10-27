// Invoked every 15 minutes by pg_cron (see supabase/cron.sql). For each user
// whose chosen notification time falls in the next window, it prepares the
// card and sends ONE push whose text is the card's own headline: the
// notification is the insight, never "come back!".
import { adminClient, json } from '../_shared/clients.ts';
import { getOrCreateCard } from '../_shared/engine.ts';
import { localDate } from '../_shared/core/dates.ts';

const WINDOW_MINUTES = 15;

function minutesNowIn(tz: string, now: Date): number {
  const [h, m] = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .format(now).split(':').map(Number);
  return h * 60 + m;
}

Deno.serve(async (req) => {
  const secret = Deno.env.get('CRON_SECRET');
  if (!secret || req.headers.get('x-cron-secret') !== secret) return json({ error: 'forbidden' }, 403);

  const db = adminClient();
  const now = new Date();
  const { data: users, error } = await db.from('profiles')
    .select('id, timezone, notify_time, push_token')
    .eq('notify_enabled', true).not('push_token', 'is', null);
  if (error) return json({ error: error.message }, 500);

  const due = (users ?? []).filter((u) => {
    const [h, m] = String(u.notify_time).split(':').map(Number);
    const delta = minutesNowIn(u.timezone, now) - (h * 60 + m);
    return delta >= 0 && delta < WINDOW_MINUTES;
  });

  const messages: unknown[] = [];
  for (const u of due) {
    const today = localDate(now, u.timezone);
    const { data: sent } = await db.from('cards').select('notified_at')
      .eq('user_id', u.id).eq('local_date', today).not('notified_at', 'is', null).maybeSingle();
    if (sent) continue;
    try {
      const card = await getOrCreateCard(db, u.id, { now });
      // Crisis cards never go into a lock-screen notification.
      const body = card.kind === 'crisis' ? 'Your card for today is ready.' : (card.content as { headline: string }).headline;
      messages.push({ to: u.push_token, title: 'Your card is ready', body, sound: 'default', data: { url: 'soulsync://today' } });
      await db.from('cards').update({ notified_at: now.toISOString() }).eq('id', card.id);
    } catch (e) {
      console.error('push prep failed for', u.id, e);
    }
  }

  if (messages.length) {
    const res = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(messages),
    });
    if (!res.ok) console.error('expo push failed', res.status, await res.text());
  }
  return json({ due: due.length, sent: messages.length });
});
