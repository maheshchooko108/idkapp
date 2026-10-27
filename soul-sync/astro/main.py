"""Astro service: a tiny HTTP wrapper around vedic.py.

Swiss Ephemeris is a C library, which is why this runs as its own small
service rather than inside the Supabase (Deno) edge functions.
"""

from __future__ import annotations

import hmac
import os
from datetime import date, time
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import Depends, FastAPI, Header, HTTPException
from pydantic import BaseModel, Field, field_validator

from vedic import compute_chart

app = FastAPI(title="Soul Sync astro service")


def require_key(x_astro_key: str = Header(default="")) -> None:
    expected = os.environ.get("ASTRO_API_KEY", "")
    if not expected or not hmac.compare_digest(x_astro_key, expected):
        raise HTTPException(status_code=401, detail="bad or missing x-astro-key")


class ChartRequest(BaseModel):
    birth_date: date
    birth_time: time | None = None
    tz: str = Field(description="IANA time zone of the birthplace, e.g. America/Port_of_Spain")
    lat: float = Field(ge=-90, le=90)
    lon: float = Field(ge=-180, le=180)
    on_date: date | None = Field(default=None, description="Date for transits/dasha; defaults to today (UTC)")

    @field_validator("tz")
    @classmethod
    def valid_tz(cls, v: str) -> str:
        try:
            ZoneInfo(v)
        except (ZoneInfoNotFoundError, ValueError) as e:
            raise ValueError(f"unknown time zone {v!r}") from e
        return v

    @field_validator("birth_date")
    @classmethod
    def plausible_birth(cls, v: date) -> date:
        if not date(1900, 1, 1) <= v <= date.today():
            raise ValueError("birth_date must be between 1900 and today")
        return v


@app.get("/health")
def health() -> dict:
    return {"ok": True}


@app.post("/chart", dependencies=[Depends(require_key)])
def chart(req: ChartRequest) -> dict:
    return compute_chart(req.birth_date, req.birth_time, req.tz, req.lat, req.lon, req.on_date or date.today())
