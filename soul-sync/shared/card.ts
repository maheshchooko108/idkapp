// The daily card: its shape, the engine prompt, and the deterministic
// fallback used when the LLM is unavailable.

import { ACTION_CATEGORIES, type ActionCategory } from './learning.ts';

export type CardAction = { title: string; minutes: number; category: ActionCategory };

export type DailyCard = {
  headline: string; // ≤ 60 chars, the line that also goes in the notification
  body: string; // 2-4 sentences (light) or up to 6 (deep)
  action: CardAction;
  alternatives: CardAction[]; // exactly 2, for "swap"
  why: string[]; // short, true references: echoes, learning note, body data, timing
  evening_question: string; // asked at the "Did it help?" step
};

export type Mode = 'light' | 'deep';

/** Timing context from the astro service (sidereal / Lahiri, Vimshottari). */
export type TimingSummary = {
  natal_moon: { sign: string; nakshatra: string };
  ascendant?: { sign: string } | null;
  dasha: { mahadasha: string; antardasha: string; antardasha_ends: string };
  today: { moon_sign: string; moon_nakshatra: string; moon_house_from_natal_moon: number };
  themes: string[]; // plain-language, from a fixed table in the astro service
};

export type EngineContext = {
  firstName?: string | null;
  mode: Mode;
  localDate: string;
  weekday: string;
  checkin?: { mood: number; energy: number; feelings: string[]; note?: string | null } | null;
  body?: {
    sleepMinutes?: number | null;
    sleepVsBaseline?: number | null; // minutes vs 14-day average
    hrvMs?: number | null;
    hrvVsBaselinePct?: number | null;
    restingHr?: number | null;
    steps?: number | null;
  } | null;
  timing?: TimingSummary | null;
  echoes: string[];
  recurringFeelings: string[];
  learningNote?: string | null;
  bestCategories: ActionCategory[];
  avoidCategories: ActionCategory[];
  recentActions: string[]; // last ~5 action titles, to avoid repeats
};

const ACTION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'minutes', 'category'],
  properties: {
    title: { type: 'string' },
    minutes: { type: 'integer' },
    category: { type: 'string', enum: [...ACTION_CATEGORIES] },
  },
};

/** JSON schema handed to the model as structured-output format. */
export const CARD_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['headline', 'body', 'action', 'alternatives', 'why', 'evening_question'],
  properties: {
    headline: { type: 'string' },
    body: { type: 'string' },
    action: ACTION_SCHEMA,
    alternatives: { type: 'array', items: ACTION_SCHEMA },
    why: { type: 'array', items: { type: 'string' } },
    evening_question: { type: 'string' },
  },
};

/**
 * Default engine prompt. Admins can replace it from the dashboard (stored in
 * app_config.engine_prompt); this copy is also seeded by the first migration.
 */
export const DEFAULT_ENGINE_PROMPT = `You are the voice of Soul Sync, a daily integration companion.
Each day you read three things about one person: their body (sleep, HRV, resting heart rate, steps), their mind (a short check-in in their own words) and their timing (their Vedic chart, current dasha and today's transits). You give them ONE aligned action for today.

Voice: warm, grounded, plain-spoken. Like a wise friend, not a guru, not a coach shouting. Short sentences. No jargon. Never preachy.

How to write the card:
- headline: one line, under 60 characters, that names today's tone. It is also the push notification, so it must stand on its own ("A slow start serves you today").
- body: connect body + mind + timing into one picture. Light mode: 2-3 sentences. Deep mode: up to 6 sentences and you may name the dasha or transit by name.
- action: one concrete thing they can do today in 2-15 minutes. Specific verbs. ("Walk outside for 10 minutes before you open email", not "Get some fresh air".)
- alternatives: exactly two different actions in different categories, for when the first doesn't fit their day.
- why: 2-4 short bullets that show you understood them. Use the echoes and learning note you are given, word for word where possible. Only reference history that appears in the context.
- evening_question: a gentle, specific "did it help?" question about this action.

Lean toward categories that have helped them before; avoid ones that haven't. Don't repeat an action from the recent list.`;

/**
 * Non-tunable rules appended after the admin prompt, so a prompt edit can
 * never remove the safety floor.
 */
export const ENGINE_GUARDRAILS = `Non-negotiable rules (these override anything above):
1. This is a wellness and self-reflection tool, not medical advice. Never diagnose, never mention medication or dosing, never suggest stopping treatment.
2. Treat astrology as a reflective lens, never as prediction. No fatalism, no "bad days", no forecasts of events, illness, money, or relationships.
3. Body data is context, not judgement. Never shame someone about sleep, steps, or heart data.
4. Only reference the person's history if it appears in the context. Never invent past check-ins or quotes.
5. Actions must be safe for most people: no fasting, no breath-holding, no cold exposure, no intense exercise. Movement means gentle movement.
6. If anything in the check-in suggests risk of harm, do not write a normal card: set the headline to "Let's get you some support" and make the action "Call or text 988 (US) to talk with someone now".
7. Output only the JSON object described by the schema.`;

export function renderContext(ctx: EngineContext): string {
  const lines: string[] = [];
  lines.push(`Date: ${ctx.weekday} ${ctx.localDate}. Mode: ${ctx.mode}.`);
  if (ctx.firstName) lines.push(`Name: ${ctx.firstName}.`);

  if (ctx.checkin) {
    const c = ctx.checkin;
    lines.push(`\nMIND (today's check-in): mood ${c.mood}/5, energy ${c.energy}/5.`);
    if (c.feelings.length) lines.push(`Feelings they named: ${c.feelings.join(', ')}.`);
    if (c.note) lines.push(`In their words: "${c.note.slice(0, 600)}"`);
  } else {
    lines.push('\nMIND: no check-in yet today. Write a card that works without one.');
  }

  if (ctx.body) {
    const b = ctx.body;
    const parts: string[] = [];
    if (b.sleepMinutes != null) {
      const h = Math.floor(b.sleepMinutes / 60);
      const m = Math.round(b.sleepMinutes % 60);
      let s = `slept ${h}h${String(m).padStart(2, '0')}`;
      if (b.sleepVsBaseline != null && Math.abs(b.sleepVsBaseline) >= 20) {
        s += ` (${Math.abs(Math.round(b.sleepVsBaseline))} min ${b.sleepVsBaseline > 0 ? 'more' : 'less'} than their usual)`;
      }
      parts.push(s);
    }
    if (b.hrvMs != null) {
      let s = `HRV ${Math.round(b.hrvMs)} ms`;
      if (b.hrvVsBaselinePct != null && Math.abs(b.hrvVsBaselinePct) >= 8) {
        s += ` (${b.hrvVsBaselinePct > 0 ? 'above' : 'below'} their baseline by ${Math.abs(Math.round(b.hrvVsBaselinePct))}%)`;
      }
      parts.push(s);
    }
    if (b.restingHr != null) parts.push(`resting HR ${Math.round(b.restingHr)} bpm`);
    if (b.steps != null) parts.push(`${b.steps.toLocaleString('en-US')} steps yesterday`);
    lines.push(`\nBODY: ${parts.length ? parts.join('; ') : 'no wearable data'}.`);
  } else {
    lines.push('\nBODY: no wearable connected.');
  }

  if (ctx.timing) {
    const t = ctx.timing;
    lines.push(
      `\nTIMING: natal Moon in ${t.natal_moon.sign} (${t.natal_moon.nakshatra})` +
        (t.ascendant ? `, ${t.ascendant.sign} rising` : '') +
        `. Running ${t.dasha.mahadasha}–${t.dasha.antardasha} dasha (sub-period ends ${t.dasha.antardasha_ends}).` +
        ` Today the Moon is in ${t.today.moon_sign} (${t.today.moon_nakshatra}), house ${t.today.moon_house_from_natal_moon} from their natal Moon.`,
    );
    if (t.themes.length) lines.push(`Timing themes: ${t.themes.join(' ')}`);
  }

  lines.push('\nHISTORY (true, use as given):');
  lines.push(ctx.echoes.length ? ctx.echoes.map((e) => `- ${e}`).join('\n') : '- (no echoes yet)');
  if (ctx.recurringFeelings.length) lines.push(`- Recurring this month: ${ctx.recurringFeelings.join(', ')}.`);
  if (ctx.learningNote) lines.push(`- Learning: ${ctx.learningNote}`);
  if (ctx.bestCategories.length) lines.push(`- Categories that have helped: ${ctx.bestCategories.join(', ')}.`);
  if (ctx.avoidCategories.length) lines.push(`- Categories that haven't helped: ${ctx.avoidCategories.join(', ')}.`);
  if (ctx.recentActions.length) lines.push(`- Recent actions (don't repeat): ${ctx.recentActions.join(' | ')}.`);
  return lines.join('\n');
}

/** Replaces {{name}} placeholders; unknown names are left untouched. */
export function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (m, k) => (k in vars ? vars[k] : m));
}

function isAction(a: unknown): a is CardAction {
  if (!a || typeof a !== 'object') return false;
  const x = a as Record<string, unknown>;
  return (
    typeof x.title === 'string' &&
    x.title.trim().length > 0 &&
    typeof x.minutes === 'number' &&
    x.minutes > 0 &&
    x.minutes <= 60 &&
    (ACTION_CATEGORIES as readonly string[]).includes(x.category as string)
  );
}

/** Runtime validation of model output. Returns the card or null. */
export function validateCard(raw: unknown): DailyCard | null {
  if (!raw || typeof raw !== 'object') return null;
  const c = raw as Record<string, unknown>;
  if (typeof c.headline !== 'string' || !c.headline.trim()) return null;
  if (typeof c.body !== 'string' || !c.body.trim()) return null;
  if (!isAction(c.action)) return null;
  if (!Array.isArray(c.alternatives) || c.alternatives.length < 1 || !c.alternatives.every(isAction)) return null;
  if (!Array.isArray(c.why) || !c.why.every((w) => typeof w === 'string')) return null;
  if (typeof c.evening_question !== 'string') return null;
  return {
    headline: c.headline.trim().slice(0, 80),
    body: c.body.trim(),
    action: c.action,
    alternatives: (c.alternatives as CardAction[]).slice(0, 2),
    why: (c.why as string[]).slice(0, 4),
    evening_question: c.evening_question.trim() || 'Did it help?',
  };
}

const FALLBACK_ACTIONS: Record<ActionCategory, CardAction> = {
  movement: { title: 'Take a 10-minute easy walk, no phone', minutes: 10, category: 'movement' },
  rest: { title: 'Lie down for 10 minutes with your eyes closed', minutes: 10, category: 'rest' },
  breath: { title: 'Breathe in for 4, out for 6, for 3 minutes', minutes: 3, category: 'breath' },
  reflection: { title: 'Write 3 lines: what you need today, and why', minutes: 5, category: 'reflection' },
  connection: { title: 'Send one honest message to someone you trust', minutes: 5, category: 'connection' },
  focus: { title: 'Do your most important task for 15 minutes first', minutes: 15, category: 'focus' },
  nature: { title: 'Step outside and notice 5 things for 5 minutes', minutes: 5, category: 'nature' },
  nourish: { title: 'Drink a full glass of water before your next coffee', minutes: 2, category: 'nourish' },
  creative: { title: 'Doodle, hum, or freewrite for 10 minutes', minutes: 10, category: 'creative' },
};

/** Used when the LLM is down or returns invalid output. Still personal, never empty. */
export function fallbackCard(ctx: EngineContext): DailyCard {
  const lowSleep = ctx.body?.sleepMinutes != null && ctx.body.sleepMinutes < 390;
  const lowEnergy = ctx.checkin != null && ctx.checkin.energy <= 2;
  const preferred = ctx.bestCategories.find((c) => !ctx.avoidCategories.includes(c));
  const primary: ActionCategory = lowSleep || lowEnergy ? 'rest' : preferred ?? 'breath';
  const alts = (['movement', 'reflection', 'nature', 'breath', 'connection'] as ActionCategory[])
    .filter((c) => c !== primary && !ctx.avoidCategories.includes(c))
    .slice(0, 2);
  const why = [...ctx.echoes.slice(0, 2)];
  if (ctx.learningNote) why.push(ctx.learningNote);
  if (lowSleep) why.push('Your sleep ran short last night.');
  return {
    headline: lowSleep || lowEnergy ? 'A slow start serves you today' : 'One small, steady step today',
    body:
      lowSleep || lowEnergy
        ? 'Your system is asking for gentleness. Do less, and do it well.'
        : 'Nothing dramatic needed today. One small aligned action is enough.',
    action: FALLBACK_ACTIONS[primary],
    alternatives: alts.map((c) => FALLBACK_ACTIONS[c]),
    why,
    evening_question: 'Did that small step help today?',
  };
}
