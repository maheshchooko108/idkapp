// Checks the in-process Vedic chart (functions/_shared/vedic.ts) against 400
// reference charts computed with Swiss Ephemeris by soul-sync/astro.
// Run: deno test --allow-read supabase/tests/vedic.test.ts
import { assert, assertEquals } from 'jsr:@std/assert@1';

import { birthToUtcMs, computeChart, nakshatraOf, signOf, type ChartInput } from '../functions/_shared/vedic.ts';

type Fixture = {
  input: ChartInput;
  birth_utc_ms: number;
  planets: Record<string, number>;
  asc: number | null;
  dasha: { mahadasha: string; mahadasha_ends: string; antardasha: string; antardasha_ends: string };
  today: { moon_sign: string; moon_nakshatra: string; moon_house_from_natal_moon: number; saturn_house_from_natal_moon: number };
};

const cases: Fixture[] = JSON.parse(await Deno.readTextFile(new URL('./vedic_fixtures.json', import.meta.url)));
const angle = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180);
const days = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) / 86_400_000;
const nearBoundary = (lon: number, span: number, tol: number) => {
  const r = ((lon % span) + span) % span;
  return r < tol || span - r < tol;
};

// Deno's ICU and Python's tzdata disagree only on Trinidad's WWII clocks.
const tzDisagreements = cases.filter((c) =>
  Math.abs(birthToUtcMs(c.input.birth_date, c.input.birth_time, c.input.tz) - c.birth_utc_ms) > 30_000
);
const comparable = cases.filter((c) => !tzDisagreements.includes(c));

Deno.test('birth time zones agree with Python zoneinfo except known historical records', () => {
  assert(tzDisagreements.length <= 2, `${tzDisagreements.length} time-zone disagreements`);
  for (const c of tzDisagreements) {
    assertEquals(c.input.tz, 'America/Port_of_Spain');
    assert(c.input.birth_date < '1946-01-01', c.input.birth_date);
  }
});

Deno.test('planet and ascendant longitudes match Swiss Ephemeris within 0.01°', () => {
  for (const c of comparable) {
    const got = computeChart(c.input);
    for (const [p, lon] of Object.entries(c.planets)) {
      const d = angle(got.planets[p].longitude, lon);
      assert(d < 0.01, `${p} off by ${d}° for ${JSON.stringify(c.input)}`);
      // Sign and nakshatra must match unless the body sits right on a cusp.
      if (!nearBoundary(lon, 30, 0.01)) assertEquals(got.planets[p].sign, signOf(lon), p);
      if (!nearBoundary(lon, 360 / 27, 0.01)) assertEquals(got.planets[p].nakshatra, nakshatraOf(lon)[0], p);
    }
    if (c.asc != null) {
      const d = angle(got.ascendant!.longitude, c.asc);
      assert(d < 0.02, `ascendant off by ${d}° for ${JSON.stringify(c.input)}`);
    } else {
      assertEquals(got.ascendant, null);
    }
  }
});

Deno.test('dasha periods match, with end dates within 2 days', () => {
  let handovers = 0;
  for (const c of comparable) {
    const got = computeChart(c.input).dasha;
    // On the handover day itself, a few arcseconds can tip which sub-period is current.
    if (days(c.dasha.antardasha_ends, c.input.on_date) <= 2 && got.antardasha !== c.dasha.antardasha) {
      handovers++;
      continue;
    }
    assertEquals(got.mahadasha, c.dasha.mahadasha, JSON.stringify(c.input));
    assertEquals(got.antardasha, c.dasha.antardasha, JSON.stringify(c.input));
    assert(days(got.mahadasha_ends, c.dasha.mahadasha_ends) <= 2, `mahadasha end ${got.mahadasha_ends} vs ${c.dasha.mahadasha_ends}`);
    assert(days(got.antardasha_ends, c.dasha.antardasha_ends) <= 2, `antardasha end ${got.antardasha_ends} vs ${c.dasha.antardasha_ends}`);
  }
  assert(handovers <= 2, `${handovers} handover-day differences`);
});

Deno.test("today's transits match", () => {
  for (const c of comparable) {
    const got = computeChart(c.input).today;
    assertEquals(got.moon_house_from_natal_moon, c.today.moon_house_from_natal_moon, JSON.stringify(c.input));
    assertEquals(got.saturn_house_from_natal_moon, c.today.saturn_house_from_natal_moon, JSON.stringify(c.input));
    assertEquals(got.moon_sign, c.today.moon_sign);
    assertEquals(got.moon_nakshatra, c.today.moon_nakshatra);
  }
});

Deno.test('unknown birth time: noon local, no ascendant', () => {
  const chart = computeChart({ birth_date: '1990-06-15', birth_time: null, tz: 'UTC', lat: 0, lon: 0, on_date: '2026-10-29' });
  assertEquals(chart.ascendant, null);
  assertEquals(chart.birth_time_known, false);
  assertEquals(birthToUtcMs('1990-06-15', null, 'UTC'), Date.UTC(1990, 5, 15, 12));
});
