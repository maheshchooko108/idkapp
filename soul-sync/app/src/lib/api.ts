// Thin data layer over Supabase. Row-level security means every query here
// only ever sees the signed-in user's rows.
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import type { CardAction, DailyCard } from '@shared/card.ts';
import type { CrisisResource } from '@shared/crisis.ts';
import { localDate } from '@shared/dates.ts';
import type { Helped } from '@shared/learning.ts';

import { supabase } from './supabase';

export const deviceTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'UTC';
export const today = () => localDate(new Date(), deviceTimeZone());

export type Profile = {
  id: string;
  first_name: string | null;
  birth_date: string | null;
  birth_time: string | null;
  birth_time_known: boolean;
  birth_place: string | null;
  birth_lat: number | null;
  birth_lon: number | null;
  birth_tz: string | null;
  timezone: string;
  notify_time: string;
  notify_enabled: boolean;
  mode: 'light' | 'deep';
  natal_chart: NatalChart | null;
  onboarded_at: string | null;
};

export type NatalChart = {
  natal_moon: { sign: string; nakshatra: string };
  ascendant: { sign: string } | null;
  dasha: { mahadasha: string; mahadasha_ends: string; antardasha: string; antardasha_ends: string };
  today: { moon_sign: string; moon_nakshatra: string };
  themes: string[];
};

export type CardRow = {
  id: string;
  local_date: string;
  kind: 'normal' | 'fallback' | 'crisis' | 'onboarding';
  content: DailyCard | { message: string; resources: CrisisResource[] };
  chosen_action: CardAction | null;
  status: 'ready' | 'done' | 'skipped';
};

export function isCrisis(c: CardRow): c is CardRow & { content: { message: string; resources: CrisisResource[] } } {
  return c.kind === 'crisis';
}

export async function loadProfile(): Promise<Profile | null> {
  const { data, error } = await supabase.from('profiles').select('*').maybeSingle();
  if (error) throw error;
  return data as Profile | null;
}

export async function updateProfile(patch: Partial<Omit<Profile, 'id' | 'natal_chart'>> & { push_token?: string | null }) {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) throw new Error('not signed in');
  const { error } = await supabase.from('profiles').update(patch).eq('id', u.user.id);
  if (error) throw error;
}

export async function fetchTodayCard(opts: { force?: boolean; onboarding?: boolean } = {}): Promise<CardRow> {
  const { data, error } = await supabase.functions.invoke<{ card: CardRow }>('daily-card', { body: opts });
  if (error || !data) throw error ?? new Error('no card');
  return data.card;
}

export async function cardFor(date: string): Promise<CardRow | null> {
  const { data } = await supabase.from('cards').select('id, local_date, kind, content, chosen_action, status')
    .eq('local_date', date).maybeSingle();
  return data as CardRow | null;
}

export async function hasCheckinToday(): Promise<boolean> {
  const { count } = await supabase.from('checkins').select('id', { count: 'exact', head: true }).eq('local_date', today());
  return (count ?? 0) > 0;
}

export async function setCardStatus(id: string, status: 'done' | 'skipped') {
  const { error } = await supabase.from('cards')
    .update({ status, completed_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
}

export async function swapAction(id: string, action: CardAction) {
  const { error } = await supabase.from('cards').update({ chosen_action: action }).eq('id', id);
  if (error) throw error;
}

export async function sendFeedback(cardId: string, helped: Helped, category: string) {
  const { error } = await supabase.from('feedback').upsert({ card_id: cardId, helped, category }, { onConflict: 'card_id' });
  if (error) throw error;
}

export async function feedbackFor(cardId: string): Promise<Helped | null> {
  const { data } = await supabase.from('feedback').select('helped').eq('card_id', cardId).maybeSingle();
  return (data?.helped as Helped) ?? null;
}

export async function saveCheckin(c: { mood: number; energy: number; feelings: string[]; note: string | null; crisis: boolean }) {
  const { error } = await supabase.from('checkins').insert({
    local_date: today(), mood: c.mood, energy: c.energy, feelings: c.feelings, note: c.note, crisis_flag: c.crisis,
  });
  if (error) throw error;
}

export async function saveWho5(answers: number[]) {
  const { error } = await supabase.from('who5_responses').insert({ answers });
  if (error) throw error;
}

export async function lastWho5(): Promise<{ percent: number; taken_at: string } | null> {
  const { data } = await supabase.from('who5_responses').select('percent, taken_at')
    .order('taken_at', { ascending: false }).limit(1).maybeSingle();
  return data;
}

/** Everything the Patterns screen needs, in one round trip each. */
export async function loadHistory(days = 60) {
  const since = localDate(new Date(Date.now() - days * 86_400_000), deviceTimeZone());
  const [checkins, health, cards, feedback, outcomes, who5] = await Promise.all([
    supabase.from('checkins').select('local_date, mood, energy, feelings, note, created_at').gte('local_date', since).order('created_at'),
    supabase.from('health_daily').select('local_date, sleep_minutes, hrv_ms, hrv_method, resting_hr, steps').gte('local_date', since).order('local_date'),
    supabase.from('cards').select('id, local_date, status, kind, content, chosen_action').gte('local_date', since).order('local_date'),
    supabase.from('feedback').select('helped, category, created_at').order('created_at'),
    supabase.from('my_weekly_outcomes').select('*').order('week'),
    supabase.from('who5_responses').select('percent, taken_at').order('taken_at'),
  ]);
  return {
    checkins: checkins.data ?? [],
    health: health.data ?? [],
    cards: (cards.data ?? []) as (CardRow & { local_date: string })[],
    feedback: feedback.data ?? [],
    outcomes: (outcomes.data ?? []) as { week: string; avg_sleep_minutes: number | null; avg_hrv_ms: number | null; who5_percent: number | null }[],
    who5: who5.data ?? [],
  };
}

/** Days with explicit engagement: a check-in or acting on the card. */
export function activityDates(h: Awaited<ReturnType<typeof loadHistory>>): string[] {
  return [
    ...h.checkins.map((c) => c.local_date as string),
    ...h.cards.filter((c) => c.status !== 'ready').map((c) => c.local_date),
  ];
}

export async function recordSession(startedAt: Date, seconds: number, platform: string) {
  await supabase.from('app_sessions').insert({
    started_at: startedAt.toISOString(),
    duration_seconds: Math.min(86400, Math.max(0, Math.round(seconds))),
    local_date: localDate(startedAt, deviceTimeZone()),
    platform,
  });
}

/** Writes all of the user's data to a JSON file and opens the share sheet. */
export async function exportMyData() {
  const tables = ['profiles', 'checkins', 'health_daily', 'cards', 'feedback', 'who5_responses', 'app_sessions'] as const;
  const out: Record<string, unknown> = { exported_at: new Date().toISOString() };
  for (const t of tables) {
    const { data, error } = await supabase.from(t).select('*');
    if (error) throw error;
    out[t] = data;
  }
  const file = new File(Paths.cache, `soul-sync-export-${today()}.json`);
  if (file.exists) file.delete();
  file.create();
  file.write(JSON.stringify(out, null, 2));
  await Sharing.shareAsync(file.uri, { mimeType: 'application/json', dialogTitle: 'Your Soul Sync data' });
}

export async function deleteMyAccount() {
  const { error } = await supabase.functions.invoke('delete-account', { body: { confirm: 'DELETE' } });
  if (error) throw error;
  await supabase.auth.signOut();
}

/** Free geocoder, no key: turns "Port of Spain" into lat/lon + IANA zone. */
export type Place = { name: string; detail: string; lat: number; lon: number; timezone: string };
export async function searchPlaces(q: string): Promise<Place[]> {
  if (q.trim().length < 2) return [];
  const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?count=6&language=en&name=${encodeURIComponent(q.trim())}`);
  if (!res.ok) return [];
  const body = (await res.json()) as { results?: { name: string; admin1?: string; country?: string; latitude: number; longitude: number; timezone: string }[] };
  return (body.results ?? []).map((r) => ({
    name: r.name,
    detail: [r.admin1, r.country].filter(Boolean).join(', '),
    lat: r.latitude,
    lon: r.longitude,
    timezone: r.timezone,
  }));
}
