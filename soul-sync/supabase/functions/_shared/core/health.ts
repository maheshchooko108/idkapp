// Platform-neutral reduction of raw wearable samples into one row per local day.
// HealthKit and Health Connect both hand us overlapping samples (phone + watch
// + ring), so sleep is merged as intervals rather than summed.

import { type LocalDate, localDate } from './dates.ts';

export type Interval = { start: Date; end: Date };
export type Reading = { at: Date; value: number };

/** Merge overlapping asleep intervals, then attribute each night to the local date you woke up on. */
export function sleepMinutesByWakeDate(asleep: readonly Interval[], timeZone: string): Map<LocalDate, number> {
  const sorted = asleep
    .filter((i) => i.end > i.start)
    .map((i) => ({ start: i.start.getTime(), end: i.end.getTime() }))
    .sort((a, b) => a.start - b.start);
  const merged: { start: number; end: number }[] = [];
  for (const i of sorted) {
    const last = merged[merged.length - 1];
    if (last && i.start <= last.end) last.end = Math.max(last.end, i.end);
    else merged.push({ ...i });
  }
  // Daytime naps also count toward the day they end on; simple and honest for a daily card.
  const out = new Map<LocalDate, number>();
  for (const m of merged) {
    const day = localDate(new Date(m.end), timeZone);
    out.set(day, (out.get(day) ?? 0) + Math.round((m.end - m.start) / 60_000));
  }
  return out;
}

export function dailyAverage(readings: readonly Reading[], timeZone: string): Map<LocalDate, number> {
  const acc = new Map<LocalDate, { sum: number; n: number }>();
  for (const r of readings) {
    const d = localDate(r.at, timeZone);
    const cur = acc.get(d) ?? { sum: 0, n: 0 };
    cur.sum += r.value;
    cur.n += 1;
    acc.set(d, cur);
  }
  return new Map([...acc].map(([d, { sum, n }]) => [d, sum / n]));
}

export type HealthRow = {
  local_date: LocalDate;
  sleep_minutes: number | null;
  hrv_ms: number | null;
  hrv_method: 'sdnn' | 'rmssd' | null;
  resting_hr: number | null;
  steps: number | null;
  source: string;
};

export function toHealthRows(args: {
  sleep: Map<LocalDate, number>;
  hrv: Map<LocalDate, number>;
  hrvMethod: 'sdnn' | 'rmssd';
  restingHr: Map<LocalDate, number>;
  steps: Map<LocalDate, number>;
  source: string;
}): HealthRow[] {
  const days = new Set([...args.sleep.keys(), ...args.hrv.keys(), ...args.restingHr.keys(), ...args.steps.keys()]);
  return [...days].sort().map((d) => ({
    local_date: d,
    sleep_minutes: args.sleep.get(d) ?? null,
    hrv_ms: args.hrv.has(d) ? Math.round(args.hrv.get(d)! * 10) / 10 : null,
    hrv_method: args.hrv.has(d) ? args.hrvMethod : null,
    resting_hr: args.restingHr.has(d) ? Math.round(args.restingHr.get(d)!) : null,
    steps: args.steps.has(d) ? Math.round(args.steps.get(d)!) : null,
    source: args.source,
  }));
}
