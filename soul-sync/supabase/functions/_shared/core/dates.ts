// Local-date helpers. Everything user-facing is keyed by the user's *local*
// calendar date (YYYY-MM-DD), never by UTC, so "today" means the user's today.

export type LocalDate = string; // "YYYY-MM-DD"

export const WEEKDAYS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

/** Local calendar date for `instant` in IANA time zone `timeZone`. */
export function localDate(instant: Date, timeZone: string): LocalDate {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** Local hour (0-23) for `instant` in `timeZone`. */
export function localHour(instant: Date, timeZone: string): number {
  const h = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: 'numeric',
    hourCycle: 'h23',
  }).format(instant);
  return Number(h);
}

function toUtcNoon(d: LocalDate): number {
  const [y, m, day] = d.split('-').map(Number);
  return Date.UTC(y, m - 1, day, 12);
}

export function weekdayOf(d: LocalDate): number {
  return new Date(toUtcNoon(d)).getUTCDay();
}

export function weekdayName(d: LocalDate): string {
  return WEEKDAYS[weekdayOf(d)];
}

/** Whole days from `a` to `b` (positive when b is later). */
export function daysBetween(a: LocalDate, b: LocalDate): number {
  return Math.round((toUtcNoon(b) - toUtcNoon(a)) / 86_400_000);
}

export function addDays(d: LocalDate, n: number): LocalDate {
  return new Date(toUtcNoon(d) + n * 86_400_000).toISOString().slice(0, 10);
}

export function sameMonth(a: LocalDate, b: LocalDate): boolean {
  return a.slice(0, 7) === b.slice(0, 7);
}

const SMALL_NUMBERS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six'];

/** "last Monday", "two Mondays ago", "on March 3" — how a person would say it. */
export function relativePhrase(past: LocalDate, today: LocalDate): string {
  const days = daysBetween(past, today);
  if (days === 0) return 'earlier today';
  if (days === 1) return 'yesterday';
  if (days % 7 === 0 && days / 7 <= 6) {
    const weeks = days / 7;
    const name = weekdayName(past);
    return weeks === 1 ? `last ${name}` : `${SMALL_NUMBERS[weeks]} ${name}s ago`;
  }
  if (days < 7) return `last ${weekdayName(past)}`;
  if (days < 14) return 'about a week ago';
  if (days < 60) return `${Math.round(days / 7)} weeks ago`;
  const [, m, d] = past.split('-').map(Number);
  const month = new Date(Date.UTC(2000, m - 1, 1)).toLocaleString('en-US', {
    month: 'long',
    timeZone: 'UTC',
  });
  return `on ${month} ${d}`;
}
