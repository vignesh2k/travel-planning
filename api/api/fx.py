"""GBP conversion rates from frankfurter.app (free, no auth, ECB rates).

In-process 24h memo. Single source of truth for any currency → GBP
conversion in the API.
"""

from __future__ import annotations

import time
from dataclasses import dataclass
from datetime import date

import httpx

_FRANKFURTER = "https://api.frankfurter.app/latest"
_TTL_SECONDS = 24 * 60 * 60


@dataclass(frozen=True)
class FxRate:
    rate: float
    fetched_on: date


_cache: dict[str, tuple[FxRate, float]] = {}


def get_gbp_rate(currency: str) -> FxRate:
    """Return {currency} → GBP rate. Cached per-currency for 24h."""
    code = currency.strip().upper()
    if code == "GBP":
        return FxRate(rate=1.0, fetched_on=date.today())

    cached = _cache.get(code)
    if cached and (time.time() - cached[1]) < _TTL_SECONDS:
        return cached[0]

    url = f"{_FRANKFURTER}?from={code}&to=GBP"
    resp = httpx.get(url, timeout=10)
    resp.raise_for_status()
    body = resp.json()
    rate = FxRate(
        rate=float(body["rates"]["GBP"]),
        fetched_on=date.fromisoformat(body["date"]),
    )
    _cache[code] = (rate, time.time())
    return rate
