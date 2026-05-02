"""Generate a structured per-day PDF plan from a trip's existing context.

The PDF is meant to be a deeper, print-focused artefact — not a regurgitation
of the web view. Each day gets:
  • A time-blocked schedule (8-12 items, weaving activities/transit/breaks)
  • 2-4 food spot cards (real names, area, meal type, tags, 1-2 sentence notes)
  • 2-3 photo spot cards (location, best time, what to shoot)

We dispatch one LLM call per day in parallel, so the modal can show real
progress per day. With OpenRouter's :online suffix each call augments with
fresh web search results.
"""

import concurrent.futures
import json
from collections.abc import Iterator
from typing import Any

from api.llm.client import make_client, strip_code_fences
from api.models import PdfDay, PdfPlan

PDF_PLAN_MODEL = "google/gemini-2.5-flash-lite:online"

DAY_SYSTEM = (
    "You are a travel-guide writer producing a single day of a deep-dive printable "
    "guide. Output a single JSON object only — no prose, no fences, no preamble."
)


def _day_user_prompt(
    destination: str,
    day_number: int,
    total_days: int,
    travel_style: str,
    base_doc_excerpt: str,
    weekday_label: str,
) -> str:
    return f"""Trip: {total_days} days in {destination}. Travel style: {travel_style}.
You are writing the PRINT GUIDE for Day {day_number} only.

The web app already shows a high-level itinerary. The PDF should be deeper:
specific times, concrete recommendations, named restaurants with one-sentence
notes, and named photo spots with best times. Be opinionated.

Existing day brief from the web view (for continuity, do NOT copy verbatim):

{base_doc_excerpt}

Return a single JSON object:

{{
  "number": {day_number},
  "title": "Short evocative title (e.g. 'Higashiyama Temples & Sannenzaka')",
  "label": "{weekday_label}",
  "schedule": [
    {{"time": "HH:MM or ~HH:MM", "activity": "What happens — concrete and named", "note": "Optional one-line caveat or detail"}},
    ...
  ],
  "food_spots": [
    {{
      "name": "Real restaurant name",
      "area": "Neighbourhood",
      "meal": "Breakfast | Lunch | Dinner | Coffee | Snack",
      "tags": ["Vegan-friendly", "Book ahead", "Cash only"],
      "notes": "1-2 sentences. Include rough price (~€NNpp), key dish, vibe."
    }}
  ],
  "photo_spots": [
    {{"location": "Specific named spot", "best_time": "Sunrise/golden hour/specific time", "what": "What to shoot, lens hint if useful"}}
  ]
}}

REQUIREMENTS:
- schedule: 8-12 time-stamped items covering morning through night
- food_spots: 2-4 entries, ideally one each for relevant meals
- photo_spots: 2-3 entries with specific locations
- All recommendations must be real, named, current places
- Times realistic and sequential
- For tags: only include genuinely true ones. Empty array is fine.

Output a single JSON object. Nothing else."""


def _extract_json(raw: str) -> str:
    raw = strip_code_fences(raw)
    start = raw.find("{")
    end = raw.rfind("}")
    if start != -1 and end > start:
        return raw[start : end + 1]
    return raw


def _generate_day(
    destination: str,
    day_number: int,
    total_days: int,
    travel_style: str,
    base_doc_excerpt: str,
    weekday_label: str,
) -> dict[str, Any]:
    client = make_client()
    response = client.chat.completions.create(
        model=PDF_PLAN_MODEL,
        max_tokens=2500,
        messages=[
            {"role": "system", "content": DAY_SYSTEM},
            {
                "role": "user",
                "content": _day_user_prompt(
                    destination,
                    day_number,
                    total_days,
                    travel_style,
                    base_doc_excerpt,
                    weekday_label,
                ),
            },
        ],
    )
    raw = _extract_json(response.choices[0].message.content)
    return json.loads(raw)


def _excerpt_day(base_md: str, day_number: int) -> str:
    """Pull the rough text of a single day from the existing markdown so the
    deep-dive call has continuity to build on. Returns "" if not found."""
    import re

    m = re.search(
        rf"^### Day\s+{day_number}\s*:[\s\S]*?(?=^### Day\s+\d+\s*:|^## |\Z)",
        base_md,
        re.MULTILINE,
    )
    if not m:
        return ""
    return m.group(0).strip()[:1500]


def stream_pdf_plan(
    destination: str,
    total_days: int,
    travel_style: str,
    base_md: str,
    start_date_iso: str | None = None,
) -> Iterator[tuple[str, Any]]:
    """Stream stage events while generating the per-day PDF plan in parallel.

    Yields:
      ("stage", {"key": "day_N", "label": "Day N of X", "status": "running"|"done"|"error"})
      ("plan",  PdfPlan)  — once at the end with the assembled plan
      ("error", message)  — if no days could be generated
    """
    if total_days < 1:
        yield ("error", "Trip has no days")
        return

    weekday_labels = _build_weekday_labels(total_days, start_date_iso)
    excerpts = [_excerpt_day(base_md, n) for n in range(1, total_days + 1)]

    completed: dict[int, dict[str, Any]] = {}

    # Emit pending stages upfront so the modal can render the full list.
    for n in range(1, total_days + 1):
        yield ("stage", {"key": f"day_{n}", "label": f"Crafting Day {n}", "status": "running"})

    with concurrent.futures.ThreadPoolExecutor(max_workers=min(total_days, 5)) as ex:
        futures = {
            ex.submit(
                _generate_day,
                destination,
                n,
                total_days,
                travel_style,
                excerpts[n - 1],
                weekday_labels[n - 1],
            ): n
            for n in range(1, total_days + 1)
        }
        for future in concurrent.futures.as_completed(futures):
            n = futures[future]
            try:
                day_data = future.result()
                completed[n] = day_data
                yield ("stage", {"key": f"day_{n}", "label": f"Crafting Day {n}", "status": "done"})
            except Exception as e:
                yield (
                    "stage",
                    {
                        "key": f"day_{n}",
                        "label": f"Crafting Day {n}",
                        "status": "error",
                        "message": str(e),
                    },
                )

    if not completed:
        yield ("error", "All day generations failed")
        return

    days_sorted = [completed[n] for n in sorted(completed)]
    plan = PdfPlan(
        destination=destination,
        subtitle=f"{total_days} days · curated by Atlas",
        route=[d.get("title", f"Day {d.get('number', '?')}") for d in days_sorted],
        days=[PdfDay(**d) for d in days_sorted],
    )
    yield ("plan", plan)


def _build_weekday_labels(total_days: int, start_date_iso: str | None) -> list[str]:
    """Build readable per-day labels. With a start date: 'Day 1 · Fri 15 May'.
    Without: 'Day 1', 'Day 2', ..."""
    if not start_date_iso:
        return [f"Day {n}" for n in range(1, total_days + 1)]

    from datetime import date, timedelta

    try:
        start = date.fromisoformat(start_date_iso)
    except ValueError:
        return [f"Day {n}" for n in range(1, total_days + 1)]

    out: list[str] = []
    for i in range(total_days):
        d = start + timedelta(days=i)
        out.append(f"Day {i + 1} · {d.strftime('%a %-d %b')}")
    return out
