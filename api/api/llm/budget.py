"""Per-day budget estimates in destination currency.

Single LLM call. Runs in parallel with research at trip-creation time.
"""

from __future__ import annotations

import json

from api.llm.client import make_client, strip_code_fences
from api.models import BudgetEstimateRaw

_MODEL = "google/gemini-3.1-flash-lite-preview"

_PROMPT = """You estimate per-day travel budgets with a category breakdown.

Destination: {destination}
Days: {days}
Travel style: {travel_style}

Return ONLY a JSON object — no prose, no markdown.

{{
  "currency": "<ISO 4217 code for the destination, e.g. JPY for Kyoto, EUR for Lisbon>",
  "days": [
    {{
      "number": 1,
      "estimated": <integer in destination currency — sum of breakdown>,
      "breakdown": [
        {{"label": "Food",            "amount": <integer>}},
        {{"label": "Activities",      "amount": <integer>}},
        {{"label": "Local transport", "amount": <integer>}},
        {{"label": "Misc",            "amount": <integer>}}
      ]
    }},
    ...one row per day...
  ]
}}

Rules:
- Estimates are PER PERSON, PER DAY, and EXCLUDE flights and lodging.
- The `estimated` field MUST equal the sum of the `breakdown` amounts.
- Each day has 3 to 5 breakdown lines covering the actual day. Reasonable
  labels: Food, Activities, Local transport, Misc, Coffee & snacks,
  Tickets & entries, Tips & extras. Tailor labels to what the day will
  involve — a beach day shouldn't list "Tickets & entries".
- Round each breakdown amount to natural increments (¥500, €5, $5)
  and ensure they sum exactly to `estimated`.
- Reflect the budget tier in the travel_style. Cheap is shoestring,
  mid is comfortable, premium is splurge.
- Vary days based on travel intensity (long sightseeing day > rest day).
"""


def budget_estimate(
    destination: str,
    days: int,
    travel_style: str,
    day_titles: list[str] | None = None,
) -> BudgetEstimateRaw:
    prompt = _PROMPT.format(
        destination=destination,
        days=days,
        travel_style=travel_style or "balanced",
    )
    if day_titles:
        prompt += "\n\nDay titles for context (in order):\n" + "\n".join(
            f"  Day {i + 1}: {t}" for i, t in enumerate(day_titles)
        )

    client = make_client()
    resp = client.chat.completions.create(
        model=_MODEL,
        messages=[{"role": "user", "content": prompt}],
        temperature=0.2,
    )
    raw = strip_code_fences(resp.choices[0].message.content)

    try:
        data = json.loads(raw)
    except json.JSONDecodeError as e:
        raise ValueError(f"budget_estimate: not JSON: {e}: {raw[:200]!r}") from e

    return BudgetEstimateRaw(**data)
