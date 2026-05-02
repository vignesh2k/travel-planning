import json
from collections.abc import Iterator
from typing import Any

from api.llm.client import make_client, strip_code_fences

RESEARCH_MODEL = "deepseek/deepseek-v4-flash"


SYSTEM_PROMPT = (
    "You are an expert travel researcher. You provide specific, actionable recommendations "
    "with real place names. For vegetarian restaurants, focus on dedicated vegetarian/vegan "
    "spots or places with outstanding vegetarian menus. Always respond with valid JSON only — "
    "no markdown fences, no extra text."
)


def _user_prompt(destination: str, trip_length: int, travel_style: str) -> str:
    return f"""Create a comprehensive travel research document for a trip to {destination}.

Trip details:
- Duration: {trip_length} days
- Travel style / preferences: {travel_style}

Return a single JSON object with exactly two keys:

1. "document" — a detailed Markdown string with these sections:
   ## Overview
   ## Where to Base Yourself
   Recommend the smartest accommodation strategy for this trip length: one central base, two bases, or a moving itinerary. Explain why — consider transport links, proximity to key areas, and cost of moving. Keep it to 2–3 sentences with a clear recommendation.
   ## Neighbourhoods  (3–5 key neighbourhoods, prose descriptions)
   ## Vegetarian Restaurants — markdown table with columns: Restaurant | Area | Must-Try / Why Visit
   ## Photography Spots — markdown table with columns: Location | Best Time | What to Photograph
   ## {trip_length}-Day Itinerary
   Structure the days to reflect the basing strategy above (e.g. group days by base location if moving).
   For EVERY day use exactly this structure — no variations:
   ### Day N: Title
   **Morning:**
   - bullet
   - bullet
   **Afternoon:**
   - bullet
   - bullet
   **Evening:**
   - bullet
   - bullet
   ## Logistics — markdown table with columns: Category | Details

2. "places" — an array of objects for every named location in the document:
   - "name": geocodable string, e.g. "Shinjuku Gyoen, Tokyo, Japan"
   - "category": one of "neighbourhood" | "restaurant" | "photography_spot" | "logistics"
   - "description": one sentence about this place

Return ONLY the JSON object."""


def get_travel_research(destination: str, trip_length: int, travel_style: str) -> dict:
    client = make_client()
    response = client.chat.completions.create(
        model=RESEARCH_MODEL,
        max_tokens=12000,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": _user_prompt(destination, trip_length, travel_style)},
        ],
    )
    raw = strip_code_fences(response.choices[0].message.content)
    return json.loads(raw)


def stream_travel_research(
    destination: str,
    trip_length: int,
    travel_style: str,
) -> Iterator[tuple[str, Any]]:
    """Stream the research call. Yields:
      - ("progress", {"chars": int})  every ~250 chars of accumulated output
      - ("result",   parsed_dict)     once at the end with the full parsed JSON

    If the response is malformed JSON, yields ("error", message) instead.
    """
    client = make_client()
    stream = client.chat.completions.create(
        model=RESEARCH_MODEL,
        max_tokens=12000,
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

    raw = strip_code_fences(accumulated)
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError as e:
        yield ("error", f"Could not parse research response: {e}")
        return
    yield ("result", parsed)
