// Pattern finding over check-ins and body data. Deterministic on purpose: the
// LLM gets these as facts and only words them, so "you named this two Mondays
// ago" is always true rather than plausibly invented.

import { type LocalDate, addDays, daysBetween, relativePhrase, weekdayName, weekdayOf } from './dates.ts';
import { type CategoryScore, CATEGORY_LABEL } from './learning.ts';

export type Checkin = {
  localDate: LocalDate;
  mood: number; // 1-5
  energy: number; // 1-5
  feelings: string[]; // lower-case words, e.g. ["restless", "hopeful"]
  note?: string | null;
};

export type HealthDay = {
  localDate: LocalDate;
  sleepMinutes?: number | null;
  hrvMs?: number | null;
  restingHr?: number | null;
  steps?: number | null;
};

export type Echo = { feeling: string; date: LocalDate; sameWeekday: boolean; phrase: string };

/**
 * For each feeling named today, the most relevant earlier time it was named:
 * prefer the same weekday (the "two Mondays ago" moment), else the most recent.
 */
export function findEchoes(today: Checkin, history: readonly Checkin[], lookbackDays = 42): Echo[] {
  const echoes: Echo[] = [];
  const earlier = history
    .filter((c) => c.localDate < today.localDate && daysBetween(c.localDate, today.localDate) <= lookbackDays)
    .sort((a, b) => (a.localDate < b.localDate ? 1 : -1));
  for (const feeling of today.feelings) {
    const hits = earlier.filter((c) => c.feelings.includes(feeling));
    if (hits.length === 0) continue;
    const sameDay = hits.find((c) => weekdayOf(c.localDate) === weekdayOf(today.localDate));
    const pick = sameDay ?? hits[0];
    const when = relativePhrase(pick.localDate, today.localDate);
    echoes.push({
      feeling,
      date: pick.localDate,
      sameWeekday: Boolean(sameDay),
      phrase: `You named "${feeling}" ${when} too.`,
    });
  }
  // Same-weekday echoes are the most striking; surface them first.
  return echoes.sort((a, b) => Number(b.sameWeekday) - Number(a.sameWeekday));
}

export function recurringFeelings(
  history: readonly Checkin[],
  today: LocalDate,
  windowDays = 30,
): { feeling: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const c of history) {
    const age = daysBetween(c.localDate, today);
    if (age < 0 || age >= windowDays) continue;
    for (const f of new Set(c.feelings)) counts.set(f, (counts.get(f) ?? 0) + 1);
  }
  return [...counts.entries()]
    .filter(([, n]) => n >= 2)
    .map(([feeling, count]) => ({ feeling, count }))
    .sort((a, b) => b.count - a.count || a.feeling.localeCompare(b.feeling));
}

function mean(xs: number[]): number {
  return xs.reduce((s, x) => s + x, 0) / xs.length;
}

/** "Your mood tends to dip on Mondays" — only when there's enough data to say it honestly. */
export function weekdayMoodPattern(history: readonly Checkin[], minPerDay = 2): string | null {
  const byDay = new Map<number, number[]>();
  for (const c of history) {
    const d = weekdayOf(c.localDate);
    byDay.set(d, [...(byDay.get(d) ?? []), c.mood]);
  }
  const eligible = [...byDay.entries()].filter(([, ms]) => ms.length >= minPerDay);
  if (eligible.length < 3) return null;
  const overall = mean(history.map((c) => c.mood));
  let low: [number, number] | null = null;
  let high: [number, number] | null = null;
  for (const [day, moods] of eligible) {
    const m = mean(moods);
    if (!low || m < low[1]) low = [day, m];
    if (!high || m > high[1]) high = [day, m];
  }
  if (low && overall - low[1] >= 0.75) {
    return `Your mood tends to run lower on ${weekdayName(sampleDateFor(low[0]))}s.`;
  }
  if (high && high[1] - overall >= 0.75) {
    return `${weekdayName(sampleDateFor(high[0]))}s tend to be your brightest days.`;
  }
  return null;
}

function sampleDateFor(weekday: number): LocalDate {
  // 2024-01-07 was a Sunday.
  return addDays('2024-01-07', weekday);
}

/** Compares mood after short vs. full nights. Needs ≥3 of each to say anything. */
export function sleepMoodLink(checkins: readonly Checkin[], health: readonly HealthDay[]): string | null {
  const sleepByDate = new Map(health.filter((h) => h.sleepMinutes).map((h) => [h.localDate, h.sleepMinutes!]));
  const short: number[] = [];
  const full: number[] = [];
  for (const c of checkins) {
    const s = sleepByDate.get(c.localDate);
    if (s == null) continue;
    if (s < 390) short.push(c.mood);
    else if (s >= 420) full.push(c.mood);
  }
  if (short.length < 3 || full.length < 3) return null;
  const diff = mean(full) - mean(short);
  if (diff >= 0.5) return 'On mornings after 7+ hours of sleep, your mood runs noticeably higher.';
  if (diff <= -0.5) return "Interesting: shorter nights haven't been pulling your mood down.";
  return null;
}

export type WeeklyRecap = {
  daysShowedUp: number;
  whatsWorking: string[];
  sleepTrend: string | null;
  hrvTrend: string | null;
};

function avg(xs: (number | null | undefined)[]): number | null {
  const v = xs.filter((x): x is number => typeof x === 'number');
  return v.length ? mean(v) : null;
}

export function weeklyRecap(args: {
  today: LocalDate;
  activityDates: readonly LocalDate[];
  scores: readonly CategoryScore[];
  health: readonly HealthDay[];
}): WeeklyRecap {
  const { today, activityDates, scores, health } = args;
  const inWeek = (d: LocalDate, weeksAgo: number) => {
    const age = daysBetween(d, today);
    return age >= weeksAgo * 7 && age < (weeksAgo + 1) * 7;
  };
  const daysShowedUp = new Set(activityDates.filter((d) => inWeek(d, 0))).size;
  const whatsWorking = scores
    .filter((s) => s.n >= 2 && s.score >= 0.6)
    .slice(0, 3)
    .map((s) => `${CATEGORY_LABEL[s.category]} (helped ${s.helpedCount} of ${s.n})`);

  const thisSleep = avg(health.filter((h) => inWeek(h.localDate, 0)).map((h) => h.sleepMinutes));
  const lastSleep = avg(health.filter((h) => inWeek(h.localDate, 1)).map((h) => h.sleepMinutes));
  let sleepTrend: string | null = null;
  if (thisSleep != null && lastSleep != null && Math.abs(thisSleep - lastSleep) >= 15) {
    const mins = Math.round(Math.abs(thisSleep - lastSleep));
    sleepTrend = `You averaged ${mins} min ${thisSleep > lastSleep ? 'more' : 'less'} sleep than last week.`;
  }

  const thisHrv = avg(health.filter((h) => inWeek(h.localDate, 0)).map((h) => h.hrvMs));
  const lastHrv = avg(health.filter((h) => inWeek(h.localDate, 1)).map((h) => h.hrvMs));
  let hrvTrend: string | null = null;
  if (thisHrv != null && lastHrv != null && lastHrv > 0) {
    const pct = Math.round(((thisHrv - lastHrv) / lastHrv) * 100);
    if (Math.abs(pct) >= 5) hrvTrend = `Your HRV is ${pct > 0 ? 'up' : 'down'} ${Math.abs(pct)}% on last week.`;
  }
  return { daysShowedUp, whatsWorking, sleepTrend, hrvTrend };
}
