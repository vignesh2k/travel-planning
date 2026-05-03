import json
from collections.abc import Iterator
from typing import Any

from api.llm.client import make_client, strip_code_fences

RESEARCH_MODEL = "google/gemini-3.1-flash-lite-preview:online"

MAX_TOKENS = 6000

SYSTEM_PROMPT = (
    "You are an expert travel guide writer. Be specific with real place names. "
    "For restaurants prefer dedicated vegetarian/vegan spots or places with great "
    "vegetarian menus. Output valid JSON only — no markdown fences, no preamble."
)


def _user_prompt(destination: str, trip_length: int, travel_style: str) -> str:
    return f"""Build a travel guide for {trip_length} days in {destination}.
Style: {travel_style}.

Return JSON with exactly two keys.

1. "document" — a SINGLE STRING of Markdown text (NOT a JSON object,
   NOT a nested object keyed by section). Inside that one string,
   include EXACTLY these two sections, in this order:

## Vegetarian Restaurants
A markdown table with columns: Restaurant | Area | Must-Try.
4 to 7 rows. Real, named, vegetarian-friendly places.

## {trip_length}-Day Itinerary
For each of the {trip_length} days, EXACTLY this structure:

### Day N: <short title naming the area or theme>
**Morning:**
- <activity with a real, named place — start with the place name when possible>
- <activity, ideally including a coffee/breakfast spot>
- <activity, transit note, or local tip>
**Afternoon:**
- <activity with a real place name>
- <activity, ideally a lunch recommendation with restaurant name>
- <activity or scenic detour>
**Evening:**
- <activity, sunset spot, or viewpoint>
- <dinner recommendation with restaurant name>
- <optional nightlife or local experience>

Each bullet should be specific and actionable — not vague ("walk around")
but concrete ("Walk Sannenzaka and Ninenzaka, the preserved cobblestone
streets behind Kiyomizu-dera").

2. "places" — array of at most 12 objects covering the most important named
   locations across the document. Each object:
   - "name": geocodable string e.g. "Kiyomizu-dera, Kyoto, Japan"
   - "category": one of "neighbourhood" | "restaurant" | "photography_spot" | "logistics"
   - "description": one short sentence

Output a single JSON object only. No prose around it. No code fences."""


def _extract_json(raw: str) -> str:
    """Strip code fences, then bound to first `{` … last `}` to tolerate
    occasional preamble or trailing whitespace from the model."""
    raw = strip_code_fences(raw)
    start = raw.find("{")
    end = raw.rfind("}")
    if start != -1 and end > start:
        return raw[start : end + 1]
    return raw


def _parse_json_with_salvage(raw: str) -> dict:
    """Try strict json.loads; on failure, fall back to json_repair which
    handles common LLM malformations: unescaped quotes inside strings,
    raw newlines, trailing commas, missing commas between items.

    Raises json.JSONDecodeError if BOTH passes fail (json_repair returns
    an empty dict {} on total failure — we treat that as failure too)."""
    try:
        return json.loads(raw)
    except json.JSONDecodeError as strict_err:
        try:
            from json_repair import repair_json
        except ImportError:
            raise strict_err
        repaired = repair_json(raw, return_objects=True)
        if not isinstance(repaired, dict) or not repaired:
            raise strict_err
        return repaired


def get_travel_research(destination: str, trip_length: int, travel_style: str) -> dict:
    client = make_client()
    response = client.chat.completions.create(
        model=RESEARCH_MODEL,
        max_tokens=MAX_TOKENS,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": _user_prompt(destination, trip_length, travel_style)},
        ],
    )
    raw = _extract_json(response.choices[0].message.content)
    return _parse_json_with_salvage(raw)


def stream_travel_research(
    destination: str,
    trip_length: int,
    travel_style: str,
) -> Iterator[tuple[str, Any]]:
    """Stream the research call. Yields:
      - ("progress", {"chars": int})  every ~250 chars of accumulated output
      - ("result",   parsed_dict)     once at the end with the full parsed JSON
      - ("error",    message)         if the response can't be parsed as JSON
    """
    client = make_client()
    stream = client.chat.completions.create(
        model=RESEARCH_MODEL,
        max_tokens=MAX_TOKENS,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": _user_prompt(destination, trip_length, travel_style)},
        ],
        stream=True,
    )

    accumulated = ""
    last_progress_at = 0
    PROGRESS_EVERY = 250

    for chunk in stream:
        choices = getattr(chunk, "choices", None)
        if not choices:
            continue
        delta = getattr(choices[0], "delta", None)
        content = getattr(delta, "content", None) if delta else None
        if not content:
            continue
        accumulated += content
        if len(accumulated) - last_progress_at >= PROGRESS_EVERY:
            yield ("progress", {"chars": len(accumulated)})
            last_progress_at = len(accumulated)

    raw = _extract_json(accumulated)
    try:
        parsed = _parse_json_with_salvage(raw)
    except json.JSONDecodeError as e:
        yield ("error", f"Could not parse research response: {e}; len={len(accumulated)}")
        return
    yield ("result", parsed)
