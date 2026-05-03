from functools import lru_cache

from openai import OpenAI

from api.config import get_settings


@lru_cache(maxsize=1)
def make_client() -> OpenAI:
    """Single OpenAI client per process. Same pattern as service_client.
    Without the cache every LLM call (research, refine, hotels, PDF
    days × retries, budget, suggestions) constructed a fresh httpx
    client — for a 14-day PDF build that's ~42 throwaway clients."""
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
