// The daily-card engine: gathers body + mind + timing for one user, runs the
// deterministic pattern finders, asks the LLM to word the card, and stores it.

import Anthropic from 'npm:@anthropic-ai/sdk@1.3.0';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.118.0';

import {
  CARD_JSON_SCHEMA,
  DEFAULT_ENGINE_PROMPT,
  ENGINE_GUARDRAILS,
  fallbackCard,
  renderContext,
  validateCard,
  type DailyCard,
  type EngineContext,
  type TimingSummary,
} from './core/card.ts';
import { CRISIS_MESSAGE, CRISIS_RESOURCES, screenForCrisis } from './core/crisis.ts';
import { addDays, localDate, weekdayName } from './core/dates.ts';
import { categoryScores, learningNote, type ActionCategory, type FeedbackRow } from './core/learning.ts';
import { findEchoes, recurringFeelings, type Checkin } from './core/patterns.ts';
import { computeChart } from './vedic.ts';

type Profile = {
  id: string;
  first_name: string | null;
  timezone: string;
  mode: 'light' | 'deep';
  birth_date: string | null;
  birth_time: string | null;
  birth_time_known: boolean;
  birth_lat: number | null;
  birth_lon: number | null;
  birth_tz: string | null;
};

export type StoredCard = {
  id: string;
  local_date: string;
  kind: 'normal' | 'fallback' | 'crisis' | 'onboarding';
  content: DailyCard | CrisisContent;
  status: string;
  chosen_action: unknown;
  created_at: string;
};

export type CrisisContent = { message: string; resources: typeof CRISIS_RESOURCES };

/**
 * The user's chart plus today's transits. Computed in-process (vedic.ts) by
 * default; if ASTRO_URL is set, the Swiss Ephemeris service is used instead
 * and the in-process chart is the fallback when it can't be reached.
 */
async function fetchTiming(p: Profile, onDate: string): Promise<{ summary: TimingSummary; raw: unknown } | null> {
  if (!p.birth_date || p.birth_lat == null || p.birth_lon == null || !p.birth_tz) return null;
  const input = {
    birth_date: p.birth_date,
    birth_time: p.birth_time_known ? p.birth_time : null,
    tz: p.birth_tz,
    lat: p.birth_lat,
    lon: p.birth_lon,
    on_date: onDate,
  };
  const url = Deno.env.get('ASTRO_URL');
  if (url) {
    try {
      const res = await fetch(`${url.replace(/\/$/, '')}/chart`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-astro-key': Deno.env.get('ASTRO_API_KEY') ?? '' },
        body: JSON.stringify(input),
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) throw new Error(`astro ${res.status}: ${await res.text()}`);
      const raw = await res.json();
      return { summary: raw as TimingSummary, raw };
    } catch (e) {
      console.error('astro service unavailable, computing the chart in-process', e);
    }
  }
  try {
    const raw = computeChart(input);
    return { summary: raw as TimingSummary, raw };
  } catch (e) {
    console.error('timing unavailable, continuing without it', e);
    return null;
  }
}

async function loadConfig(db: SupabaseClient) {
  const { data } = await db.from('app_config').select('key, value');
  const cfg = Object.fromEntries((data ?? []).map((r) => [r.key, r.value]));
  const { data: version } = await db.rpc('current_prompt_version');
  return {
    prompt: (typeof cfg.engine_prompt === 'string' && cfg.engine_prompt.trim()) || DEFAULT_ENGINE_PROMPT,
    model: (typeof cfg.model === 'string' && cfg.model) || 'claude-opus-5-5',
    effort: (typeof cfg.effort === 'string' && cfg.effort) || 'low',
    version: (version as number | null) ?? null,
  };
}

function avg(xs: (number | null)[]): number | null {
  const v = xs.filter((x): x is number => typeof x === 'number');
  return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null;
}

export async function buildContext(db: SupabaseClient, profile: Profile, today: string) {
  const since = addDays(today, -42);
  const [checkinsRes, healthRes, feedbackRes, recentRes] = await Promise.all([
    db.from('checkins').select('local_date, mood, energy, feelings, note, crisis_flag, created_at')
      .eq('user_id', profile.id).gte('local_date', since).order('created_at', { ascending: true }),
    db.from('health_daily').select('local_date, sleep_minutes, hrv_ms, resting_hr, steps')
      .eq('user_id', profile.id).gte('local_date', addDays(today, -15)).order('local_date'),
    db.from('feedback').select('helped, category').eq('user_id', profile.id)
      .order('created_at', { ascending: false }).limit(60),
    db.from('cards').select('content, chosen_action').eq('user_id', profile.id).lt('local_date', today)
      .neq('kind', 'crisis').order('local_date', { ascending: false }).limit(5),
  ]);

  const rows = checkinsRes.data ?? [];
  // One check-in per day for pattern-finding: the latest of that day.
  const byDay = new Map<string, Checkin & { crisis_flag: boolean }>();
  for (const r of rows) {
    byDay.set(r.local_date, {
      localDate: r.local_date, mood: r.mood, energy: r.energy,
      feelings: (r.feelings ?? []).map((f: string) => f.toLowerCase()), note: r.note, crisis_flag: r.crisis_flag,
    });
  }
  const history = [...byDay.values()];
  const todayCheckin = byDay.get(today) ?? null;

  const health = healthRes.data ?? [];
  const last = health.findLast((h) => h.local_date <= today) ?? null;
  const prior = health.filter((h) => h !== last);
  const sleepBase = avg(prior.map((h) => h.sleep_minutes));
  const hrvBase = avg(prior.map((h) => h.hrv_ms));

  const scores = categoryScores((feedbackRes.data ?? []) as FeedbackRow[]);
  const timing = await fetchTiming(profile, today);

  const ctx: EngineContext = {
    firstName: profile.first_name,
    mode: profile.mode,
    localDate: today,
    weekday: weekdayName(today),
    checkin: todayCheckin && {
      mood: todayCheckin.mood, energy: todayCheckin.energy, feelings: todayCheckin.feelings, note: todayCheckin.note,
    },
    body: last && {
      sleepMinutes: last.sleep_minutes,
      sleepVsBaseline: last.sleep_minutes != null && sleepBase != null ? last.sleep_minutes - sleepBase : null,
      hrvMs: last.hrv_ms,
      hrvVsBaselinePct: last.hrv_ms != null && hrvBase ? ((last.hrv_ms - hrvBase) / hrvBase) * 100 : null,
      restingHr: last.resting_hr,
      steps: last.steps,
    },
    timing: timing?.summary ?? null,
    echoes: todayCheckin ? findEchoes(todayCheckin, history).slice(0, 3).map((e) => e.phrase) : [],
    recurringFeelings: recurringFeelings(history, today).slice(0, 3).map((r) => r.feeling),
    learningNote: learningNote(scores),
    bestCategories: scores.filter((s) => s.n >= 2 && s.score >= 0.6).map((s) => s.category as ActionCategory),
    avoidCategories: scores.filter((s) => s.n >= 2 && s.score <= 0.35).map((s) => s.category as ActionCategory),
    recentActions: (recentRes.data ?? []).map((c) =>
      ((c.chosen_action ?? (c.content as DailyCard)?.action) as { title?: string } | null)?.title ?? '').filter(Boolean),
  };
  return { ctx, todayCheckin, timingRaw: timing?.raw ?? null };
}

async function askModel(ctx: EngineContext, cfg: Awaited<ReturnType<typeof loadConfig>>): Promise<DailyCard | null> {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) return null;
  const client = new Anthropic({ apiKey, timeout: 45_000, maxRetries: 1 });
  try {
    const response = await client.beta.messages.create({
      model: cfg.model,
      max_tokens: 4000,
      system: `${cfg.prompt}\n\n${ENGINE_GUARDRAILS}`,
      messages: [{ role: 'user', content: renderContext(ctx) }],
      output_config: { effort: cfg.effort as 'low', format: { type: 'json_schema', schema: CARD_JSON_SCHEMA } },
      // On a safety-classifier decline, re-run on Anthropic's recommended fallback model.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
    });
    if (response.stop_reason !== 'end_turn') {
      console.warn('card generation stopped early', response.stop_reason);
      return null;
    }
    const text = response.content.find((b) => b.type === 'text');
    return text && text.type === 'text' ? validateCard(JSON.parse(text.text)) : null;
  } catch (e) {
    console.error('card generation failed; using fallback card', e);
    return null;
  }
}

/**
 * Returns today's card, generating it if needed. A new check-in after the card
 * was made triggers a regeneration (unless the user already acted on it).
 */
export async function getOrCreateCard(
  db: SupabaseClient,
  userId: string,
  opts: { force?: boolean; kind?: 'normal' | 'onboarding'; now?: Date } = {},
): Promise<StoredCard> {
  const { data: profile, error } = await db.from('profiles').select('*').eq('id', userId).single();
  if (error || !profile) throw new Error(`profile not found for ${userId}`);
  const today = localDate(opts.now ?? new Date(), profile.timezone);

  const { data: existing } = await db.from('cards').select('*').eq('user_id', userId).eq('local_date', today).maybeSingle();
  const { data: latestCheckin } = await db.from('checkins').select('note, feelings, created_at')
    .eq('user_id', userId).eq('local_date', today).order('created_at', { ascending: false }).limit(1).maybeSingle();

  // Safety first: crisis language today means no normal card, regardless of cache.
  if (latestCheckin && screenForCrisis(latestCheckin.note, (latestCheckin.feelings ?? []).join(' ')).flagged) {
    const content: CrisisContent = { message: CRISIS_MESSAGE, resources: CRISIS_RESOURCES };
    const { data } = await db.from('cards').upsert(
      { user_id: userId, local_date: today, kind: 'crisis', content, status: 'ready', chosen_action: null },
      { onConflict: 'user_id,local_date' },
    ).select().single();
    return data as StoredCard;
  }

  const stale = existing && latestCheckin && latestCheckin.created_at > existing.created_at && existing.status === 'ready';
  if (existing && existing.kind !== 'crisis' && !opts.force && !stale) return existing as StoredCard;
  if (existing && existing.status !== 'ready' && existing.kind !== 'crisis') return existing as StoredCard;

  const cfg = await loadConfig(db);
  const { ctx, timingRaw } = await buildContext(db, profile as Profile, today);
  const generated = await askModel(ctx, cfg);
  const card = generated ?? fallbackCard(ctx);

  const { data, error: upsertErr } = await db.from('cards').upsert(
    {
      user_id: userId,
      local_date: today,
      kind: !generated
        ? 'fallback'
        : opts.kind === 'onboarding' || existing?.kind === 'onboarding' ? 'onboarding' : 'normal',
      content: card,
      status: 'ready',
      chosen_action: null,
      model: generated ? cfg.model : null,
      prompt_version: generated ? cfg.version : null,
      created_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,local_date' },
  ).select().single();
  if (upsertErr) throw upsertErr;
  if (timingRaw) await db.from('profiles').update({ natal_chart: timingRaw }).eq('id', userId);
  return data as StoredCard;
}
