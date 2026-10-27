import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { screenForCrisis } from '../crisis.ts';
import { scoreWho5, who5Change } from '../who5.ts';
import { daysShowedUpThisMonth, showedUpMessage } from '../streaks.ts';
import { categoryScores, learningNote } from '../learning.ts';
import { findEchoes, recurringFeelings, sleepMoodLink, weekdayMoodPattern, weeklyRecap, type Checkin } from '../patterns.ts';
import { relativePhrase, localDate, daysBetween } from '../dates.ts';
import { DEFAULT_ENGINE_PROMPT, fallbackCard, renderContext, renderTemplate, validateCard, type EngineContext } from '../card.ts';

test('crisis screen flags self-harm language, including Spanish and negations', () => {
  for (const t of [
    'honestly I want to die',
    "i've been thinking about suicide",
    'I keep wanting to hurt myself',
    "everyone's better off without me",
    "I'm not suicidal, just tired", // intentionally over-inclusive
    'a veces quiero morir',
    'kms lol',
  ]) {
    assert.equal(screenForCrisis(t).flagged, true, t);
  }
});

test('crisis screen ignores everyday hyperbole', () => {
  for (const t of [
    'this workout is killing me',
    'I could die for some tacos',
    'deadline is today and I feel dead tired',
    'feeling restless but hopeful',
    '',
  ]) {
    assert.equal(screenForCrisis(t).flagged, false, t);
  }
});

test('WHO-5 scoring and bands', () => {
  assert.deepEqual(scoreWho5([5, 5, 5, 5, 5]), { raw: 25, percent: 100, band: 'good' });
  assert.equal(scoreWho5([3, 3, 3, 3, 1]).band, 'good'); // 52%: just above the ≤50 line
  assert.equal(scoreWho5([2, 2, 2, 3, 3]).percent, 48);
  assert.equal(scoreWho5([2, 2, 2, 3, 3]).band, 'low');
  assert.equal(scoreWho5([1, 1, 1, 2, 2]).band, 'very_low');
  assert.throws(() => scoreWho5([1, 2, 3]));
  assert.throws(() => scoreWho5([1, 2, 3, 4, 6]));
  assert.deepEqual(who5Change(40, 52), { delta: 12, meaningful: true, direction: 'up' });
  assert.equal(who5Change(40, 44).meaningful, false);
});

test('kind streaks count distinct days this month only', () => {
  const days = ['2026-10-01', '2026-10-01', '2026-10-05', '2026-09-30', '2026-10-27'];
  assert.equal(daysShowedUpThisMonth(days, '2026-10-26'), 2);
  assert.equal(showedUpMessage(0).includes('fresh'), true);
  assert.doesNotMatch(showedUpMessage(3), /lost|break|miss/i);
});

test('relative phrases read naturally', () => {
  assert.equal(relativePhrase('2026-10-12', '2026-10-26'), 'two Mondays ago');
  assert.equal(relativePhrase('2026-10-19', '2026-10-26'), 'last Monday');
  assert.equal(relativePhrase('2026-10-25', '2026-10-26'), 'yesterday');
  assert.equal(daysBetween('2026-10-01', '2026-11-01'), 31);
});

test('localDate respects the user time zone, not UTC', () => {
  const instant = new Date('2026-10-27T02:30:00Z');
  assert.equal(localDate(instant, 'America/New_York'), '2026-10-26');
  assert.equal(localDate(instant, 'Asia/Kolkata'), '2026-10-27');
});

const ck = (localDate: string, feelings: string[], mood = 3): Checkin => ({ localDate, mood, energy: 3, feelings });

test('echoes prefer the same weekday ("two Mondays ago")', () => {
  const history = [ck('2026-10-12', ['restless']), ck('2026-10-22', ['restless']), ck('2026-10-20', ['hopeful'])];
  const echoes = findEchoes(ck('2026-10-26', ['restless', 'hopeful', 'new']), history);
  assert.equal(echoes[0].phrase, 'You named "restless" two Mondays ago too.');
  assert.equal(echoes[0].sameWeekday, true);
  assert.equal(echoes.find((e) => e.feeling === 'hopeful')?.sameWeekday, false);
  assert.equal(echoes.some((e) => e.feeling === 'new'), false);
});

test('recurring feelings and weekday/sleep patterns need enough data', () => {
  const history = [ck('2026-10-01', ['tired']), ck('2026-10-02', ['tired', 'calm']), ck('2026-10-03', ['calm'])];
  assert.deepEqual(recurringFeelings(history, '2026-10-26').map((r) => r.feeling), ['calm', 'tired']);
  assert.equal(weekdayMoodPattern(history), null);

  const many: Checkin[] = [];
  for (let w = 0; w < 3; w++) {
    many.push(ck(`2026-09-${String(7 + w * 7).padStart(2, '0')}`, [], 1)); // Mondays low
    many.push(ck(`2026-09-${String(8 + w * 7).padStart(2, '0')}`, [], 4));
    many.push(ck(`2026-09-${String(9 + w * 7).padStart(2, '0')}`, [], 4));
  }
  assert.equal(weekdayMoodPattern(many), 'Your mood tends to run lower on Mondays.');

  const health = many.map((c) => ({ localDate: c.localDate, sleepMinutes: c.mood === 1 ? 330 : 460 }));
  assert.match(sleepMoodLink(many, health) ?? '', /7\+ hours/);
});

test('learning: helped categories rise and become a visible note', () => {
  const scores = categoryScores([
    { category: 'breath', helped: 'yes' },
    { category: 'breath', helped: 'yes' },
    { category: 'breath', helped: 'yes' },
    { category: 'breath', helped: 'no' },
    { category: 'movement', helped: 'no' },
    { category: 'movement', helped: 'no' },
  ]);
  assert.equal(scores[0].category, 'breath');
  assert.equal(learningNote(scores), 'Breathwork has helped you 3 of 4 times, so today leans that way.');
  assert.match(learningNote(scores.filter((s) => s.category === 'movement')) ?? '', /hasn't been landing/);
  assert.equal(learningNote(categoryScores([{ category: 'rest', helped: 'yes' }])), null); // n=1 is not a pattern
});

test('weekly recap', () => {
  const recap = weeklyRecap({
    today: '2026-10-26',
    activityDates: ['2026-10-26', '2026-10-25', '2026-10-24', '2026-10-15'],
    scores: categoryScores([
      { category: 'nature', helped: 'yes' },
      { category: 'nature', helped: 'yes' },
    ]),
    health: [
      { localDate: '2026-10-25', sleepMinutes: 450, hrvMs: 55 },
      { localDate: '2026-10-18', sleepMinutes: 400, hrvMs: 50 },
    ],
  });
  assert.equal(recap.daysShowedUp, 3);
  assert.deepEqual(recap.whatsWorking, ['Time outside (helped 2 of 2)']);
  assert.equal(recap.sleepTrend, 'You averaged 50 min more sleep than last week.');
  assert.equal(recap.hrvTrend, 'Your HRV is up 10% on last week.');
});

const ctx: EngineContext = {
  mode: 'light',
  localDate: '2026-10-26',
  weekday: 'Monday',
  checkin: { mood: 2, energy: 2, feelings: ['restless'], note: 'big week ahead' },
  body: { sleepMinutes: 350, sleepVsBaseline: -60, hrvMs: 42, hrvVsBaselinePct: -12, steps: 4200 },
  timing: null,
  echoes: ['You named "restless" two Mondays ago too.'],
  recurringFeelings: ['restless'],
  learningNote: null,
  bestCategories: ['breath'],
  avoidCategories: ['movement'],
  recentActions: [],
};

test('context rendering includes the user’s own words and history', () => {
  const s = renderContext(ctx);
  assert.match(s, /"big week ahead"/);
  assert.match(s, /two Mondays ago/);
  assert.match(s, /slept 5h50 \(60 min less than their usual\)/);
  assert.match(s, /below their baseline by 12%/);
});

test('fallback card is gentle on low sleep and respects avoided categories', () => {
  const card = fallbackCard(ctx);
  assert.equal(card.headline, 'A slow start serves you today');
  assert.equal(card.action.category, 'rest');
  assert.equal(card.alternatives.length, 2);
  assert.ok(card.alternatives.every((a) => a.category !== 'movement'));
  assert.ok(validateCard(card));
});

test('validateCard rejects malformed model output', () => {
  assert.equal(validateCard(null), null);
  assert.equal(validateCard({ headline: 'x' }), null);
  const good = fallbackCard(ctx);
  assert.equal(validateCard({ ...good, action: { ...good.action, category: 'astral-projection' } }), null);
  assert.equal(validateCard({ ...good, action: { ...good.action, minutes: 600 } }), null);
});

test('renderTemplate fills known vars only', () => {
  assert.equal(renderTemplate('Hi {{ name }} {{other}}', { name: 'Ana' }), 'Hi Ana {{other}}');
});

test('the migration seeds the same default engine prompt the code ships with', () => {
  const sql = readFileSync(new URL('../../supabase/migrations/0001_init.sql', import.meta.url), 'utf8');
  assert.ok(sql.includes(DEFAULT_ENGINE_PROMPT), 'update the seed in 0001_init.sql when changing DEFAULT_ENGINE_PROMPT');
});

test('edge-function copies of shared modules are in sync', () => {
  for (const f of ['card.ts', 'crisis.ts', 'dates.ts', 'health.ts', 'learning.ts', 'patterns.ts', 'streaks.ts', 'who5.ts']) {
    const a = readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
    const b = readFileSync(new URL(`../../supabase/functions/_shared/core/${f}`, import.meta.url), 'utf8');
    assert.equal(a, b, `run scripts/sync-shared.sh (${f} drifted)`);
  }
});

import { dailyAverage, sleepMinutesByWakeDate, toHealthRows } from '../health.ts';

test('sleep merges overlapping phone+watch intervals and keys by wake date', () => {
  const tz = 'America/New_York';
  const sleep = sleepMinutesByWakeDate(
    [
      { start: new Date('2026-10-26T03:00:00Z'), end: new Date('2026-10-26T10:00:00Z') }, // 23:00-06:00 local, watch
      { start: new Date('2026-10-26T04:00:00Z'), end: new Date('2026-10-26T11:00:00Z') }, // phone, overlapping
      { start: new Date('2026-10-26T18:00:00Z'), end: new Date('2026-10-26T18:30:00Z') }, // nap
    ],
    tz,
  );
  assert.equal(sleep.get('2026-10-26'), 8 * 60 + 30);
  const hrv = dailyAverage([{ at: new Date('2026-10-26T12:00:00Z'), value: 40 }, { at: new Date('2026-10-26T13:00:00Z'), value: 50 }], tz);
  const rows = toHealthRows({ sleep, hrv, hrvMethod: 'sdnn', restingHr: new Map(), steps: new Map([['2026-10-25', 8123.4]]), source: 'healthkit' });
  assert.deepEqual(rows.map((r) => r.local_date), ['2026-10-25', '2026-10-26']);
  assert.equal(rows[1].hrv_ms, 45);
  assert.equal(rows[1].hrv_method, 'sdnn');
  assert.equal(rows[0].steps, 8123);
  assert.equal(rows[0].hrv_method, null);
});
