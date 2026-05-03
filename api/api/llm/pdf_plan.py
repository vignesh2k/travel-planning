"""Generate a structured per-day PDF plan from a trip's existing context.

The PDF is a deeper, print-focused artefact — not a regurgitation of the
web view. Sections are user-toggleable: schedule is always produced;
food spots, photo spots, and per-day tips are conditional.

Each day is one parallel LLM call so the modal can show real progress.
DeepSeek v4-flash with web search (:online) for richer prose + fresh facts.
"""

import concurrent.futures
import json
import time
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
    costs: bool = True


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


def _generate_day_once(
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


def _generate_day(
    destination: str,
    day_number: int,
    total_days: int,
    travel_style: str,
    base_doc_excerpt: str,
    weekday_label: str,
    sections: PdfSections,
    max_attempts: int = 3,
) -> dict[str, Any]:
    """Retry the day-generation LLM call on transient failures.

    Common reasons a single attempt fails: OpenRouter rate-limit/timeout,
    malformed JSON from the model, occasional connection blip. With three
    attempts and a short backoff, the per-day failure rate drops sharply.
    """
    last_error: Exception | None = None
    for attempt in range(max_attempts):
        try:
            return _generate_day_once(
                destination,
                day_number,
                total_days,
                travel_style,
                base_doc_excerpt,
                weekday_label,
                sections,
            )
        except Exception as e:
            last_error = e
            if attempt < max_attempts - 1:
                time.sleep(0.6 * (attempt + 1))  # 0.6s, 1.2s
    raise last_error if last_error else RuntimeError("day generation failed")


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
    day_estimates: list[int] | None = None,
    hotel_names: list[str] | None = None,
    gbp_rate: float | None = None,
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

    # Costs runs in parallel with day generation when possible. The
    # estimate uses destination, travel_style, day_estimates, and
    # hotel_names — none of which depend on the per-day plan output —
    # so it can fire at the same time as the days. day_titles becomes
    # an optional, ignored input here. Saves ~1.5-3s of wall-clock at
    # the end of a build vs. running serially after all days complete.
    will_run_costs = sections.costs and gbp_rate is not None

    with concurrent.futures.ThreadPoolExecutor(
        max_workers=min(total_days, 5) + (1 if will_run_costs else 0),
    ) as ex:
        if will_run_costs:
            yield ("stage", {"key": "costs", "label": "Estimating costs", "status": "running"})
            from api.llm.pdf_costs import estimate_pdf_costs

            costs_future = ex.submit(
                estimate_pdf_costs,
                destination,
                travel_style,
                [],  # day_titles not yet known; the prompt tolerates empty
                day_estimates or [],
                hotel_names or [],
                gbp_rate,
            )
        elif sections.costs:
            # gbp_rate is None — emit a terminal "skipped" event so the
            # frontend's progress tracker advances.
            yield ("stage", {
                "key": "costs", "label": "Estimating costs", "status": "done",
                "message": "Skipped — generate the budget first to include this section.",
            })
            costs_future = None
        else:
            costs_future = None

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
                # Even after retries this day failed. Stub it so the PDF still
                # renders every day in order — better than a missing-day gap.
                completed[n] = _stub_day(n, weekday_labels[n - 1], str(e))
                yield (
                    "stage",
                    {
                        "key": f"day_{n}",
                        "label": f"Crafting Day {n}",
                        "status": "error",
                        "message": str(e),
                    },
                )

        # Resolve the costs future (was started in parallel with days).
        costs = None
        if costs_future is not None:
            try:
                costs = costs_future.result(timeout=60)
                yield ("stage", {"key": "costs", "label": "Estimating costs", "status": "done"})
            except Exception as e:
                yield ("stage", {"key": "costs", "label": "Estimating costs",
                                 "status": "error", "message": str(e)})

    if not completed:
        yield ("error", "All day generations failed")
        return

    days_sorted = [completed[n] for n in sorted(completed)]
    plan = PdfPlan(
        destination=destination,
        subtitle=f"{total_days} days · curated by Atlas",
        route=[d.get("title", f"Day {d.get('number', '?')}") for d in days_sorted],
        days=[PdfDay(**d) for d in days_sorted],
        costs=costs,
    )

    yield ("plan", plan)


def _stub_day(day_number: int, weekday_label: str, err: str) -> dict[str, Any]:
    """Minimal placeholder day used when all retries fail. Keeps the PDF
    contiguous and tells the user this day needs regeneration."""
    return {
        "number": day_number,
        "title": f"Day {day_number} — generation failed",
        "label": weekday_label,
        "schedule": [
            {
                "time": "—",
                "activity": "We couldn't generate this day. Refine the trip and re-export to retry.",
                "note": err[:200] if err else None,
            }
        ],
        "food_spots": [],
        "photo_spots": [],
        "tips": [],
    }


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
