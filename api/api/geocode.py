"""Geocode place names via Google Maps, with in-process caching."""

import threading

import httpx

from api.config import get_settings

# Shared HTTP client with connection pooling. Cloud Run keeps this alive
# for the container lifetime — avoids TCP handshake per geocode call.
_CLIENT: httpx.Client | None = None
_CLIENT_LOCK = threading.Lock()


def _client() -> httpx.Client:
    global _CLIENT
    if _CLIENT is None:
        with _CLIENT_LOCK:
            if _CLIENT is None:
                _CLIENT = httpx.Client(timeout=6)
    return _CLIENT


# Plain dict cache protected by a lock. lru_cache caches every return
# value including transient failures. This way we control exactly what's
# cached: successes and confirmed misses, NEVER transient failures.
_CACHE: dict[str, tuple[float | None, float | None]] = {}
_CACHE_LOCK = threading.Lock()
_CACHE_MAX = 1024


def geocode_place(place_name: str) -> tuple[float | None, float | None]:
    """Cached on success and on confirmed-miss; transient failures
    (DNS, timeout, 5xx) return (None, None) for THIS call without
    poisoning the cache."""
    with _CACHE_LOCK:
        if place_name in _CACHE:
            return _CACHE[place_name]

    try:
        resp = _client().get(
            "https://maps.googleapis.com/maps/api/geocode/json",
            params={"address": place_name, "key": get_settings().google_maps_api_key},
        )
        resp.raise_for_status()
        data = resp.json()
    except Exception:
        return None, None  # transient — don't cache

    if data.get("status") == "OK" and data.get("results"):
        loc = data["results"][0]["geometry"]["location"]
        result: tuple[float | None, float | None] = (
            float(loc["lat"]), float(loc["lng"]),
        )
    else:
        # Google says it doesn't know this address. Cache the miss
        # so we don't retry forever.
        result = (None, None)

    with _CACHE_LOCK:
        if len(_CACHE) >= _CACHE_MAX:
            # FIFO eviction: drop the oldest insertion.
            _CACHE.pop(next(iter(_CACHE)))
        _CACHE[place_name] = result
    return result
