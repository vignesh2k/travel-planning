"""Fast best-effort regex extractor for destination + days from a free-form brief.

When this returns a confident (destination, days) pair, the streaming /trips
endpoint can start the research LLM call immediately while the parse_brief LLM
runs in parallel for the remaining structured fields (start_date, airports).
This shaves the parse_brief round-trip (~3-5s) off the perceived wait.

Returns (None, None) when extraction is not confident.
"""

import re

# Patterns we recognize, in priority order. Each pattern must capture both the
# destination text and the day count.
_DEST = r"[A-Z][\w\-’']*(?:\s+(?:and|&|the)?\s*[A-Z][\w\-’']*){0,3}"
_PATTERNS = [
    # "7 days in Kyoto", "10 days in Vietnam", "3 days through Patagonia"
    re.compile(
        rf"\b(?P<days>\d{{1,2}})\s*(?:day|days|night|nights)\s+(?:in|to|through|across|exploring|around|at)\s+(?P<dest>{_DEST})",
        re.UNICODE,
    ),
    # "trip to Lisbon for 5 days", "visiting Kyoto for 7 days" — must come
    # BEFORE the generic "Y for X days" pattern, otherwise "Visiting Tokyo"
    # is captured as the destination.
    re.compile(
        rf"\b(?:trip\s+to|visit(?:ing)?|spending|going\s+to|fly(?:ing)?\s+to)\s+(?P<dest>{_DEST})\s+for\s+(?P<days>\d{{1,2}})\s*(?:day|days|night|nights)",
        re.UNICODE | re.IGNORECASE,
    ),
    # "Kyoto for 7 days", "Lisbon for 4 nights"
    re.compile(
        rf"\b(?P<dest>{_DEST})\s+for\s+(?P<days>\d{{1,2}})\s*(?:day|days|night|nights)\b",
        re.UNICODE,
    ),
    # "5-day Lisbon trip", "7-night Kyoto trip", "10 day vietnam trip"
    re.compile(
        rf"\b(?P<days>\d{{1,2}})[-\s](?:day|night)s?\s+(?:trip\s+(?:to|in)\s+)?(?P<dest>{_DEST})",
        re.UNICODE,
    ),
    # "Lisbon, 5 days" / "Lisbon - 5 days" / "Lisbon: 5 days"
    re.compile(
        rf"\b(?P<dest>{_DEST})\s*[,\-:–—]\s*(?P<days>\d{{1,2}})\s*(?:day|days|night|nights)\b",
        re.UNICODE,
    ),
    # "weekend in Lisbon" → 3 days
    re.compile(
        rf"\b(?P<duration>weekend|long\s+weekend|week|fortnight)\s+in\s+(?P<dest>{_DEST})",
        re.UNICODE,
    ),
]
_DURATION_PATTERN_INDEX = 5

_DURATION_TO_DAYS = {
    "weekend": 3,
    "long weekend": 4,
    "week": 7,
    "fortnight": 14,
}


def quick_extract(text: str) -> tuple[str | None, int | None]:
    """Try each pattern in order. Return (destination, days) or (None, None)."""
    for i, pat in enumerate(_PATTERNS):
        m = pat.search(text)
        if not m:
            continue
        dest = m.group("dest").strip()
        if i == _DURATION_PATTERN_INDEX:
            duration = re.sub(r"\s+", " ", m.group("duration").strip().lower())
            days = _DURATION_TO_DAYS.get(duration)
        else:
            try:
                days = int(m.group("days"))
            except ValueError:
                continue
        if not dest or not days or days < 1 or days > 60:
            continue
        return (dest, days)
    return (None, None)
