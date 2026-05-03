import json

from api.llm.client import make_client, strip_code_fences

SUGGESTION_MODEL = "google/gemini-3.1-flash-lite-preview"


def get_suggestions(destination: str) -> list[str]:
    client = make_client()
    response = client.chat.completions.create(
        model=SUGGESTION_MODEL,
        max_tokens=300,
        messages=[
            {"role": "system", "content": "Return only a JSON array of strings. No other text or markdown."},
            {"role": "user", "content": (
                f"List 8 must-visit places or experiences in {destination}. "
                "Short phrases only (3–6 words each). JSON array."
            )},
        ],
    )
    raw = strip_code_fences(response.choices[0].message.content)
    return json.loads(raw)
