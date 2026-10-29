// Sidereal (Vedic) chart, Vimshottari dasha and daily transits, computed
// in-process with astronomy-engine (MIT, pure TypeScript). A line-for-line
// port of soul-sync/astro/vedic.py, so the card engine needs no separate
// service; supabase/tests/vedic.test.ts checks it against Swiss Ephemeris.
//
// Conventions match the Python service:
// - Zodiac: sidereal, Lahiri ayanamsa (reproduces Swiss Ephemeris' value
//   to < 0.1 arcsec over 1900-2100).
// - Nodes: mean node for Rahu; Ketu = Rahu + 180°.
// - Houses: whole-sign from the ascendant sign.
// - Dasha year: 365.25 days.

import * as Astronomy from 'npm:astronomy-engine@2.1.19';

export const SIGNS = [
  'Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo',
  'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces',
];

export const NAKSHATRAS = [
  'Ashwini', 'Bharani', 'Krittika', 'Rohini', 'Mrigashira', 'Ardra', 'Punarvasu',
  'Pushya', 'Ashlesha', 'Magha', 'Purva Phalguni', 'Uttara Phalguni', 'Hasta',
  'Chitra', 'Swati', 'Vishakha', 'Anuradha', 'Jyeshtha', 'Mula', 'Purva Ashadha',
  'Uttara Ashadha', 'Shravana', 'Dhanishta', 'Shatabhisha', 'Purva Bhadrapada',
  'Uttara Bhadrapada', 'Revati',
];

const DASHA_ORDER = ['Ketu', 'Venus', 'Sun', 'Moon', 'Mars', 'Rahu', 'Jupiter', 'Saturn', 'Mercury'];
const DASHA_YEARS: Record<string, number> = {
  Ketu: 7, Venus: 20, Sun: 6, Moon: 10, Mars: 7, Rahu: 18, Jupiter: 16, Saturn: 19, Mercury: 17,
};
const YEAR_DAYS = 365.25;
const DAY_MS = 86_400_000;
const NAK_SPAN = 360 / 27;

// Plain-language themes; kept identical to the Python service.
const MOON_HOUSE_THEMES: Record<number, string> = {
  1: 'Feelings sit close to the surface today; tending to yourself comes first.',
  2: 'A good day to tend to nourishment and what sustains you.',
  3: 'Courage and honest conversation come a little easier today.',
  4: 'Home and inner comfort are calling; softness is productive.',
  5: 'Creativity and play are well supported today.',
  6: 'Small routines and health habits land well today.',
  7: 'Connection with others is highlighted today.',
  8: 'A quieter, more inward day; go gently and keep plans light.',
  9: 'Perspective and meaning come easier; a good day to learn or reflect.',
  10: 'Focused, visible effort is well supported today.',
  11: 'Friends and community can lift you today.',
  12: 'Rest and release serve you; a lighter schedule is wise.',
};

const DASHA_THEMES: Record<string, string> = {
  Sun: 'identity, purpose and visibility',
  Moon: 'emotional needs, home and nurture',
  Mars: 'drive, courage and decisive action',
  Mercury: 'learning, communication and adaptability',
  Jupiter: 'growth, wisdom and meaning',
  Venus: 'relationships, beauty and enjoyment',
  Saturn: 'patience, structure and long-term building',
  Rahu: 'ambition and stepping into the unfamiliar',
  Ketu: 'letting go and inner work',
};

const norm = (x: number) => ((x % 360) + 360) % 360;
const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

// Swiss Ephemeris' Lahiri value at J2000.0 (UT), carried forward with IAU 2006
// general precession in longitude.
const LAHIRI_J2000 = 23.857092353708822;
export function lahiriAyanamsa(t: Astronomy.AstroTime): number {
  const T = t.tt / 36525;
  return LAHIRI_J2000 + (5028.796195 * T + 1.1054348 * T * T) / 3600;
}

/** Mean lunar node, tropical of date (Meeus, Astronomical Algorithms 47.7). */
function meanNode(t: Astronomy.AstroTime): number {
  const T = t.tt / 36525;
  return norm(125.0445479 - 1934.1362891 * T + 0.0020754 * T * T + (T * T * T) / 467441 - (T ** 4) / 60616000);
}

/**
 * Tropical longitude against the *mean* equinox of date. astronomy-engine
 * returns true-of-date positions, so nutation in longitude is removed to
 * match Swiss Ephemeris' sidereal mode (and the Python service).
 */
function tropicalLongitude(body: string, t: Astronomy.AstroTime): number {
  if (body === 'Rahu') return meanNode(t);
  const nutation = Astronomy.e_tilt(t).dpsi / 3600;
  if (body === 'Moon') return norm(Astronomy.EclipticGeoMoon(t).lon - nutation);
  const b = Astronomy.Body[body as keyof typeof Astronomy.Body];
  return norm(Astronomy.Ecliptic(Astronomy.GeoVector(b, t, true)).elon - nutation);
}

export function siderealLongitude(body: string, t: Astronomy.AstroTime): number {
  return norm(tropicalLongitude(body, t) - lahiriAyanamsa(t));
}

/** Tropical ascendant from Greenwich apparent sidereal time and true obliquity. */
function tropicalAscendant(t: Astronomy.AstroTime, lat: number, lon: number): number {
  const ramc = rad(norm(Astronomy.SiderealTime(t) * 15 + lon));
  const eps = rad(Astronomy.e_tilt(t).tobl);
  const asc = Math.atan2(Math.cos(ramc), -(Math.sin(ramc) * Math.cos(eps) + Math.tan(rad(lat)) * Math.sin(eps)));
  return norm(deg(asc));
}

export const signOf = (lon: number) => SIGNS[Math.floor(lon / 30)];

export function nakshatraOf(lon: number): [string, number] {
  const idx = Math.floor(lon / NAK_SPAN);
  const pada = Math.floor((lon % NAK_SPAN) / (NAK_SPAN / 4)) + 1;
  return [NAKSHATRAS[idx], pada];
}

type Period = { lord: string; start: number; end: number }; // epoch ms

export function mahadashas(moonLon: number, birthMs: number, count = 9): Period[] {
  const nakIdx = Math.floor(moonLon / NAK_SPAN);
  const elapsedFrac = (moonLon % NAK_SPAN) / NAK_SPAN;
  const first = DASHA_ORDER[nakIdx % 9];
  // The first dasha began before birth; back-date it by the elapsed fraction.
  let start = birthMs - elapsedFrac * DASHA_YEARS[first] * YEAR_DAYS * DAY_MS;
  let i = DASHA_ORDER.indexOf(first);
  const out: Period[] = [];
  for (let k = 0; k < count; k++) {
    const lord = DASHA_ORDER[i % 9];
    const end = start + DASHA_YEARS[lord] * YEAR_DAYS * DAY_MS;
    out.push({ lord, start, end });
    start = end;
    i++;
  }
  return out;
}

export function antardashas(maha: Period): Period[] {
  const total = maha.end - maha.start;
  const i = DASHA_ORDER.indexOf(maha.lord);
  let start = maha.start;
  const out: Period[] = [];
  for (let k = 0; k < 9; k++) {
    const lord = DASHA_ORDER[(i + k) % 9];
    const end = start + (total * DASHA_YEARS[lord]) / 120;
    out.push({ lord, start, end });
    start = end;
  }
  return out;
}

export function currentDasha(moonLon: number, birthMs: number, atMs: number): [Period, Period] {
  for (const maha of mahadashas(moonLon, birthMs, 18)) {
    if (maha.start <= atMs && atMs < maha.end) {
      for (const antar of antardashas(maha)) {
        if (antar.start <= atMs && atMs < antar.end) return [maha, antar];
      }
    }
  }
  throw new Error('date outside the computed dasha range');
}

/** Offset of an IANA zone from UTC, in ms, at a given instant. */
function zoneOffsetMs(tz: string, atMs: number): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(atMs));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return asUtc - Math.floor(atMs / 1000) * 1000;
}

/** Local wall-clock birth time in an IANA zone → UTC epoch ms. Unknown time → local noon. */
export function birthToUtcMs(birthDate: string, birthTime: string | null, tz: string): number {
  const [y, m, d] = birthDate.split('-').map(Number);
  const [hh, mm, ss] = (birthTime ?? '12:00').split(':').map(Number);
  const wall = Date.UTC(y, m - 1, d, hh, mm || 0, ss || 0);
  // Two passes settle the offset across DST changes.
  let utc = wall - zoneOffsetMs(tz, wall);
  utc = wall - zoneOffsetMs(tz, utc);
  return utc;
}

const isoDate = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const round4 = (x: number) => Math.round(x * 1e4) / 1e4;

export type ChartInput = {
  birth_date: string; // YYYY-MM-DD
  birth_time: string | null; // HH:MM[:SS] local, or null if unknown
  tz: string; // IANA zone of the birthplace
  lat: number;
  lon: number;
  on_date: string; // YYYY-MM-DD for dasha and transits
};

export function computeChart(input: ChartInput) {
  const birthMs = birthToUtcMs(input.birth_date, input.birth_time, input.tz);
  const t = Astronomy.MakeTime(new Date(birthMs));

  const planets: Record<string, { longitude: number; sign: string; nakshatra: string; pada: number }> = {};
  for (const name of ['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn', 'Rahu']) {
    const lng = siderealLongitude(name, t);
    const [nak, pada] = nakshatraOf(lng);
    planets[name] = { longitude: round4(lng), sign: signOf(lng), nakshatra: nak, pada };
  }
  const ketu = norm(planets.Rahu.longitude + 180);
  const [kNak, kPada] = nakshatraOf(ketu);
  planets.Ketu = { longitude: round4(ketu), sign: signOf(ketu), nakshatra: kNak, pada: kPada };

  let ascendant: { longitude: number; sign: string } | null = null;
  if (input.birth_time) {
    const asc = norm(tropicalAscendant(t, input.lat, input.lon) - lahiriAyanamsa(t));
    ascendant = { longitude: round4(asc), sign: signOf(asc) };
  }

  // Dasha timing uses the stored (4-decimal) Moon, exactly as the Python service does.
  const moonLon = planets.Moon.longitude;
  // Transits are taken at 12:00 UTC on on_date.
  const atMs = Date.parse(`${input.on_date}T12:00:00Z`);
  const [maha, antar] = currentDasha(moonLon, birthMs, atMs);

  const tToday = Astronomy.MakeTime(new Date(atMs));
  const moonToday = siderealLongitude('Moon', tToday);
  const saturnToday = siderealLongitude('Saturn', tToday);
  const natalMoonSign = Math.floor(moonLon / 30);
  const moonHouse = ((Math.floor(moonToday / 30) - natalMoonSign + 12) % 12) + 1;
  const saturnHouse = ((Math.floor(saturnToday / 30) - natalMoonSign + 12) % 12) + 1;

  const themes = [
    MOON_HOUSE_THEMES[moonHouse],
    `Your current chapter (${maha.lord}–${antar.lord}) is about ${DASHA_THEMES[maha.lord]}, colored by ${DASHA_THEMES[antar.lord]}.`,
  ];
  if ([12, 1, 2].includes(saturnHouse)) {
    themes.push(
      'Saturn is moving through a slow, building stretch for you (Sade Sati): simple, steady routines serve you best.',
    );
  }

  return {
    conventions: { ayanamsa: 'Lahiri', nodes: 'mean', houses: 'whole sign', dasha_year_days: YEAR_DAYS, engine: 'astronomy-engine' },
    birth_time_known: input.birth_time != null,
    planets,
    ascendant,
    natal_moon: { sign: planets.Moon.sign, nakshatra: planets.Moon.nakshatra },
    dasha: {
      mahadasha: maha.lord,
      mahadasha_ends: isoDate(maha.end),
      antardasha: antar.lord,
      antardasha_ends: isoDate(antar.end),
    },
    today: {
      date: input.on_date,
      moon_sign: signOf(moonToday),
      moon_nakshatra: nakshatraOf(moonToday)[0],
      moon_house_from_natal_moon: moonHouse,
      saturn_house_from_natal_moon: saturnHouse,
    },
    themes,
  };
}
