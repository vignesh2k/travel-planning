"""Generate a structured per-day PDF plan from a trip's existing context.

The PDF is a deeper, print-focused artefact — not a regurgitation of the
web view. Sections are user-toggleable: schedule is always produced;
food spots, photo spots, and per-day tips are conditional.

Each day is one parallel LLM call so the modal can show real progress.
DeepSeek v4-flash with web search (:online) for richer prose + fresh facts.
"""

import concurrent.futures
import json
from collections.abc import Iterator
from dataclasses import dataclass
from typing import Any

from api.llm.client import make_client, strip_code_fences
from api.models import PdfDay, PdfPlan

PDF_PLAN_MODEL = "deepseek/deepseek-v4-flash:online"


@dataclass
class PdfSections:
    food: bool = True
    photos: bool = True
    tips: bool = True


DAY_SYSTEM = (
    "You are a travel-guide writer producing one day of a deep-dive printable "
    "guide. Output a single JSON object only — no prose, no fences, no preamble."
)


def _day_user_prompt(
    destination: str,
    day_number: int,
    total_days: int,
    travel_style: str,
    base_doc_excerpt: str,
    weekday_label: str,
    sections: PdfSections,
) -> str:
    requested: list[str] = ["schedule"]
    if sections.food:
        requested.append("food_spots")
    if sections.photos:
        requested.append("photo_spots")
    if sections.tips:
        requested.append("tips")

    keys_csv = ", ".join(requested)

    schema_lines = [
        '"number": ' + str(day_number) + ',',
        '"title": "Short evocative title for the day",',
        f'"label": "{weekday_label}",',
        '"schedule": [',
        '  {"time": "HH:MM or ~HH:MM", "activity": "Concrete and named", "note": "Optional one-line caveat"},',
        '  ...',
        ']' + ("," if len(requested) > 1 else ""),
    ]
    if sections.food:
        schema_lines += [
            '"food_spots": [',
            '  {"name": "Real restaurant", "area": "Neighbourhood", "meal": "Breakfast | Lunch | Dinner | Coffee | Snack",',
            '   "tags": ["Vegan-friendly", "Book ahead"], "notes": "1-2 sentences with rough price (~€NNpp), key dish, vibe."}',
            "]" + ("," if "photo_spots" in requested or "tips" in requested else ""),
        ]
    if sections.photos:
        schema_lines += [
            '"photo_spots": [',
            '  {"location": "Specific named spot", "best_time": "Sunrise/golden hour/specific time", "what": "What to shoot, lens hint"}',
            "]" + ("," if "tips" in requested else ""),
        ]
    if sections.tips:
        schema_lines += [
            '"tips": [',
            '  "Short actionable tip ONLY when something specific warrants it",',
            "  ...",
            "]",
        ]

    schema = "\n  ".join(schema_lines)

    requirements: list[str] = [
        "- schedule: 8-12 time-stamped items covering morning through night",
    ]
    if sections.food:
        requirements.append(
            "- food_spots: 2-4 real, named places — ideally one per relevant meal (breakfast, lunch, dinner)"
        )
    if sections.photos:
        requirements.append(
            "- photo_spots: 2-3 specific named spots with best times"
        )
    if sections.tips:
        requirements.append(
            "- tips: 1-5 short tips ONLY if specific prep applies for THIS day's schedule "
            "(e.g. 'Pack a fleece — mountain temps drop to 8°C', 'Cash only at the trailhead', "
            "'Bring a tripod for blue hour shots'). Return an EMPTY array if nothing special applies — "
            "do not invent generic travel advice."
        )

    return f"""Trip: {total_days} days in {destination}. Travel style: {travel_style}.
You are writing the PRINT GUIDE for Day {day_number} only.

The web app already shows a high-level itinerary. The PDF should be deeper:
specific times, concrete recommendations, named restaurants with one-sentence
notes, and (when relevant) named photo spots and prep tips. Be opinionated.

Existing day brief from the web view (for continuity, do NOT copy verbatim):

{base_doc_excerpt}

Return a single JSON object with EXACTLY these keys: {keys_csv}.

Schema:
{{
  {schema}
}}

Requirements:
{chr(10).join(requirements)}

All recommendations must be real, named, current places. Times realistic
and sequential. Output a single JSON object. Nothing else."""


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
    sections: PdfSections,
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
                    sections,
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
    sections: PdfSections,
    start_date_iso: str | None = None,
) -> Iterator[tuple[str, Any]]:
    """Stream stage events while generating the per-day PDF plan in parallel.

    Yields:
      ("stage", {"key": "day_N", "label": "Day N of X", "status": ...})
      ("plan",  PdfPlan)
      ("error", message)
    """
    if total_days < 1:
        yield ("error", "Trip has no days")
        return

    weekday_labels = _build_weekday_labels(total_days, start_date_iso)
    excerpts = [_excerpt_day(base_md, n) for n in range(1, total_days + 1)]

    completed: dict[int, dict[str, Any]] = {}

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
                sections,
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
    if not start_date_iso:
        return [f"Day {n}" for n in range(1, total_days + 1)]
    from datetime import date, timedelta

    try:
        start = date.fromisoformat(start_date_iso)
    except ValueError:
        return [f"Day {n}" for n in range(1, total_days + 1)]
    return [
        f"Day {i + 1} · {(start + timedelta(days=i)).strftime('%a %-d %b')}"
        for i in range(total_days)
    ]
