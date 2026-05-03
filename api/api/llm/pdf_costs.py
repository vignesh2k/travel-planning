"""Categorised cost estimate for the PDF Estimated-costs page."""

from __future__ import annotations

import json

from api.llm.client import make_client, strip_code_fences
from api.models import PdfCostCategory, PdfCosts

_MODEL = "deepseek/deepseek-v4-flash"

_PROMPT = """You estimate trip costs by category for a printable travel guide.

Destination: {destination}
Travel style: {travel_style}
Days: {n_days}
Day plans: {day_titles}
Per-day budgets (destination currency, exclude lodging):
  {day_estimates}
Hotels picked: {hotel_names}

Return ONLY a JSON object — no prose, no markdown.

{{
  "currency": "<ISO 4217 — same as the day budgets above>",
  "categories": [
    {{"name": "Lodging", "amount": <integer>}},
    {{"name": "Food", "amount": <integer>}},
    {{"name": "Activities", "amount": <integer>}},
    {{"name": "Transport", "amount": <integer>}}
  ]
}}

Rules:
- Amounts are TRIP TOTAL per category (not per-day).
- Lodging = nights * typical room cost in this destination at the
  travel_style tier. Use the named hotels for sense-checking.
- Food + Activities + Transport should be roughly consistent with the
  per-day budgets summed (those exclude lodging).
- Round to natural increments.
"""


def estimate_pdf_costs(
    destination: str,
    travel_style: str,
    day_titles: list[str],
    day_estimates: list[int],
    hotel_names: list[str],
    gbp_rate: float,
) -> PdfCosts:
    prompt = _PROMPT.format(
        destination=destination,
        travel_style=travel_style or "balanced",
        n_days=len(day_titles) or len(day_estimates),
        day_titles="; ".join(day_titles) or "(none)",
        day_estimates=", ".join(str(x) for x in day_estimates) or "(none)",
        hotel_names="; ".join(hotel_names) or "(none picked)",
    )
    client = make_client()
    resp = client.chat.completions.create(
        model=_MODEL,
        messages=[{"role": "user", "content": prompt}],
        temperature=0.2,
    )
    raw = strip_code_fences(resp.choices[0].message.content)
    data = json.loads(raw)

    categories = [
        PdfCostCategory(
            name=c["name"],
            amount=int(c["amount"]),
            gbp_amount=round(int(c["amount"]) * gbp_rate),
        )
        for c in data["categories"]
    ]
    total_local = sum(c.amount for c in categories)
    total_gbp = sum(c.gbp_amount for c in categories)
    return PdfCosts(
        currency=data["currency"],
        gbp_rate=gbp_rate,
        categories=categories,
        total_local=total_local,
        total_gbp=total_gbp,
    )
