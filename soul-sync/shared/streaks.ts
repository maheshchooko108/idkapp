// Kind streaks: we count the days someone showed up this month. No chains,
// nothing to break, no loss language. Rest days are simply not counted.

import { type LocalDate, sameMonth } from './dates.ts';

export function daysShowedUpThisMonth(activityDates: readonly LocalDate[], today: LocalDate): number {
  return new Set(activityDates.filter((d) => sameMonth(d, today) && d <= today)).size;
}

export function showedUpMessage(days: number): string {
  if (days === 0) return 'A fresh month. Show up whenever it serves you.';
  if (days === 1) return 'You showed up 1 day this month.';
  return `You showed up ${days} days this month.`;
}
