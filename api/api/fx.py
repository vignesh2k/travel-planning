"""GBP conversion rates from frankfurter.app (free, no auth, ECB rates).

In-process 24h memo. Single source of truth for any currency → GBP
conversion in the API.
"""

from __future__ import annotations

import threading
import time
from dataclasses import dataclass
from datetime import date

import httpx

_FRANKFURTER = "https://api.frankfurter.dev/v1/latest"
_TTL_SECONDS = 24 * 60 * 60

# Shared HTTP client with connection pooling.
_CLIENT: httpx.Client | None = None
_CLIENT_LOCK = threading.Lock()


def _client() -> httpx.Client:
    global _CLIENT
    if _CLIENT is None:
        with _CLIENT_LOCK:
            if _CLIENT is None:
                _CLIENT = httpx.Client(timeout=10, follow_redirects=True)
    return _CLIENT


@dataclass(frozen=True)
class FxRate:
    rate: float
    fetched_on: date


_cache: dict[str, tuple[FxRate, float]] = {}
_cache_lock = threading.Lock()


def get_gbp_rate(currency: str) -> FxRate:
    """Return {currency} → GBP rate. Cached per-currency for 24h."""
    code = currency.strip().upper()
    if code == "GBP":
        return FxRate(rate=1.0, fetched_on=date.today())

    with _cache_lock:
        cached = _cache.get(code)
        if cached and (time.time() - cached[1]) < _TTL_SECONDS:
            return cached[0]

    url = f"{_FRANKFURTER}?from={code}&to=GBP"
    resp = _client().get(url)
    resp.raise_for_status()
    body = resp.json()
    rate = FxRate(
        rate=float(body["rates"]["GBP"]),
        fetched_on=date.fromisoformat(body["date"]),
    )
    with _cache_lock:
        _cache[code] = (rate, time.time())
    return rate
