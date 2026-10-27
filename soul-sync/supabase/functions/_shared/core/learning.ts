// "Did it help?" → what the app learns. A Beta(1,1) prior per action category
// keeps one lucky "yes" from dominating, and the note we generate is shown on
// the next card so the learning is visible to the user.

export const ACTION_CATEGORIES = [
  'movement',
  'rest',
  'breath',
  'reflection',
  'connection',
  'focus',
  'nature',
  'nourish',
  'creative',
] as const;
export type ActionCategory = (typeof ACTION_CATEGORIES)[number];

export type Helped = 'yes' | 'somewhat' | 'no';
export type FeedbackRow = { category: ActionCategory; helped: Helped };

const CREDIT: Record<Helped, number> = { yes: 1, somewhat: 0.5, no: 0 };

export const CATEGORY_LABEL: Record<ActionCategory, string> = {
  movement: 'Movement',
  rest: 'Rest',
  breath: 'Breathwork',
  reflection: 'Reflection',
  connection: 'Connection',
  focus: 'Focus',
  nature: 'Time outside',
  nourish: 'Nourishing',
  creative: 'Creative',
};

export type CategoryScore = {
  category: ActionCategory;
  n: number;
  helpedCount: number; // "yes" answers
  score: number; // posterior mean, 0-1
};

export function categoryScores(feedback: readonly FeedbackRow[]): CategoryScore[] {
  const byCat = new Map<ActionCategory, { n: number; credit: number; yes: number }>();
  for (const f of feedback) {
    const cur = byCat.get(f.category) ?? { n: 0, credit: 0, yes: 0 };
    cur.n += 1;
    cur.credit += CREDIT[f.helped];
    if (f.helped === 'yes') cur.yes += 1;
    byCat.set(f.category, cur);
  }
  return [...byCat.entries()]
    .map(([category, v]) => ({
      category,
      n: v.n,
      helpedCount: v.yes,
      score: (v.credit + 1) / (v.n + 2),
    }))
    .sort((a, b) => b.score - a.score || b.n - a.n);
}

/** One sentence the user will see, e.g. "Breathwork has helped you 3 of 4 times, so today leans that way." */
export function learningNote(scores: readonly CategoryScore[]): string | null {
  const best = scores.find((s) => s.n >= 2 && s.score >= 0.6);
  const worst = [...scores].reverse().find((s) => s.n >= 2 && s.score <= 0.35);
  if (best) {
    return `${CATEGORY_LABEL[best.category]} has helped you ${best.helpedCount} of ${best.n} times, so today leans that way.`;
  }
  if (worst) {
    return `${CATEGORY_LABEL[worst.category]} hasn't been landing for you lately, so we're trying something different.`;
  }
  return null;
}
