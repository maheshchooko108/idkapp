// WHO-5 Well-Being Index (WHO, 1998). Free to use; keep wording verbatim.
// Topp et al. (2015), Psychother Psychosom 84:167-176, for cut-offs below.

export const WHO5_INTRO = 'Over the last two weeks…';

export const WHO5_ITEMS = [
  'I have felt cheerful and in good spirits',
  'I have felt calm and relaxed',
  'I have felt active and vigorous',
  'I woke up feeling fresh and rested',
  'My daily life has been filled with things that interest me',
] as const;

/** Index = points. */
export const WHO5_OPTIONS = [
  'At no time',
  'Some of the time',
  'Less than half of the time',
  'More than half of the time',
  'Most of the time',
  'All of the time',
] as const;

/**
 * The brief asks for weekly. Note WHO-5 asks about "the last two weeks", so
 * weekly answers overlap; 14 is the purist choice if the pilot can afford it.
 */
export const WHO5_RECHECK_DAYS = 7;

/** A change of 10 percentage points is the accepted clinically relevant change. */
export const WHO5_MEANINGFUL_CHANGE = 10;

export type Who5Score = {
  raw: number; // 0-25
  percent: number; // 0-100
  band: 'good' | 'low' | 'very_low';
};

export function scoreWho5(answers: readonly number[]): Who5Score {
  if (answers.length !== 5 || answers.some((a) => !Number.isInteger(a) || a < 0 || a > 5)) {
    throw new Error('WHO-5 needs exactly five integer answers between 0 and 5');
  }
  const raw = answers.reduce((s, a) => s + a, 0);
  const percent = raw * 4;
  // ≤50 suggests poor well-being; ≤28 is the common screen for likely depression.
  const band = percent <= 28 ? 'very_low' : percent <= 50 ? 'low' : 'good';
  return { raw, percent, band };
}

export type Who5Change = { delta: number; meaningful: boolean; direction: 'up' | 'down' | 'flat' };

export function who5Change(baselinePercent: number, latestPercent: number): Who5Change {
  const delta = latestPercent - baselinePercent;
  return {
    delta,
    meaningful: Math.abs(delta) >= WHO5_MEANINGFUL_CHANGE,
    direction: delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat',
  };
}

/** Shown after scoring. Never diagnostic; very low scores get a gentle nudge to talk to someone. */
export function who5Message(score: Who5Score): string {
  switch (score.band) {
    case 'good':
      return 'Thanks for checking in. This becomes your baseline, so we can show you real change over time.';
    case 'low':
      return 'Thanks for being honest. This becomes your baseline. Small, steady actions are exactly what this app is for.';
    case 'very_low':
      return (
        'Thanks for being honest. Your answers suggest things have been hard lately. ' +
        'This app can support you day to day, but it is not a substitute for care: talking with a doctor ' +
        'or counselor about how you have been feeling is a strong next step.'
      );
  }
}
