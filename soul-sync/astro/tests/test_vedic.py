from datetime import date, datetime, time, timezone

import pytest
import swisseph as swe
from fastapi.testclient import TestClient

import main
from vedic import (
    DASHA_YEARS, NAK_SPAN, antardashas, birth_to_utc, compute_chart, current_dasha,
    mahadashas, nakshatra_of, sidereal_longitude, _jd,
)


def test_lahiri_ayanamsa_at_j2000():
    # Lahiri ayanamsa at J2000.0 is 23°51' (≈23.85°).
    assert swe.get_ayanamsa_ut(swe.julday(2000, 1, 1, 12)) == pytest.approx(23.85, abs=0.02)


def test_sidereal_moon_matches_tropical_minus_ayanamsa():
    jd = swe.julday(2000, 1, 1, 12)
    tropical = swe.calc_ut(jd, swe.MOON, swe.FLG_MOSEPH)[0][0]
    assert sidereal_longitude(jd, swe.MOON) == pytest.approx((tropical - swe.get_ayanamsa_ut(jd)) % 360, abs=0.01)


def test_nakshatra_boundaries():
    assert nakshatra_of(0.0) == ("Ashwini", 1)
    assert nakshatra_of(NAK_SPAN - 0.001)[0] == "Ashwini"
    assert nakshatra_of(NAK_SPAN)[0] == "Bharani"
    assert nakshatra_of(359.99) == ("Revati", 4)


def test_mahadasha_sequence_and_balance():
    birth = datetime(1990, 6, 15, 6, 0, tzinfo=timezone.utc)
    # Moon exactly at the start of Ashwini → full Ketu dasha from birth.
    periods = mahadashas(0.0, birth)
    assert [p.lord for p in periods[:3]] == ["Ketu", "Venus", "Sun"]
    assert periods[0].start == birth
    assert (periods[0].end - periods[0].start).days == pytest.approx(7 * 365.25, abs=1)
    # Moon halfway through Bharani (Venus) → half of Venus' 20 years remain.
    half = mahadashas(NAK_SPAN * 1.5, birth)
    assert half[0].lord == "Venus"
    assert (half[0].end - birth).days == pytest.approx(10 * 365.25, abs=1)


def test_antardashas_fill_the_mahadasha_exactly():
    maha = mahadashas(0.0, datetime(2000, 1, 1, tzinfo=timezone.utc))[1]  # Venus, 20 years
    subs = antardashas(maha)
    assert subs[0].lord == "Venus" and subs[1].lord == "Sun"
    assert subs[0].start == maha.start
    assert abs((subs[-1].end - maha.end).total_seconds()) < 1
    assert sum(DASHA_YEARS.values()) == 120


def test_current_dasha_finds_the_running_period():
    birth = datetime(2000, 1, 1, tzinfo=timezone.utc)
    maha, antar = current_dasha(0.0, birth, datetime(2003, 1, 1, tzinfo=timezone.utc))
    assert maha.lord == "Ketu" and antar.start <= datetime(2003, 1, 1, tzinfo=timezone.utc) < antar.end


def test_birth_time_is_converted_from_local_zone():
    utc = birth_to_utc(date(1990, 6, 15), time(8, 30), "America/Port_of_Spain")
    assert utc == datetime(1990, 6, 15, 12, 30, tzinfo=timezone.utc)
    assert birth_to_utc(date(1990, 6, 15), None, "UTC").hour == 12  # unknown time → noon


def test_compute_chart_shape_and_consistency():
    c = compute_chart(date(1990, 6, 15), time(8, 30), "America/Port_of_Spain", 10.65, -61.52, date(2026, 10, 26))
    assert set(c["planets"]) == {"Sun", "Moon", "Mars", "Mercury", "Jupiter", "Venus", "Saturn", "Rahu", "Ketu"}
    assert c["ascendant"] is not None
    rahu, ketu = c["planets"]["Rahu"]["longitude"], c["planets"]["Ketu"]["longitude"]
    assert (ketu - rahu) % 360 == pytest.approx(180, abs=1e-3)
    assert 1 <= c["today"]["moon_house_from_natal_moon"] <= 12
    assert c["dasha"]["mahadasha"] in DASHA_YEARS
    assert c["dasha"]["antardasha_ends"] > "2026-10-26"
    assert len(c["themes"]) >= 2
    # Tropical Sun ≈ 84.0° on 1990-06-15 12:30 UT; minus Lahiri (~23.7°) ≈ 60.3°, just into sidereal Gemini.
    assert c["planets"]["Sun"]["longitude"] == pytest.approx(60.3, abs=0.3)
    assert c["planets"]["Sun"]["sign"] == "Gemini"


def test_unknown_birth_time_skips_ascendant():
    c = compute_chart(date(1990, 6, 15), None, "UTC", 0, 0, date(2026, 10, 26))
    assert c["ascendant"] is None and c["birth_time_known"] is False


def test_api_requires_key_and_validates(monkeypatch):
    monkeypatch.setenv("ASTRO_API_KEY", "secret")
    client = TestClient(main.app)
    body = {"birth_date": "1990-06-15", "birth_time": "08:30", "tz": "America/Port_of_Spain", "lat": 10.65, "lon": -61.52}
    assert client.post("/chart", json=body).status_code == 401
    ok = client.post("/chart", json=body, headers={"x-astro-key": "secret"})
    assert ok.status_code == 200 and "dasha" in ok.json()
    bad = client.post("/chart", json={**body, "tz": "Mars/Olympus"}, headers={"x-astro-key": "secret"})
    assert bad.status_code == 422
    assert client.get("/health").json() == {"ok": True}
