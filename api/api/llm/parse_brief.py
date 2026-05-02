import json

from api.llm.client import make_client, strip_code_fences
from api.models import ParsedBrief, TripBriefIn

PARSE_MODEL = "deepseek/deepseek-v4-flash"

SYSTEM_PROMPT = (
    "You extract structured trip details from a free-form brief. "
    "Return ONLY valid JSON matching this exact schema, no markdown, no commentary:\n"
    "{\n"
    '  "destination": string (city + country, geocodable),\n'
    '  "days": integer 1-60,\n'
    '  "travel_style": string (preferences, diet, interests as natural prose),\n'
    '  "start_date": "YYYY-MM-DD" or null,\n'
    '  "airport_entry": IATA code or null,\n'
    '  "airport_exit": IATA code or null\n'
    "}\n"
    "If a field is not stated, use null. Default days to 7 only if no duration is mentioned."
)


def parse_brief(brief: TripBriefIn) -> ParsedBrief:
    client = make_client()
    response = client.chat.completions.create(
        model=PARSE_MODEL,
        max_tokens=300,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": brief.text},
        ],
    )
    raw = strip_code_fences(response.choices[0].message.content)
    data = json.loads(raw)
    parsed = ParsedBrief(**data)

    # Structured fields supplied by the UI take precedence over the LLM's guess.
    if brief.start_date is not None:
        parsed.start_date = brief.start_date
    if brief.airport_entry is not None:
        parsed.airport_entry = brief.airport_entry
    if brief.airport_exit is not None:
        parsed.airport_exit = brief.airport_exit

    return parsed
