"""Augment an existing trip with optional deeper sections for the PDF export.

Each augment-section is a small focused LLM call that takes the base document
as context and produces one extra Markdown section. Used by the PDF builder.
"""

from typing import TypedDict

from api.llm.client import make_client, strip_code_fences

AUGMENT_MODEL = "google/gemini-2.5-flash-lite:online"


class SectionSpec(TypedDict):
    label: str
    prompt: str


SECTIONS: dict[str, SectionSpec] = {
    "deep_itinerary": {
        "label": "Researching deeper itinerary",
        "prompt": (
            "Produce a `## Day-by-Day Notes` section. For each day in the "
            "existing itinerary, output:\n\n"
            "### Day N: <title>\n"
            "A 3-5 sentence paragraph explaining the logic of the day — why "
            "these stops in this order, what's special about each, transit "
            "tips between them, and any opening-hours or booking caveats.\n\n"
            "Then a short bullet list of 3-5 concrete tips for that day "
            "(weather, what to bring, time-of-day notes, local etiquette, "
            "where to find a coffee, etc.)\n\n"
            "Use this exact structure for EVERY day. Markdown only — no JSON, "
            "no code fences, no preamble."
        ),
    },
    "photography": {
        "label": "Looking for photo spots",
        "prompt": (
            "Write a `## Photography Spots` Markdown section. Use a table with "
            "columns: Location | Best Time | What to Photograph. 8-12 rows. Real, "
            "named, geographically distributed spots that complement the itinerary. "
            "Markdown only — no preamble, no fences."
        ),
    },
    "restaurants_deep": {
        "label": "Deep-diving restaurants",
        "prompt": (
            "Take the existing Vegetarian Restaurants table and write an expanded "
            "`## Restaurant Deep Dive` Markdown section. For each restaurant write a "
            "short paragraph: 2-3 must-try dishes, rough price range, reservation "
            "tips, and the neighbourhood vibe. Markdown only."
        ),
    },
    "logistics": {
        "label": "Compiling logistics",
        "prompt": (
            "Write a `## Logistics & What to Pack` Markdown section as a table with "
            "columns: Category | Details. Cover at minimum: getting there, getting "
            "around, currency, language, weather for the trip dates if known, what "
            "to pack, tipping etiquette, emergency number, plug type, SIM/eSIM. "
            "Markdown only."
        ),
    },
}


def augment_section(
    section_key: str, base_document: str, destination: str, days: int
) -> str:
    """Run one augment LLM call. Returns Markdown for that section, or "" if
    section_key is unknown."""
    spec = SECTIONS.get(section_key)
    if spec is None:
        return ""

    client = make_client()
    response = client.chat.completions.create(
        model=AUGMENT_MODEL,
        max_tokens=3500,
        messages=[
            {
                "role": "system",
                "content": (
                    "You are a precise travel writer. Output Markdown only — "
                    "no preamble, no fences, no JSON wrapping."
                ),
            },
            {
                "role": "user",
                "content": (
                    f"Trip: {days} days in {destination}.\n\n"
                    f"Existing travel guide:\n\n{base_document}\n\n"
                    f"{spec['prompt']}"
                ),
            },
        ],
    )
    return strip_code_fences(response.choices[0].message.content).strip()
