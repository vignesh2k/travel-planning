from openai import OpenAI

from api.config import get_settings


def make_client() -> OpenAI:
    return OpenAI(
        api_key=get_settings().openrouter_api_key,
        base_url="https://openrouter.ai/api/v1",
    )


def strip_code_fences(raw: str) -> str:
    """Match the fence-stripping logic in app.py."""
    raw = raw.strip()
    if raw.startswith("```"):
        raw = raw.split("```", 2)[1]
        if raw.startswith("json"):
            raw = raw[4:]
        raw = raw.rsplit("```", 1)[0].strip()
    return raw
