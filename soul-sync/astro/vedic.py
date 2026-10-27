"""Sidereal (Vedic) chart, Vimshottari dasha and daily transits via Swiss Ephemeris.

Conventions (state them, because astrologers will ask):
- Zodiac: sidereal, Lahiri (Chitrapaksha) ayanamsa.
- Nodes: mean node for Rahu; Ketu = Rahu + 180°.
- Houses: whole-sign from the ascendant sign.
- Dasha year: 365.25 days.
- Ephemeris: Swiss Ephemeris' built-in Moshier model (no data files needed,
  ~1 arcsecond for planets). Drop the Swiss .se1 files in SE_EPHE_PATH to use
  the full JPL-derived ephemeris instead.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

import swisseph as swe

SIGNS = [
    "Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo",
    "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces",
]

NAKSHATRAS = [
    "Ashwini", "Bharani", "Krittika", "Rohini", "Mrigashira", "Ardra", "Punarvasu",
    "Pushya", "Ashlesha", "Magha", "Purva Phalguni", "Uttara Phalguni", "Hasta",
    "Chitra", "Swati", "Vishakha", "Anuradha", "Jyeshtha", "Mula", "Purva Ashadha",
    "Uttara Ashadha", "Shravana", "Dhanishta", "Shatabhisha", "Purva Bhadrapada",
    "Uttara Bhadrapada", "Revati",
]

# Vimshottari: lord order starting from Ashwini, and years per lord (sum 120).
DASHA_ORDER = ["Ketu", "Venus", "Sun", "Moon", "Mars", "Rahu", "Jupiter", "Saturn", "Mercury"]
DASHA_YEARS = {"Ketu": 7, "Venus": 20, "Sun": 6, "Moon": 10, "Mars": 7,
               "Rahu": 18, "Jupiter": 16, "Saturn": 19, "Mercury": 17}
YEAR_DAYS = 365.25
NAK_SPAN = 360 / 27

PLANETS = {
    "Sun": swe.SUN, "Moon": swe.MOON, "Mars": swe.MARS, "Mercury": swe.MERCURY,
    "Jupiter": swe.JUPITER, "Venus": swe.VENUS, "Saturn": swe.SATURN, "Rahu": swe.MEAN_NODE,
}

# Plain-language themes. Deliberately gentle and non-predictive: the app uses
# astrology as a reflective lens, never as a forecast.
MOON_HOUSE_THEMES = {
    1: "Feelings sit close to the surface today; tending to yourself comes first.",
    2: "A good day to tend to nourishment and what sustains you.",
    3: "Courage and honest conversation come a little easier today.",
    4: "Home and inner comfort are calling; softness is productive.",
    5: "Creativity and play are well supported today.",
    6: "Small routines and health habits land well today.",
    7: "Connection with others is highlighted today.",
    8: "A quieter, more inward day; go gently and keep plans light.",
    9: "Perspective and meaning come easier; a good day to learn or reflect.",
    10: "Focused, visible effort is well supported today.",
    11: "Friends and community can lift you today.",
    12: "Rest and release serve you; a lighter schedule is wise.",
}

DASHA_THEMES = {
    "Sun": "identity, purpose and visibility",
    "Moon": "emotional needs, home and nurture",
    "Mars": "drive, courage and decisive action",
    "Mercury": "learning, communication and adaptability",
    "Jupiter": "growth, wisdom and meaning",
    "Venus": "relationships, beauty and enjoyment",
    "Saturn": "patience, structure and long-term building",
    "Rahu": "ambition and stepping into the unfamiliar",
    "Ketu": "letting go and inner work",
}

swe.set_sid_mode(swe.SIDM_LAHIRI)
if os.environ.get("SE_EPHE_PATH"):
    swe.set_ephe_path(os.environ["SE_EPHE_PATH"])
    _FLAGS = swe.FLG_SWIEPH | swe.FLG_SIDEREAL
else:
    _FLAGS = swe.FLG_MOSEPH | swe.FLG_SIDEREAL


def _jd(dt_utc: datetime) -> float:
    h = dt_utc.hour + dt_utc.minute / 60 + dt_utc.second / 3600
    return swe.julday(dt_utc.year, dt_utc.month, dt_utc.day, h)


def sidereal_longitude(jd: float, body: int) -> float:
    return swe.calc_ut(jd, body, _FLAGS)[0][0] % 360


def sign_of(lon: float) -> str:
    return SIGNS[int(lon // 30)]


def nakshatra_of(lon: float) -> tuple[str, int]:
    """Name and pada (1-4)."""
    idx = int(lon // NAK_SPAN)
    pada = int((lon % NAK_SPAN) // (NAK_SPAN / 4)) + 1
    return NAKSHATRAS[idx], pada


@dataclass(frozen=True)
class Period:
    lord: str
    start: datetime
    end: datetime


def mahadashas(moon_lon: float, birth_utc: datetime, count: int = 9) -> list[Period]:
    nak_idx = int(moon_lon // NAK_SPAN)
    elapsed_frac = (moon_lon % NAK_SPAN) / NAK_SPAN
    first = DASHA_ORDER[nak_idx % 9]
    # The first dasha began before birth; back-date it by the elapsed fraction.
    start = birth_utc - timedelta(days=elapsed_frac * DASHA_YEARS[first] * YEAR_DAYS)
    periods: list[Period] = []
    i = DASHA_ORDER.index(first)
    for _ in range(count):
        lord = DASHA_ORDER[i % 9]
        end = start + timedelta(days=DASHA_YEARS[lord] * YEAR_DAYS)
        periods.append(Period(lord, start, end))
        start, i = end, i + 1
    return periods


def antardashas(maha: Period) -> list[Period]:
    total_days = (maha.end - maha.start).total_seconds() / 86400
    i = DASHA_ORDER.index(maha.lord)
    start = maha.start
    out: list[Period] = []
    for k in range(9):
        lord = DASHA_ORDER[(i + k) % 9]
        end = start + timedelta(days=total_days * DASHA_YEARS[lord] / 120)
        out.append(Period(lord, start, end))
        start = end
    return out


def current_dasha(moon_lon: float, birth_utc: datetime, at: datetime) -> tuple[Period, Period]:
    for maha in mahadashas(moon_lon, birth_utc, count=18):
        if maha.start <= at < maha.end:
            for antar in antardashas(maha):
                if antar.start <= at < antar.end:
                    return maha, antar
    raise ValueError("date outside the computed dasha range")


def birth_to_utc(birth_date: date, birth_time: time | None, tz: str) -> datetime:
    """Unknown birth time → local noon, which keeps the Moon within ~6.5° of truth."""
    local = datetime.combine(birth_date, birth_time or time(12, 0), tzinfo=ZoneInfo(tz))
    return local.astimezone(timezone.utc)


def compute_chart(
    birth_date: date,
    birth_time: time | None,
    tz: str,
    lat: float,
    lon: float,
    on_date: date,
) -> dict:
    birth_utc = birth_to_utc(birth_date, birth_time, tz)
    jd = _jd(birth_utc)

    planets = {}
    for name, body in PLANETS.items():
        lng = sidereal_longitude(jd, body)
        nak, pada = nakshatra_of(lng)
        planets[name] = {"longitude": round(lng, 4), "sign": sign_of(lng), "nakshatra": nak, "pada": pada}
    ketu = (planets["Rahu"]["longitude"] + 180) % 360
    nak, pada = nakshatra_of(ketu)
    planets["Ketu"] = {"longitude": round(ketu, 4), "sign": sign_of(ketu), "nakshatra": nak, "pada": pada}

    ascendant = None
    if birth_time is not None:
        asc_lon = swe.houses_ex(jd, lat, lon, b"W", swe.FLG_SIDEREAL)[1][0] % 360
        ascendant = {"longitude": round(asc_lon, 4), "sign": sign_of(asc_lon)}

    moon_lon = planets["Moon"]["longitude"]
    # Transits are taken at 12:00 UTC on `on_date`; the Moon moves ~6° either side, so the
    # sign/nakshatra can differ from local noon on cusp days. Good enough for a daily theme.
    at = datetime.combine(on_date, time(12, 0), tzinfo=timezone.utc)
    maha, antar = current_dasha(moon_lon, birth_utc, at)

    jd_today = _jd(at)
    moon_today = sidereal_longitude(jd_today, swe.MOON)
    saturn_today = sidereal_longitude(jd_today, swe.SATURN)
    natal_moon_sign = int(moon_lon // 30)
    moon_house = (int(moon_today // 30) - natal_moon_sign) % 12 + 1
    saturn_house = (int(saturn_today // 30) - natal_moon_sign) % 12 + 1

    themes = [
        MOON_HOUSE_THEMES[moon_house],
        f"Your current chapter ({maha.lord}–{antar.lord}) is about "
        f"{DASHA_THEMES[maha.lord]}, colored by {DASHA_THEMES[antar.lord]}.",
    ]
    if saturn_house in (12, 1, 2):
        themes.append(
            "Saturn is moving through a slow, building stretch for you (Sade Sati): "
            "simple, steady routines serve you best."
        )

    return {
        "conventions": {"ayanamsa": "Lahiri", "nodes": "mean", "houses": "whole sign", "dasha_year_days": YEAR_DAYS},
        "birth_time_known": birth_time is not None,
        "planets": planets,
        "ascendant": ascendant,
        "natal_moon": {"sign": planets["Moon"]["sign"], "nakshatra": planets["Moon"]["nakshatra"]},
        "dasha": {
            "mahadasha": maha.lord,
            "mahadasha_ends": maha.end.date().isoformat(),
            "antardasha": antar.lord,
            "antardasha_ends": antar.end.date().isoformat(),
        },
        "today": {
            "date": on_date.isoformat(),
            "moon_sign": sign_of(moon_today),
            "moon_nakshatra": nakshatra_of(moon_today)[0],
            "moon_house_from_natal_moon": moon_house,
            "saturn_house_from_natal_moon": saturn_house,
        },
        "themes": themes,
    }
