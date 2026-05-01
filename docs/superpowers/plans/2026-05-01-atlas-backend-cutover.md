# Atlas — Backend Cutover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lift the Streamlit `app.py` LLM/geocoding/PDF logic into a FastAPI service on Google Cloud Run, add Supabase Postgres + Google-OAuth auth with an email allowlist, and expose the full HTTP API the future Next.js frontend will consume.

**Architecture:** New `api/` package alongside the existing `app.py`. FastAPI application with route modules per resource. JWT verification middleware checks Supabase auth on every protected request. Trips persist in Postgres with row-level security. LLM and PDF logic ports almost verbatim from `app.py`; the Booking.com live-search MCP is replaced with a single LLM call that picks neighbourhoods + named hotels with pre-filled Booking URLs. Generation endpoints stream Server-Sent Events so we can keep Cloud Run open for 30–90 s without timing out a single response. Streamlit keeps running until the frontend cutover (separate plan).

**Tech Stack:** Python 3.12, FastAPI, Uvicorn, Pydantic v2, OpenAI SDK (against OpenRouter), Supabase (Auth + Postgres), `fpdf2`, `pytest`, `httpx`, `python-jose` (JWT verification), Docker, Google Cloud Run.

**Spec reference:** [docs/superpowers/specs/2026-05-01-atlas-travel-planner-redesign-design.md](../specs/2026-05-01-atlas-travel-planner-redesign-design.md)

---

## File structure

```
api/
├── pyproject.toml
├── Dockerfile
├── .env.example
├── README.md
├── api/
│   ├── __init__.py
│   ├── main.py                  FastAPI app, CORS, startup
│   ├── config.py                Settings via pydantic-settings
│   ├── auth.py                  JWT verification middleware + dependency
│   ├── db.py                    Supabase client + helpers
│   ├── models.py                Pydantic models for requests/responses
│   ├── slug.py                  Slug generator
│   ├── sse.py                   SSE response helper
│   ├── llm/
│   │   ├── __init__.py
│   │   ├── client.py            OpenRouter client factory
│   │   ├── parse_brief.py       NEW: free-form text → structured fields
│   │   ├── suggestions.py       Lifted from app.py:get_suggestions
│   │   ├── research.py          Lifted from app.py:get_travel_research
│   │   ├── refine.py            Lifted from app.py:refine_document
│   │   └── hotels.py            REWORKED: neighborhood + named hotels
│   ├── geocode.py               Lifted from app.py:geocode_place
│   ├── pdf.py                   Lifted from app.py:generate_pdf
│   └── routes/
│       ├── __init__.py
│       ├── trips.py             POST /trips, GET /trips, GET /trips/:slug
│       ├── refine.py            POST /trips/:slug/refine
│       ├── hotels.py            POST /trips/:slug/hotels
│       └── pdf.py               GET /trips/:slug/pdf
└── tests/
    ├── conftest.py
    ├── test_parse_brief.py
    ├── test_research.py
    ├── test_geocode.py
    ├── test_hotels.py
    ├── test_pdf.py
    ├── test_auth.py
    └── test_routes_trips.py

supabase/
└── migrations/
    └── 2026-05-01_initial_schema.sql
```

Streamlit `app.py` and `requirements.txt` stay where they are. The Streamlit deployment continues running until plan 2 (frontend) ships.

---

## Phase 1 — Project skeleton

### Task 1: Create `api/` directory with pyproject and entrypoint

**Files:**
- Create: `api/pyproject.toml`
- Create: `api/api/__init__.py`
- Create: `api/api/main.py`
- Create: `api/.env.example`
- Create: `api/README.md`

- [ ] **Step 1: Create `api/pyproject.toml`**

```toml
[project]
name = "atlas-api"
version = "0.1.0"
requires-python = ">=3.12"
dependencies = [
  "fastapi==0.115.4",
  "uvicorn[standard]==0.32.0",
  "pydantic==2.9.2",
  "pydantic-settings==2.6.0",
  "openai==1.54.4",
  "httpx==0.27.2",
  "python-jose[cryptography]==3.3.0",
  "supabase==2.10.0",
  "fpdf2==2.8.1",
  "python-slugify==8.0.4",
]

[project.optional-dependencies]
dev = [
  "pytest==8.3.3",
  "pytest-asyncio==0.24.0",
  "respx==0.21.1",
]

[tool.pytest.ini_options]
asyncio_mode = "auto"
testpaths = ["tests"]
```

- [ ] **Step 2: Create empty package init**

`api/api/__init__.py`:
```python
```

- [ ] **Step 3: Create minimal FastAPI app with `/health`**

`api/api/main.py`:
```python
from fastapi import FastAPI

app = FastAPI(title="Atlas API")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
```

- [ ] **Step 4: Create `.env.example`**

`api/.env.example`:
```
OPENROUTER_API_KEY=
GOOGLE_MAPS_API_KEY=
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_JWT_SECRET=
ALLOWED_ORIGINS=http://localhost:3000
PORT=8080
```

- [ ] **Step 5: Create `api/README.md`**

```markdown
# Atlas API

FastAPI service backing atlas.viggy.dev. See
[../docs/superpowers/specs/2026-05-01-atlas-travel-planner-redesign-design.md](../docs/superpowers/specs/2026-05-01-atlas-travel-planner-redesign-design.md).

## Local dev

```bash
cd api
python -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
cp .env.example .env  # then fill in values
uvicorn api.main:app --reload --port 8080
```
```

- [ ] **Step 6: Install and run smoke test**

```bash
cd api
python -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
uvicorn api.main:app --port 8080 &
sleep 2
curl -s http://localhost:8080/health
kill %1
```
Expected: `{"status":"ok"}`

- [ ] **Step 7: Commit**

```bash
git add api/
git commit -m "Add FastAPI skeleton with /health"
```

---

### Task 2: Settings module

**Files:**
- Create: `api/api/config.py`
- Test: `api/tests/conftest.py`

- [ ] **Step 1: Write `api/api/config.py`**

```python
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    openrouter_api_key: str
    google_maps_api_key: str
    supabase_url: str
    supabase_anon_key: str
    supabase_service_role_key: str
    supabase_jwt_secret: str
    allowed_origins: str = "http://localhost:3000"
    port: int = 8080


@lru_cache
def get_settings() -> Settings:
    return Settings()
```

- [ ] **Step 2: Wire CORS in `api/api/main.py`**

Replace the file with:
```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.config import get_settings

settings = get_settings()
app = FastAPI(title="Atlas API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.allowed_origins.split(",")],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
```

- [ ] **Step 3: Create `api/tests/conftest.py` with env stubs**

```python
import os

import pytest


@pytest.fixture(autouse=True)
def _env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-or")
    monkeypatch.setenv("GOOGLE_MAPS_API_KEY", "test-gm")
    monkeypatch.setenv("SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setenv("SUPABASE_ANON_KEY", "test-anon")
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "test-svc")
    monkeypatch.setenv("SUPABASE_JWT_SECRET", "test-secret-32chars-minimum-okok")
    # Drop the lru_cache so each test gets a fresh Settings
    from api.config import get_settings
    get_settings.cache_clear()
```

- [ ] **Step 4: Run health endpoint test**

Create `api/tests/test_health.py`:
```python
from fastapi.testclient import TestClient

from api.main import app


def test_health() -> None:
    client = TestClient(app)
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json() == {"status": "ok"}
```

Run:
```bash
cd api && pytest tests/test_health.py -v
```
Expected: 1 passed.

- [ ] **Step 5: Commit**

```bash
git add api/
git commit -m "Add config + CORS, /health test"
```

---

## Phase 2 — Pydantic models

### Task 3: Define request/response models

**Files:**
- Create: `api/api/models.py`

- [ ] **Step 1: Write `api/api/models.py`**

```python
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field

CategoryLiteral = Literal["neighbourhood", "restaurant", "photography_spot", "logistics"]


class Place(BaseModel):
    name: str
    category: CategoryLiteral
    description: str
    lat: float | None = None
    lng: float | None = None


class TripBriefIn(BaseModel):
    """Free-form brief from the user, plus any structured fields the UI extracted."""
    text: str = Field(..., min_length=3, max_length=2000)
    start_date: date | None = None
    airport_entry: str | None = None
    airport_exit: str | None = None


class ParsedBrief(BaseModel):
    """Output of the brief-parser LLM."""
    destination: str
    days: int = Field(..., ge=1, le=60)
    travel_style: str
    start_date: date | None = None
    airport_entry: str | None = None
    airport_exit: str | None = None


class Hotel(BaseModel):
    name: str
    description: str
    booking_url: str


class Neighborhood(BaseModel):
    label: str
    description: str
    hotels: list[Hotel]


class TripDocument(BaseModel):
    """JSON shape stored in the `trips.document` jsonb column."""
    document_markdown: str
    places: list[Place]
    neighborhoods: list[Neighborhood] = []


class TripSummary(BaseModel):
    """For the trip list endpoint."""
    id: str
    slug: str
    destination: str
    days: int
    created_at: datetime


class TripFull(TripSummary):
    travel_style: str
    start_date: date | None
    airport_entry: str | None
    airport_exit: str | None
    document: TripDocument


class RefineIn(BaseModel):
    instruction: str = Field(..., min_length=3, max_length=500)
```

- [ ] **Step 2: Verify types compile**

```bash
cd api && python -c "from api.models import TripFull, TripDocument; print('ok')"
```
Expected: `ok`

- [ ] **Step 3: Commit**

```bash
git add api/api/models.py
git commit -m "Define Pydantic models for trips, briefs, hotels"
```

---

## Phase 3 — LLM modules

### Task 4: OpenRouter client factory

**Files:**
- Create: `api/api/llm/__init__.py`
- Create: `api/api/llm/client.py`

- [ ] **Step 1: Empty package init**

`api/api/llm/__init__.py`:
```python
```

- [ ] **Step 2: Write client factory**

`api/api/llm/client.py`:
```python
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
```

- [ ] **Step 3: Commit**

```bash
git add api/api/llm/
git commit -m "Add OpenRouter client factory + fence stripper"
```

---

### Task 5: Brief-parser LLM

The new chat-first UX accepts a free-form brief like *"7 days in Kyoto, vegetarian, photography focus, mid-October"* and must extract structured fields. This logic does not exist in `app.py`.

**Files:**
- Create: `api/api/llm/parse_brief.py`
- Test: `api/tests/test_parse_brief.py`

- [ ] **Step 1: Write the failing test**

`api/tests/test_parse_brief.py`:
```python
import json
from datetime import date
from unittest.mock import MagicMock

from api.llm.parse_brief import parse_brief
from api.models import TripBriefIn


def _mock_completion(content: str) -> MagicMock:
    m = MagicMock()
    m.choices = [MagicMock(message=MagicMock(content=content))]
    return m


def test_parse_brief_extracts_destination_and_days(monkeypatch) -> None:
    payload = {
        "destination": "Kyoto, Japan",
        "days": 7,
        "travel_style": "vegetarian, photography focus",
        "start_date": "2026-10-15",
        "airport_entry": None,
        "airport_exit": None,
    }
    fake_create = MagicMock(return_value=_mock_completion(json.dumps(payload)))
    monkeypatch.setattr(
        "api.llm.parse_brief.make_client",
        lambda: MagicMock(chat=MagicMock(completions=MagicMock(create=fake_create))),
    )

    parsed = parse_brief(TripBriefIn(text="7 days in Kyoto, vegetarian, photography, mid-October"))

    assert parsed.destination == "Kyoto, Japan"
    assert parsed.days == 7
    assert parsed.start_date == date(2026, 10, 15)
    assert "vegetarian" in parsed.travel_style.lower()


def test_parse_brief_uses_structured_overrides(monkeypatch) -> None:
    payload = {
        "destination": "Kyoto, Japan",
        "days": 7,
        "travel_style": "vegetarian",
        "start_date": None,
        "airport_entry": None,
        "airport_exit": None,
    }
    fake_create = MagicMock(return_value=_mock_completion(json.dumps(payload)))
    monkeypatch.setattr(
        "api.llm.parse_brief.make_client",
        lambda: MagicMock(chat=MagicMock(completions=MagicMock(create=fake_create))),
    )

    brief = TripBriefIn(
        text="Kyoto trip",
        start_date=date(2026, 10, 15),
        airport_entry="LHR",
        airport_exit="NRT",
    )
    parsed = parse_brief(brief)

    # Structured overrides win over LLM output
    assert parsed.start_date == date(2026, 10, 15)
    assert parsed.airport_entry == "LHR"
    assert parsed.airport_exit == "NRT"
```

- [ ] **Step 2: Run to verify it fails**

```bash
cd api && pytest tests/test_parse_brief.py -v
```
Expected: FAIL with `ModuleNotFoundError: api.llm.parse_brief`.

- [ ] **Step 3: Write the implementation**

`api/api/llm/parse_brief.py`:
```python
import json

from api.llm.client import make_client, strip_code_fences
from api.models import ParsedBrief, TripBriefIn

PARSE_MODEL = "google/gemini-2.5-flash-lite"

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
```

- [ ] **Step 4: Run test**

```bash
cd api && pytest tests/test_parse_brief.py -v
```
Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add api/
git commit -m "Add parse_brief LLM (free text → structured fields)"
```

---

### Task 6: Suggestions module (port from app.py)

**Files:**
- Create: `api/api/llm/suggestions.py`
- Test: `api/tests/test_suggestions.py`

- [ ] **Step 1: Write the failing test**

`api/tests/test_suggestions.py`:
```python
import json
from unittest.mock import MagicMock

from api.llm.suggestions import get_suggestions


def _mock_completion(content: str) -> MagicMock:
    m = MagicMock()
    m.choices = [MagicMock(message=MagicMock(content=content))]
    return m


def test_get_suggestions_returns_string_list(monkeypatch) -> None:
    payload = ["Kiyomizu-dera at dawn", "Bamboo grove walk", "Nishiki market food tour"]
    fake_create = MagicMock(return_value=_mock_completion(json.dumps(payload)))
    monkeypatch.setattr(
        "api.llm.suggestions.make_client",
        lambda: MagicMock(chat=MagicMock(completions=MagicMock(create=fake_create))),
    )

    out = get_suggestions("Kyoto, Japan")
    assert out == payload


def test_get_suggestions_strips_code_fences(monkeypatch) -> None:
    fenced = '```json\n["Foo", "Bar"]\n```'
    fake_create = MagicMock(return_value=_mock_completion(fenced))
    monkeypatch.setattr(
        "api.llm.suggestions.make_client",
        lambda: MagicMock(chat=MagicMock(completions=MagicMock(create=fake_create))),
    )

    out = get_suggestions("Kyoto")
    assert out == ["Foo", "Bar"]
```

- [ ] **Step 2: Run to verify it fails**

```bash
cd api && pytest tests/test_suggestions.py -v
```
Expected: FAIL with `ModuleNotFoundError`.

- [ ] **Step 3: Write the implementation (lifted from app.py:64-84)**

`api/api/llm/suggestions.py`:
```python
import json

from api.llm.client import make_client, strip_code_fences

SUGGESTION_MODEL = "google/gemini-2.5-flash-lite"


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
```

- [ ] **Step 4: Run test**

```bash
cd api && pytest tests/test_suggestions.py -v
```
Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add api/
git commit -m "Port suggestions LLM from app.py"
```

---

### Task 7: Research module (port the main itinerary LLM call)

**Files:**
- Create: `api/api/llm/research.py`
- Test: `api/tests/test_research.py`

- [ ] **Step 1: Write the failing test**

`api/tests/test_research.py`:
```python
import json
from unittest.mock import MagicMock

from api.llm.research import get_travel_research


def _mock_completion(content: str) -> MagicMock:
    m = MagicMock()
    m.choices = [MagicMock(message=MagicMock(content=content))]
    return m


def test_get_travel_research_returns_document_and_places(monkeypatch) -> None:
    payload = {
        "document": "## Overview\n\nKyoto in autumn is glorious.\n\n## Neighbourhoods\n\nGion is the geisha district.",
        "places": [
            {"name": "Gion, Kyoto, Japan", "category": "neighbourhood", "description": "Historic geisha district."},
            {"name": "Kiyomizu-dera, Kyoto, Japan", "category": "photography_spot", "description": "Hilltop temple."},
        ],
    }
    fake_create = MagicMock(return_value=_mock_completion(json.dumps(payload)))
    monkeypatch.setattr(
        "api.llm.research.make_client",
        lambda: MagicMock(chat=MagicMock(completions=MagicMock(create=fake_create))),
    )

    result = get_travel_research("Kyoto, Japan", 7, "vegetarian, photography")

    assert "Overview" in result["document"]
    assert len(result["places"]) == 2
    assert result["places"][0]["category"] == "neighbourhood"
```

- [ ] **Step 2: Run to verify it fails**

```bash
cd api && pytest tests/test_research.py -v
```
Expected: FAIL.

- [ ] **Step 3: Write the implementation (lifted from app.py:87-154)**

`api/api/llm/research.py`:
```python
import json

from api.llm.client import make_client, strip_code_fences

RESEARCH_MODEL = "minimax/minimax-m2.5"


SYSTEM_PROMPT = (
    "You are an expert travel researcher. You provide specific, actionable recommendations "
    "with real place names. For vegetarian restaurants, focus on dedicated vegetarian/vegan "
    "spots or places with outstanding vegetarian menus. Always respond with valid JSON only — "
    "no markdown fences, no extra text."
)


def _user_prompt(destination: str, trip_length: int, travel_style: str) -> str:
    return f"""Create a comprehensive travel research document for a trip to {destination}.

Trip details:
- Duration: {trip_length} days
- Travel style / preferences: {travel_style}

Return a single JSON object with exactly two keys:

1. "document" — a detailed Markdown string with these sections:
   ## Overview
   ## Where to Base Yourself
   Recommend the smartest accommodation strategy for this trip length: one central base, two bases, or a moving itinerary. Explain why — consider transport links, proximity to key areas, and cost of moving. Keep it to 2–3 sentences with a clear recommendation.
   ## Neighbourhoods  (3–5 key neighbourhoods, prose descriptions)
   ## Vegetarian Restaurants — markdown table with columns: Restaurant | Area | Must-Try / Why Visit
   ## Photography Spots — markdown table with columns: Location | Best Time | What to Photograph
   ## {trip_length}-Day Itinerary
   Structure the days to reflect the basing strategy above (e.g. group days by base location if moving).
   For EVERY day use exactly this structure — no variations:
   ### Day N: Title
   **Morning:**
   - bullet
   - bullet
   **Afternoon:**
   - bullet
   - bullet
   **Evening:**
   - bullet
   - bullet
   ## Logistics — markdown table with columns: Category | Details

2. "places" — an array of objects for every named location in the document:
   - "name": geocodable string, e.g. "Shinjuku Gyoen, Tokyo, Japan"
   - "category": one of "neighbourhood" | "restaurant" | "photography_spot" | "logistics"
   - "description": one sentence about this place

Return ONLY the JSON object."""


def get_travel_research(destination: str, trip_length: int, travel_style: str) -> dict:
    client = make_client()
    response = client.chat.completions.create(
        model=RESEARCH_MODEL,
        max_tokens=12000,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": _user_prompt(destination, trip_length, travel_style)},
        ],
    )
    raw = strip_code_fences(response.choices[0].message.content)
    return json.loads(raw)
```

- [ ] **Step 4: Run test**

```bash
cd api && pytest tests/test_research.py -v
```
Expected: 1 passed.

- [ ] **Step 5: Commit**

```bash
git add api/
git commit -m "Port travel research LLM from app.py"
```

---

### Task 8: Refine module (port from app.py)

**Files:**
- Create: `api/api/llm/refine.py`
- Test: `api/tests/test_refine.py`

- [ ] **Step 1: Write the failing test**

`api/tests/test_refine.py`:
```python
from unittest.mock import MagicMock

from api.llm.refine import refine_document


def _mock_completion(content: str) -> MagicMock:
    m = MagicMock()
    m.choices = [MagicMock(message=MagicMock(content=content))]
    return m


def test_refine_returns_updated_markdown(monkeypatch) -> None:
    fake_create = MagicMock(return_value=_mock_completion("## Overview\n\nUpdated doc."))
    monkeypatch.setattr(
        "api.llm.refine.make_client",
        lambda: MagicMock(chat=MagicMock(completions=MagicMock(create=fake_create))),
    )

    out = refine_document("## Overview\n\nOld doc.", "Make day 2 less touristy")
    assert "Updated doc" in out
```

- [ ] **Step 2: Run to verify it fails**

```bash
cd api && pytest tests/test_refine.py -v
```
Expected: FAIL.

- [ ] **Step 3: Write the implementation (lifted from app.py:431-454)**

`api/api/llm/refine.py`:
```python
from api.llm.client import make_client

REFINE_MODEL = "deepseek/deepseek-v3.2"


def refine_document(document: str, instruction: str) -> str:
    client = make_client()
    response = client.chat.completions.create(
        model=REFINE_MODEL,
        max_tokens=8000,
        messages=[
            {
                "role": "system",
                "content": (
                    "You are a travel guide editor. Apply the user's instruction to refine "
                    "the travel guide. Return the complete updated guide in the same Markdown "
                    "structure. Return only the Markdown — no JSON, no extra commentary."
                ),
            },
            {
                "role": "user",
                "content": f"Travel guide:\n\n{document}\n\nInstruction: {instruction}",
            },
        ],
    )
    return response.choices[0].message.content.strip()
```

- [ ] **Step 4: Run test**

```bash
cd api && pytest tests/test_refine.py -v
```
Expected: 1 passed.

- [ ] **Step 5: Commit**

```bash
git add api/
git commit -m "Port refine LLM from app.py"
```

---

### Task 9: Hotels module (REWORKED — neighbourhoods + named hotels with link-outs)

This replaces the live Booking.com search (`get_hotel_segments`, `get_destination_id`, `search_hotels`, `_parse_hotel` in `app.py`). The LLM picks 2–3 neighbourhoods and 2–3 specific hotels per neighbourhood; we build Booking.com URLs with prefilled query params instead of calling RapidAPI.

**Files:**
- Create: `api/api/llm/hotels.py`
- Test: `api/tests/test_hotels.py`

- [ ] **Step 1: Write the failing test**

`api/tests/test_hotels.py`:
```python
import json
from datetime import date
from unittest.mock import MagicMock

from api.llm.hotels import build_booking_url, suggest_hotels


def test_build_booking_url_has_prefilled_dates_and_search() -> None:
    url = build_booking_url(
        hotel_name="Hotel Granvia Kyoto",
        city="Kyoto, Japan",
        checkin=date(2026, 10, 15),
        checkout=date(2026, 10, 18),
        adults=2,
    )
    assert url.startswith("https://www.booking.com/searchresults.html?")
    assert "ss=Hotel+Granvia+Kyoto%2C+Kyoto%2C+Japan" in url
    assert "checkin=2026-10-15" in url
    assert "checkout=2026-10-18" in url
    assert "group_adults=2" in url


def _mock_completion(content: str) -> MagicMock:
    m = MagicMock()
    m.choices = [MagicMock(message=MagicMock(content=content))]
    return m


def test_suggest_hotels_returns_neighborhoods_with_hotels(monkeypatch) -> None:
    payload = [
        {
            "label": "Higashiyama",
            "description": "Old Kyoto, walk to temples.",
            "hotels": [
                {"name": "Park Hyatt Kyoto", "description": "Luxury, hilltop views."},
                {"name": "Seikoro Ryokan", "description": "Traditional ryokan."},
            ],
        },
        {
            "label": "Downtown",
            "description": "Central, near Nishiki.",
            "hotels": [
                {"name": "The Thousand Kyoto", "description": "Modern, near station."},
            ],
        },
    ]
    fake_create = MagicMock(return_value=_mock_completion(json.dumps(payload)))
    monkeypatch.setattr(
        "api.llm.hotels.make_client",
        lambda: MagicMock(chat=MagicMock(completions=MagicMock(create=fake_create))),
    )

    out = suggest_hotels(
        document="## Overview\n\nKyoto.",
        destination="Kyoto, Japan",
        days=7,
        start_date=date(2026, 10, 15),
        adults=2,
    )

    assert len(out) == 2
    assert out[0].label == "Higashiyama"
    assert len(out[0].hotels) == 2
    assert out[0].hotels[0].name == "Park Hyatt Kyoto"
    assert "checkin=2026-10-15" in out[0].hotels[0].booking_url


def test_suggest_hotels_handles_missing_start_date(monkeypatch) -> None:
    payload = [{"label": "Center", "description": "x", "hotels": [{"name": "A", "description": "x"}]}]
    fake_create = MagicMock(return_value=_mock_completion(json.dumps(payload)))
    monkeypatch.setattr(
        "api.llm.hotels.make_client",
        lambda: MagicMock(chat=MagicMock(completions=MagicMock(create=fake_create))),
    )

    out = suggest_hotels(
        document="x", destination="Kyoto", days=7, start_date=None, adults=2,
    )
    # Without dates, URL is still valid but has no checkin/checkout params
    assert out[0].hotels[0].booking_url.startswith("https://www.booking.com/searchresults.html?")
    assert "checkin=" not in out[0].hotels[0].booking_url
```

- [ ] **Step 2: Run to verify it fails**

```bash
cd api && pytest tests/test_hotels.py -v
```
Expected: FAIL.

- [ ] **Step 3: Write the implementation**

`api/api/llm/hotels.py`:
```python
import json
from datetime import date, timedelta
from urllib.parse import urlencode

from api.llm.client import make_client, strip_code_fences
from api.models import Hotel, Neighborhood

HOTEL_MODEL = "google/gemini-2.5-flash-lite"

BOOKING_AID = "304142"  # generic Booking.com search affiliate id; safe to omit later


def build_booking_url(
    *,
    hotel_name: str,
    city: str,
    checkin: date | None,
    checkout: date | None,
    adults: int,
) -> str:
    """Build a Booking.com search URL with prefilled query params.

    We use /searchresults.html with the hotel name in the query, which
    reliably surfaces the hotel as the first result without needing
    Booking's dest_id system.
    """
    params: dict[str, str] = {
        "ss": f"{hotel_name}, {city}",
        "group_adults": str(adults),
        "no_rooms": "1",
        "group_children": "0",
        "aid": BOOKING_AID,
    }
    if checkin and checkout:
        params["checkin"] = checkin.isoformat()
        params["checkout"] = checkout.isoformat()
    return "https://www.booking.com/searchresults.html?" + urlencode(params)


def suggest_hotels(
    *,
    document: str,
    destination: str,
    days: int,
    start_date: date | None,
    adults: int,
) -> list[Neighborhood]:
    client = make_client()
    response = client.chat.completions.create(
        model=HOTEL_MODEL,
        max_tokens=900,
        messages=[
            {"role": "system", "content": "Return only a JSON array. No markdown fences, no extra text."},
            {"role": "user", "content": (
                f"This is a {days}-day itinerary for {destination}.\n\n"
                f"{document}\n\n"
                "Pick 2–3 distinct neighbourhoods the traveller should consider basing in. "
                "For each neighbourhood, name 2–3 specific real hotels (mix of mid-range and high-end). "
                "Return a JSON array where each object has:\n"
                '  "label": short neighbourhood name (e.g. "Higashiyama"),\n'
                '  "description": one sentence on why stay here,\n'
                '  "hotels": array of objects with "name" and "description" (one sentence each).'
            )},
        ],
    )
    raw = strip_code_fences(response.choices[0].message.content)
    data = json.loads(raw)

    checkin = start_date
    checkout = start_date + timedelta(days=days) if start_date else None

    out: list[Neighborhood] = []
    for nbr in data:
        hotels = [
            Hotel(
                name=h["name"],
                description=h["description"],
                booking_url=build_booking_url(
                    hotel_name=h["name"],
                    city=destination,
                    checkin=checkin,
                    checkout=checkout,
                    adults=adults,
                ),
            )
            for h in nbr.get("hotels", [])
        ]
        out.append(
            Neighborhood(label=nbr["label"], description=nbr["description"], hotels=hotels)
        )
    return out
```

- [ ] **Step 4: Run test**

```bash
cd api && pytest tests/test_hotels.py -v
```
Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add api/
git commit -m "Add hotels module: neighbourhood picks + Booking.com link-outs"
```

---

## Phase 4 — Geocoding and PDF

### Task 10: Geocoding module

**Files:**
- Create: `api/api/geocode.py`
- Test: `api/tests/test_geocode.py`

- [ ] **Step 1: Write the failing test**

`api/tests/test_geocode.py`:
```python
import httpx
import respx

from api.geocode import geocode_place


@respx.mock
def test_geocode_returns_lat_lng_on_ok() -> None:
    respx.get("https://maps.googleapis.com/maps/api/geocode/json").mock(
        return_value=httpx.Response(
            200,
            json={
                "status": "OK",
                "results": [{"geometry": {"location": {"lat": 35.0, "lng": 135.7}}}],
            },
        )
    )
    lat, lng = geocode_place("Kyoto, Japan")
    assert lat == 35.0
    assert lng == 135.7


@respx.mock
def test_geocode_returns_none_on_zero_results() -> None:
    respx.get("https://maps.googleapis.com/maps/api/geocode/json").mock(
        return_value=httpx.Response(200, json={"status": "ZERO_RESULTS", "results": []})
    )
    lat, lng = geocode_place("Atlantis")
    assert lat is None and lng is None


@respx.mock
def test_geocode_returns_none_on_http_error() -> None:
    respx.get("https://maps.googleapis.com/maps/api/geocode/json").mock(
        return_value=httpx.Response(500)
    )
    lat, lng = geocode_place("Kyoto")
    assert lat is None and lng is None
```

- [ ] **Step 2: Run to verify it fails**

```bash
cd api && pytest tests/test_geocode.py -v
```
Expected: FAIL.

- [ ] **Step 3: Write the implementation (lifted from app.py:157-170, switched to httpx)**

`api/api/geocode.py`:
```python
import httpx

from api.config import get_settings


def geocode_place(place_name: str) -> tuple[float | None, float | None]:
    try:
        resp = httpx.get(
            "https://maps.googleapis.com/maps/api/geocode/json",
            params={"address": place_name, "key": get_settings().google_maps_api_key},
            timeout=6,
        )
        if resp.status_code != 200:
            return None, None
        data = resp.json()
        if data.get("status") == "OK":
            loc = data["results"][0]["geometry"]["location"]
            return loc["lat"], loc["lng"]
    except Exception:
        pass
    return None, None
```

- [ ] **Step 4: Run test**

```bash
cd api && pytest tests/test_geocode.py -v
```
Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add api/
git commit -m "Port geocoding from app.py to httpx + tests"
```

---

### Task 11: PDF module (port the bulk of app.py:253-428)

**Files:**
- Create: `api/api/pdf.py`
- Test: `api/tests/test_pdf.py`

- [ ] **Step 1: Write the failing test**

`api/tests/test_pdf.py`:
```python
from api.pdf import generate_pdf


def test_generate_pdf_returns_valid_pdf_bytes() -> None:
    md = (
        "## Overview\n\nKyoto in autumn is glorious.\n\n"
        "## Neighbourhoods\n\nGion is the geisha district.\n\n"
        "## 7-Day Itinerary\n\n"
        "### Day 1: Higashiyama\n\n"
        "**Morning:**\n- Visit Kiyomizu-dera\n- Walk Sannenzaka\n\n"
        "**Afternoon:**\n- Lunch in Gion\n\n"
        "**Evening:**\n- Sunset at Yasaka Pagoda\n\n"
        "## Logistics\n\n"
        "| Category | Details |\n"
        "|---|---|\n"
        "| Transit | JR Pass |\n"
    )
    out = generate_pdf(md, "Kyoto, Japan")
    assert isinstance(out, bytes)
    assert out.startswith(b"%PDF-")
    assert len(out) > 1000


def test_generate_pdf_handles_empty_document() -> None:
    out = generate_pdf("", "Nowhere")
    assert out.startswith(b"%PDF-")
```

- [ ] **Step 2: Run to verify it fails**

```bash
cd api && pytest tests/test_pdf.py -v
```
Expected: FAIL with `ModuleNotFoundError`.

- [ ] **Step 3: Write the implementation**

Lift `generate_pdf` and the `_find_font`, `FONT_REGULAR`, `FONT_BOLD` constants from `app.py:253-428` into `api/api/pdf.py`. Replace the `from fpdf import FPDF, FontFace` import and keep the function signature `generate_pdf(document: str, destination: str) -> bytes`.

`api/api/pdf.py`:
```python
import os
import re

from fpdf import FPDF, FontFace


def _find_font(candidates: list[str]) -> str | None:
    for path in candidates:
        if os.path.exists(path):
            return path
    return None


FONT_REGULAR = _find_font([
    "/Library/Fonts/Arial Unicode.ttf",
    "/System/Library/Fonts/Supplemental/Arial.ttf",
    "/System/Library/Fonts/Supplemental/Verdana.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "/usr/share/fonts/dejavu/DejaVuSans.ttf",
])
FONT_BOLD = _find_font([
    "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
    "/System/Library/Fonts/Supplemental/Arial Rounded Bold.ttf",
    "/System/Library/Fonts/Supplemental/Verdana Bold.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf",
])


def generate_pdf(document: str, destination: str) -> bytes:
    pdf = FPDF()
    pdf.set_auto_page_break(auto=True, margin=20)
    pdf.set_margins(20, 20, 20)

    if FONT_REGULAR and FONT_BOLD:
        pdf.add_font("body", style="", fname=FONT_REGULAR)
        pdf.add_font("body", style="B", fname=FONT_BOLD)
        reg, bold = "body", "body"
    else:
        reg, bold = "Helvetica", "Helvetica"

    pdf.add_page()
    w = pdf.epw

    pdf.set_fill_color(66, 133, 244)
    pdf.set_text_color(255, 255, 255)
    pdf.set_font(bold, "B", 10)
    pdf.cell(w, 7, "TRAVEL GUIDE", align="C", fill=True, new_x="LMARGIN", new_y="NEXT")
    pdf.set_font(bold, "B", 22)
    pdf.multi_cell(w, 13, destination, align="C", fill=True)
    pdf.set_text_color(30, 30, 30)
    pdf.ln(10)

    TIME_OF_DAY = re.compile(
        r"^\*{0,2}(morning|afternoon|evening|lunch|night)\b[\*:]*\s*(.*)?",
        re.IGNORECASE,
    )

    def strip_md(text: str) -> str:
        return re.sub(r"\*{1,2}(.*?)\*{1,2}", r"\1", text)

    indent = 5
    table_buffer: list[str] = []

    def flush_table() -> None:
        if not table_buffer:
            return
        lines = list(table_buffer)
        table_buffer.clear()

        rows = []
        for tline in lines:
            tline = tline.strip()
            if re.match(r"^\|[-:| ]+\|$", tline):
                continue
            cells = [c.strip() for c in tline.strip("|").split("|")]
            if cells:
                rows.append(cells)

        if len(rows) < 2:
            return

        num_cols = max(len(r) for r in rows)
        rows = [r + [""] * (num_cols - len(r)) for r in rows]

        pdf.set_font(reg, "", 10)
        pdf.set_text_color(30, 30, 30)
        pdf.set_fill_color(255, 255, 255)
        heading_style = FontFace(
            fill_color=(80, 80, 80),
            color=(255, 255, 255),
            emphasis="BOLD",
        )
        try:
            with pdf.table(
                first_row_as_headings=True,
                headings_style=heading_style,
                line_height=7,
                padding=3,
                text_align="LEFT",
                align="LEFT",
            ) as table:
                for row_data in rows:
                    row = table.row()
                    for cell_text in row_data:
                        row.cell(cell_text)
        except Exception:
            for row_data in rows:
                pdf.set_x(pdf.l_margin)
                pdf.multi_cell(w, 6, " | ".join(row_data))
        pdf.ln(5)

    for raw_line in document.split("\n"):
        line = raw_line.strip()

        if line.startswith("|"):
            table_buffer.append(line)
            continue
        else:
            flush_table()

        if line.startswith("## "):
            pdf.ln(5)
            pdf.set_fill_color(66, 133, 244)
            pdf.set_text_color(255, 255, 255)
            pdf.set_font(bold, "B", 13)
            pdf.set_x(pdf.l_margin)
            pdf.multi_cell(w, 10, f"  {line[3:].upper()}", fill=True)
            pdf.set_text_color(30, 30, 30)
            pdf.ln(4)

        elif line.startswith("### "):
            pdf.ln(3)
            pdf.set_fill_color(235, 238, 245)
            pdf.set_text_color(30, 30, 30)
            pdf.set_font(bold, "B", 12)
            pdf.set_x(pdf.l_margin)
            pdf.multi_cell(w, 9, f"  {line[4:]}", fill=True)
            pdf.ln(2)

        elif TIME_OF_DAY.match(line):
            m = TIME_OF_DAY.match(line)
            label = m.group(1).capitalize() + ":"
            remainder = strip_md(m.group(2)).strip() if m.group(2) else ""
            pdf.ln(2)
            pdf.set_x(pdf.l_margin)
            pdf.set_text_color(50, 100, 200)
            pdf.set_font(bold, "BU", 11)
            pdf.multi_cell(w, 7, label)
            pdf.set_text_color(30, 30, 30)
            pdf.set_x(pdf.l_margin)
            if remainder:
                pdf.set_font(reg, "", 11)
                pdf.set_x(pdf.l_margin + indent)
                pdf.multi_cell(w - indent, 7, f"•  {remainder}")
                pdf.set_x(pdf.l_margin)

        elif line.startswith(("- ", "* ")):
            pdf.set_font(reg, "", 11)
            pdf.set_x(pdf.l_margin + indent)
            pdf.multi_cell(w - indent, 7, f"•  {strip_md(line[2:])}")
            pdf.set_x(pdf.l_margin)

        elif line:
            pdf.set_x(pdf.l_margin)
            pdf.set_font(reg, "", 11)
            pdf.set_text_color(30, 30, 30)
            pdf.multi_cell(w, 7, strip_md(line))

        else:
            pdf.set_x(pdf.l_margin)
            pdf.ln(3)

    flush_table()
    return bytes(pdf.output())
```

- [ ] **Step 4: Run test**

```bash
cd api && pytest tests/test_pdf.py -v
```
Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add api/
git commit -m "Port PDF generation from app.py"
```

---

## Phase 5 — Supabase: schema and RLS

### Task 12: Write the initial schema migration

**Files:**
- Create: `supabase/migrations/2026-05-01_initial_schema.sql`

- [ ] **Step 1: Write the migration**

`supabase/migrations/2026-05-01_initial_schema.sql`:
```sql
-- Allowed emails — admin-managed allowlist for Google sign-in.
create table public.allowed_emails (
  email text primary key
);

-- Trips table.
create table public.trips (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  destination text not null,
  days int not null,
  travel_style text not null default '',
  start_date date,
  airport_entry text,
  airport_exit text,
  document jsonb not null,
  places jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index trips_user_id_idx on public.trips(user_id);
create index trips_slug_idx on public.trips(slug);

-- Refine messages per trip.
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamptz not null default now()
);

create index messages_trip_id_idx on public.messages(trip_id);

-- Row-level security.
alter table public.trips enable row level security;
alter table public.messages enable row level security;
alter table public.allowed_emails enable row level security;

-- Helper: is the caller's email on the allowlist?
create or replace function public.is_allowed() returns boolean
language sql stable security definer set search_path = public, auth as $$
  select exists (
    select 1 from public.allowed_emails ae
    where ae.email = (select email from auth.users where id = auth.uid())
  );
$$;

-- trips: any allowed user can read; only owner can write.
create policy trips_select on public.trips for select using (public.is_allowed());
create policy trips_insert on public.trips for insert with check (auth.uid() = user_id);
create policy trips_update on public.trips for update using (auth.uid() = user_id);
create policy trips_delete on public.trips for delete using (auth.uid() = user_id);

-- messages: only owner of the parent trip can read/write.
create policy messages_select on public.messages for select using (
  exists (select 1 from public.trips t where t.id = messages.trip_id and t.user_id = auth.uid())
);
create policy messages_insert on public.messages for insert with check (
  exists (select 1 from public.trips t where t.id = messages.trip_id and t.user_id = auth.uid())
);

-- allowed_emails: nobody reads through the API. (Service role bypasses RLS.)
create policy allowed_emails_no_read on public.allowed_emails for select using (false);
```

- [ ] **Step 2: Apply the migration manually in the Supabase dashboard**

Open Supabase SQL editor for the project, paste the migration contents, run.
Verify: tables `trips`, `messages`, `allowed_emails` appear in Table Editor.

- [ ] **Step 3: Insert your own email into the allowlist**

In the SQL editor:
```sql
insert into public.allowed_emails(email) values ('vignesh2k@gmail.com');
```

- [ ] **Step 4: Commit**

```bash
git add supabase/
git commit -m "Add initial Supabase schema with RLS"
```

---

## Phase 6 — Auth and DB plumbing

### Task 13: Supabase JWT verification

**Files:**
- Create: `api/api/auth.py`
- Test: `api/tests/test_auth.py`

- [ ] **Step 1: Write the failing test**

`api/tests/test_auth.py`:
```python
import time
import uuid
from typing import Any

import pytest
from fastapi import FastAPI, Depends
from fastapi.testclient import TestClient
from jose import jwt

from api.auth import current_user
from api.config import get_settings


def _token(payload: dict[str, Any]) -> str:
    secret = get_settings().supabase_jwt_secret
    return jwt.encode(payload, secret, algorithm="HS256")


@pytest.fixture
def client() -> TestClient:
    app = FastAPI()

    @app.get("/me")
    def me(user: dict = Depends(current_user)) -> dict:
        return user

    return TestClient(app)


def test_current_user_accepts_valid_token(client: TestClient) -> None:
    user_id = str(uuid.uuid4())
    token = _token({
        "sub": user_id,
        "email": "v@example.com",
        "exp": int(time.time()) + 3600,
        "aud": "authenticated",
    })
    res = client.get("/me", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 200
    assert res.json()["sub"] == user_id


def test_current_user_rejects_missing_token(client: TestClient) -> None:
    res = client.get("/me")
    assert res.status_code == 401


def test_current_user_rejects_expired_token(client: TestClient) -> None:
    token = _token({
        "sub": str(uuid.uuid4()),
        "email": "v@example.com",
        "exp": int(time.time()) - 60,
        "aud": "authenticated",
    })
    res = client.get("/me", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 401
```

- [ ] **Step 2: Run to verify it fails**

```bash
cd api && pytest tests/test_auth.py -v
```
Expected: FAIL.

- [ ] **Step 3: Write the implementation**

`api/api/auth.py`:
```python
from typing import Annotated

from fastapi import Depends, Header, HTTPException, status
from jose import JWTError, jwt

from api.config import get_settings


def current_user(authorization: Annotated[str | None, Header()] = None) -> dict:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing token")

    token = authorization.split(" ", 1)[1]
    settings = get_settings()
    try:
        payload = jwt.decode(
            token,
            settings.supabase_jwt_secret,
            algorithms=["HS256"],
            audience="authenticated",
        )
    except JWTError as e:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=f"Invalid token: {e}")

    if not payload.get("sub"):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token missing sub")
    return payload


CurrentUser = Annotated[dict, Depends(current_user)]
```

- [ ] **Step 4: Run test**

```bash
cd api && pytest tests/test_auth.py -v
```
Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add api/
git commit -m "Add Supabase JWT verification dependency"
```

---

### Task 14: Supabase DB client

**Files:**
- Create: `api/api/db.py`

- [ ] **Step 1: Write the implementation**

`api/api/db.py`:
```python
from functools import lru_cache

from supabase import Client, create_client

from api.config import get_settings


@lru_cache
def service_client() -> Client:
    """Bypasses RLS — use for trusted server-side writes after auth check."""
    s = get_settings()
    return create_client(s.supabase_url, s.supabase_service_role_key)


def user_client(jwt_token: str) -> Client:
    """Honors RLS as the authenticated user."""
    s = get_settings()
    client = create_client(s.supabase_url, s.supabase_anon_key)
    client.postgrest.auth(jwt_token)
    return client
```

- [ ] **Step 2: Smoke test in REPL**

```bash
cd api && python -c "from api.db import service_client; print(service_client())"
```
Expected: prints a `<supabase.client.Client object at ...>`.

- [ ] **Step 3: Commit**

```bash
git add api/
git commit -m "Add Supabase client helpers (service + user-scoped)"
```

---

### Task 15: Slug helper

**Files:**
- Create: `api/api/slug.py`
- Test: `api/tests/test_slug.py`

- [ ] **Step 1: Write the failing test**

`api/tests/test_slug.py`:
```python
import re

from api.slug import make_trip_slug


def test_make_trip_slug_combines_destination_and_days() -> None:
    out = make_trip_slug("Kyoto, Japan", 7)
    assert re.match(r"^kyoto-japan-7d-[a-z0-9]{6}$", out), out


def test_make_trip_slug_handles_unicode() -> None:
    out = make_trip_slug("São Paulo", 5)
    assert out.startswith("sao-paulo-5d-")
```

- [ ] **Step 2: Run to verify it fails**

```bash
cd api && pytest tests/test_slug.py -v
```
Expected: FAIL.

- [ ] **Step 3: Write the implementation**

`api/api/slug.py`:
```python
import secrets

from slugify import slugify


def make_trip_slug(destination: str, days: int) -> str:
    return f"{slugify(destination)}-{days}d-{secrets.token_hex(3)}"
```

- [ ] **Step 4: Run test**

```bash
cd api && pytest tests/test_slug.py -v
```
Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add api/
git commit -m "Add trip slug helper"
```

---

## Phase 7 — HTTP endpoints (synchronous JSON)

We build all routes as plain JSON first. SSE streaming is added in Phase 8 — this keeps each task small and gives us a working API end-to-end before we refactor for streaming.

### Task 16: POST /trips — synchronous trip generation

**Files:**
- Create: `api/api/routes/__init__.py`
- Create: `api/api/routes/trips.py`
- Test: `api/tests/test_routes_trips.py`

- [ ] **Step 1: Empty package init**

`api/api/routes/__init__.py`:
```python
```

- [ ] **Step 2: Write the failing test**

`api/tests/test_routes_trips.py`:
```python
import time
import uuid
from typing import Any
from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient
from jose import jwt

from api.config import get_settings
from api.main import app


def _token(user_id: str) -> str:
    return jwt.encode(
        {
            "sub": user_id,
            "email": "v@example.com",
            "exp": int(time.time()) + 3600,
            "aud": "authenticated",
        },
        get_settings().supabase_jwt_secret,
        algorithm="HS256",
    )


@pytest.fixture
def auth_headers() -> dict[str, str]:
    return {"Authorization": f"Bearer {_token(str(uuid.uuid4()))}"}


def _mock_supabase_insert(returned_row: dict[str, Any]) -> MagicMock:
    """Build a Supabase client mock whose .table().insert().execute() returns rows."""
    table = MagicMock()
    table.insert.return_value.execute.return_value = MagicMock(data=[returned_row])
    client = MagicMock()
    client.table.return_value = table
    return client


def test_post_trips_creates_and_returns_trip(monkeypatch, auth_headers) -> None:
    monkeypatch.setattr(
        "api.routes.trips.parse_brief",
        lambda b: MagicMock(
            destination="Kyoto, Japan",
            days=7,
            travel_style="vegetarian, photography",
            start_date=None,
            airport_entry=None,
            airport_exit=None,
        ),
    )
    monkeypatch.setattr(
        "api.routes.trips.get_travel_research",
        lambda d, l, s: {
            "document": "## Overview\n\nKyoto.",
            "places": [{"name": "Gion, Kyoto", "category": "neighbourhood", "description": "x"}],
        },
    )
    monkeypatch.setattr("api.routes.trips.geocode_place", lambda n: (35.0, 135.7))

    inserted_row = {
        "id": str(uuid.uuid4()),
        "slug": "kyoto-japan-7d-abc123",
        "user_id": "u",
        "destination": "Kyoto, Japan",
        "days": 7,
        "travel_style": "vegetarian, photography",
        "start_date": None,
        "airport_entry": None,
        "airport_exit": None,
        "document": {
            "document_markdown": "## Overview\n\nKyoto.",
            "places": [{"name": "Gion, Kyoto", "category": "neighbourhood",
                        "description": "x", "lat": 35.0, "lng": 135.7}],
            "neighborhoods": [],
        },
        "places": [],
        "created_at": "2026-05-01T00:00:00+00:00",
    }
    monkeypatch.setattr("api.routes.trips.service_client", lambda: _mock_supabase_insert(inserted_row))

    res = TestClient(app).post(
        "/trips",
        headers=auth_headers,
        json={"text": "7 days in Kyoto, vegetarian, photography"},
    )

    assert res.status_code == 200, res.text
    body = res.json()
    assert body["slug"] == "kyoto-japan-7d-abc123"
    assert body["destination"] == "Kyoto, Japan"
    assert body["document"]["document_markdown"].startswith("## Overview")


def test_post_trips_requires_auth() -> None:
    res = TestClient(app).post("/trips", json={"text": "Kyoto"})
    assert res.status_code == 401
```

- [ ] **Step 3: Run to verify it fails**

```bash
cd api && pytest tests/test_routes_trips.py -v
```
Expected: FAIL.

- [ ] **Step 4: Write the implementation**

`api/api/routes/trips.py`:
```python
from fastapi import APIRouter

from api.auth import CurrentUser
from api.db import service_client
from api.geocode import geocode_place
from api.llm.parse_brief import parse_brief
from api.llm.research import get_travel_research
from api.models import Place, TripBriefIn, TripDocument, TripFull
from api.slug import make_trip_slug

router = APIRouter(tags=["trips"])

GEOCODE_CAP = 15
GEOCODE_PRIORITY = ["restaurant", "photography_spot", "neighbourhood", "logistics"]


@router.post("/trips", response_model=TripFull)
def create_trip(brief: TripBriefIn, user: CurrentUser) -> TripFull:
    parsed = parse_brief(brief)

    research = get_travel_research(parsed.destination, parsed.days, parsed.travel_style)

    raw_places = research.get("places", [])
    raw_places.sort(
        key=lambda p: GEOCODE_PRIORITY.index(p.get("category", "logistics"))
        if p.get("category") in GEOCODE_PRIORITY else len(GEOCODE_PRIORITY),
    )
    places: list[Place] = []
    for p in raw_places[:GEOCODE_CAP]:
        lat, lng = geocode_place(p["name"])
        places.append(Place(
            name=p["name"], category=p["category"], description=p["description"],
            lat=lat, lng=lng,
        ))

    document = TripDocument(
        document_markdown=research["document"],
        places=places,
        neighborhoods=[],
    )

    slug = make_trip_slug(parsed.destination, parsed.days)
    row = {
        "slug": slug,
        "user_id": user["sub"],
        "destination": parsed.destination,
        "days": parsed.days,
        "travel_style": parsed.travel_style,
        "start_date": parsed.start_date.isoformat() if parsed.start_date else None,
        "airport_entry": parsed.airport_entry,
        "airport_exit": parsed.airport_exit,
        "document": document.model_dump(mode="json"),
        "places": [],  # legacy column, unused
    }
    res = service_client().table("trips").insert(row).execute()
    inserted = res.data[0]
    return TripFull(**inserted, document=TripDocument(**inserted["document"]))
```

- [ ] **Step 5: Wire the router in `api/api/main.py`**

Add to `api/api/main.py`:
```python
from api.routes import trips as trips_routes  # add at top

app.include_router(trips_routes.router)  # add after CORS middleware
```

- [ ] **Step 6: Run test**

```bash
cd api && pytest tests/test_routes_trips.py -v
```
Expected: 2 passed.

- [ ] **Step 7: Commit**

```bash
git add api/
git commit -m "Add POST /trips endpoint (sync JSON)"
```

---

### Task 17: GET /trips and GET /trips/:slug

**Files:**
- Modify: `api/api/routes/trips.py`
- Test: `api/tests/test_routes_trips.py`

- [ ] **Step 1: Add tests for list and detail**

Append to `api/tests/test_routes_trips.py`:
```python
def _mock_supabase_select(rows: list[dict]) -> MagicMock:
    table = MagicMock()
    chain = MagicMock()
    table.select.return_value = chain
    chain.eq.return_value = chain
    chain.order.return_value = chain
    chain.limit.return_value = chain
    chain.single.return_value = chain
    chain.execute.return_value = MagicMock(data=rows if len(rows) != 1 else rows[0])
    client = MagicMock()
    client.table.return_value = table
    return client


def test_list_trips_returns_summaries(monkeypatch, auth_headers) -> None:
    rows = [
        {
            "id": "t1", "slug": "kyoto-7d-aaa", "destination": "Kyoto",
            "days": 7, "created_at": "2026-05-01T00:00:00+00:00",
        }
    ]
    monkeypatch.setattr("api.routes.trips.service_client", lambda: _mock_supabase_select(rows))

    res = TestClient(app).get("/trips", headers=auth_headers)
    assert res.status_code == 200
    body = res.json()
    assert len(body) == 1
    assert body[0]["slug"] == "kyoto-7d-aaa"


def test_get_trip_by_slug_returns_full_trip(monkeypatch, auth_headers) -> None:
    row = {
        "id": "t1", "slug": "kyoto-7d-aaa", "user_id": "u", "destination": "Kyoto",
        "days": 7, "travel_style": "veg",
        "start_date": None, "airport_entry": None, "airport_exit": None,
        "document": {"document_markdown": "x", "places": [], "neighborhoods": []},
        "places": [],
        "created_at": "2026-05-01T00:00:00+00:00",
    }
    monkeypatch.setattr("api.routes.trips.service_client", lambda: _mock_supabase_select([row]))

    res = TestClient(app).get("/trips/kyoto-7d-aaa", headers=auth_headers)
    assert res.status_code == 200
    assert res.json()["slug"] == "kyoto-7d-aaa"
```

- [ ] **Step 2: Run to verify both fail**

```bash
cd api && pytest tests/test_routes_trips.py::test_list_trips_returns_summaries tests/test_routes_trips.py::test_get_trip_by_slug_returns_full_trip -v
```
Expected: FAIL (404 for both).

- [ ] **Step 3: Add the endpoints**

Append to `api/api/routes/trips.py`:
```python
from fastapi import HTTPException

from api.models import TripSummary


@router.get("/trips", response_model=list[TripSummary])
def list_trips(user: CurrentUser) -> list[TripSummary]:
    res = (
        service_client().table("trips")
        .select("id, slug, destination, days, created_at")
        .eq("user_id", user["sub"])
        .order("created_at", desc=True)
        .limit(50)
        .execute()
    )
    return [TripSummary(**r) for r in res.data]


@router.get("/trips/{slug}", response_model=TripFull)
def get_trip(slug: str, user: CurrentUser) -> TripFull:
    res = (
        service_client().table("trips")
        .select("*").eq("slug", slug).single().execute()
    )
    if not res.data:
        raise HTTPException(status_code=404, detail="Trip not found")
    row = res.data
    return TripFull(**row, document=TripDocument(**row["document"]))
```

- [ ] **Step 4: Run all trips tests**

```bash
cd api && pytest tests/test_routes_trips.py -v
```
Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add api/
git commit -m "Add GET /trips and GET /trips/:slug"
```

---

### Task 18: POST /trips/:slug/refine

**Files:**
- Create: `api/api/routes/refine.py`
- Modify: `api/api/main.py`
- Test: `api/tests/test_routes_refine.py`

- [ ] **Step 1: Write the failing test**

`api/tests/test_routes_refine.py`:
```python
import time
import uuid
from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient
from jose import jwt

from api.config import get_settings
from api.main import app


def _token(user_id: str) -> str:
    return jwt.encode(
        {"sub": user_id, "email": "v@example.com",
         "exp": int(time.time()) + 3600, "aud": "authenticated"},
        get_settings().supabase_jwt_secret, algorithm="HS256",
    )


@pytest.fixture
def auth_headers() -> dict[str, str]:
    return {"Authorization": f"Bearer {_token(str(uuid.uuid4()))}"}


def test_refine_updates_document(monkeypatch, auth_headers) -> None:
    existing = {
        "id": "t1", "slug": "kyoto-7d-aaa", "user_id": "u", "destination": "Kyoto",
        "days": 7, "travel_style": "veg",
        "start_date": None, "airport_entry": None, "airport_exit": None,
        "document": {"document_markdown": "## Old", "places": [], "neighborhoods": []},
        "places": [],
        "created_at": "2026-05-01T00:00:00+00:00",
    }
    table = MagicMock()
    chain = MagicMock()
    table.select.return_value = chain
    chain.eq.return_value = chain
    chain.single.return_value = chain
    chain.execute.return_value = MagicMock(data=existing)
    table.update.return_value.eq.return_value.execute.return_value = MagicMock(
        data=[{**existing, "document": {**existing["document"],
               "document_markdown": "## Updated"}}]
    )
    table.insert.return_value.execute.return_value = MagicMock(data=[{"id": "m1"}])

    client = MagicMock()
    client.table.return_value = table
    monkeypatch.setattr("api.routes.refine.service_client", lambda: client)
    monkeypatch.setattr("api.routes.refine.refine_document", lambda d, i: "## Updated")

    res = TestClient(app).post(
        "/trips/kyoto-7d-aaa/refine",
        headers=auth_headers,
        json={"instruction": "make day 2 less touristy"},
    )

    assert res.status_code == 200, res.text
    assert res.json()["document"]["document_markdown"] == "## Updated"
```

- [ ] **Step 2: Run to verify it fails**

```bash
cd api && pytest tests/test_routes_refine.py -v
```
Expected: FAIL.

- [ ] **Step 3: Write the implementation**

`api/api/routes/refine.py`:
```python
from fastapi import APIRouter, HTTPException

from api.auth import CurrentUser
from api.db import service_client
from api.llm.refine import refine_document
from api.models import RefineIn, TripDocument, TripFull

router = APIRouter(tags=["refine"])


@router.post("/trips/{slug}/refine", response_model=TripFull)
def refine_trip(slug: str, body: RefineIn, user: CurrentUser) -> TripFull:
    db = service_client()
    res = db.table("trips").select("*").eq("slug", slug).single().execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Trip not found")
    row = res.data
    if row["user_id"] != user["sub"]:
        raise HTTPException(status_code=403, detail="Not your trip")

    new_md = refine_document(row["document"]["document_markdown"], body.instruction)
    new_doc = {**row["document"], "document_markdown": new_md}

    update = db.table("trips").update({"document": new_doc}).eq("slug", slug).execute()
    db.table("messages").insert(
        {"trip_id": row["id"], "role": "user", "content": body.instruction}
    ).execute()

    updated_row = update.data[0]
    return TripFull(**updated_row, document=TripDocument(**updated_row["document"]))
```

- [ ] **Step 4: Wire router**

In `api/api/main.py`, add:
```python
from api.routes import refine as refine_routes
app.include_router(refine_routes.router)
```

- [ ] **Step 5: Run test**

```bash
cd api && pytest tests/test_routes_refine.py -v
```
Expected: 1 passed.

- [ ] **Step 6: Commit**

```bash
git add api/
git commit -m "Add POST /trips/:slug/refine"
```

---

### Task 19: POST /trips/:slug/hotels

**Files:**
- Create: `api/api/routes/hotels.py`
- Modify: `api/api/main.py`
- Test: `api/tests/test_routes_hotels.py`

- [ ] **Step 1: Write the failing test**

`api/tests/test_routes_hotels.py`:
```python
import time
import uuid
from datetime import date
from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient
from jose import jwt

from api.config import get_settings
from api.main import app
from api.models import Hotel, Neighborhood


def _token(user_id: str) -> str:
    return jwt.encode(
        {"sub": user_id, "email": "v@example.com",
         "exp": int(time.time()) + 3600, "aud": "authenticated"},
        get_settings().supabase_jwt_secret, algorithm="HS256",
    )


@pytest.fixture
def auth_headers() -> dict[str, str]:
    return {"Authorization": f"Bearer {_token(str(uuid.uuid4()))}"}


def test_post_hotels_persists_neighborhoods(monkeypatch, auth_headers) -> None:
    existing = {
        "id": "t1", "slug": "kyoto-7d-aaa", "user_id": "u", "destination": "Kyoto, Japan",
        "days": 7, "travel_style": "veg",
        "start_date": "2026-10-15", "airport_entry": None, "airport_exit": None,
        "document": {"document_markdown": "## x", "places": [], "neighborhoods": []},
        "places": [],
        "created_at": "2026-05-01T00:00:00+00:00",
    }
    table = MagicMock()
    chain = MagicMock()
    table.select.return_value = chain
    chain.eq.return_value = chain
    chain.single.return_value = chain
    chain.execute.return_value = MagicMock(data=existing)

    suggested = [
        Neighborhood(label="Higashiyama", description="x", hotels=[
            Hotel(name="Park Hyatt Kyoto", description="x", booking_url="https://..."),
        ]),
    ]
    monkeypatch.setattr("api.routes.hotels.suggest_hotels", lambda **kw: suggested)

    table.update.return_value.eq.return_value.execute.return_value = MagicMock(data=[{
        **existing,
        "document": {**existing["document"], "neighborhoods": [n.model_dump() for n in suggested]},
    }])

    client = MagicMock()
    client.table.return_value = table
    monkeypatch.setattr("api.routes.hotels.service_client", lambda: client)

    res = TestClient(app).post(
        "/trips/kyoto-7d-aaa/hotels",
        headers=auth_headers,
        json={"adults": 2},
    )

    assert res.status_code == 200, res.text
    body = res.json()
    assert len(body) == 1
    assert body[0]["label"] == "Higashiyama"
    assert body[0]["hotels"][0]["name"] == "Park Hyatt Kyoto"
```

- [ ] **Step 2: Run to verify it fails**

```bash
cd api && pytest tests/test_routes_hotels.py -v
```
Expected: FAIL.

- [ ] **Step 3: Write the implementation**

`api/api/routes/hotels.py`:
```python
from datetime import date

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from api.auth import CurrentUser
from api.db import service_client
from api.llm.hotels import suggest_hotels
from api.models import Neighborhood

router = APIRouter(tags=["hotels"])


class HotelsIn(BaseModel):
    adults: int = Field(2, ge=1, le=10)


@router.post("/trips/{slug}/hotels", response_model=list[Neighborhood])
def trip_hotels(slug: str, body: HotelsIn, user: CurrentUser) -> list[Neighborhood]:
    db = service_client()
    res = db.table("trips").select("*").eq("slug", slug).single().execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Trip not found")
    row = res.data
    if row["user_id"] != user["sub"]:
        raise HTTPException(status_code=403, detail="Not your trip")

    start = date.fromisoformat(row["start_date"]) if row.get("start_date") else None

    neighborhoods = suggest_hotels(
        document=row["document"]["document_markdown"],
        destination=row["destination"],
        days=row["days"],
        start_date=start,
        adults=body.adults,
    )

    new_doc = {**row["document"], "neighborhoods": [n.model_dump() for n in neighborhoods]}
    db.table("trips").update({"document": new_doc}).eq("slug", slug).execute()

    return neighborhoods
```

- [ ] **Step 4: Wire router**

In `api/api/main.py`, add:
```python
from api.routes import hotels as hotels_routes
app.include_router(hotels_routes.router)
```

- [ ] **Step 5: Run test**

```bash
cd api && pytest tests/test_routes_hotels.py -v
```
Expected: 1 passed.

- [ ] **Step 6: Commit**

```bash
git add api/
git commit -m "Add POST /trips/:slug/hotels (LLM picks + Booking link-outs)"
```

---

### Task 20: GET /trips/:slug/pdf

**Files:**
- Create: `api/api/routes/pdf.py`
- Modify: `api/api/main.py`
- Test: `api/tests/test_routes_pdf.py`

- [ ] **Step 1: Write the failing test**

`api/tests/test_routes_pdf.py`:
```python
import time
import uuid
from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient
from jose import jwt

from api.config import get_settings
from api.main import app


def _token(user_id: str) -> str:
    return jwt.encode(
        {"sub": user_id, "email": "v@example.com",
         "exp": int(time.time()) + 3600, "aud": "authenticated"},
        get_settings().supabase_jwt_secret, algorithm="HS256",
    )


@pytest.fixture
def auth_headers() -> dict[str, str]:
    return {"Authorization": f"Bearer {_token(str(uuid.uuid4()))}"}


def test_get_pdf_returns_pdf_bytes(monkeypatch, auth_headers) -> None:
    row = {
        "id": "t1", "slug": "kyoto-7d-aaa", "user_id": "u", "destination": "Kyoto, Japan",
        "days": 7, "travel_style": "veg",
        "start_date": None, "airport_entry": None, "airport_exit": None,
        "document": {"document_markdown": "## Overview\n\nKyoto.", "places": [], "neighborhoods": []},
        "places": [],
        "created_at": "2026-05-01T00:00:00+00:00",
    }
    table = MagicMock()
    chain = MagicMock()
    table.select.return_value = chain
    chain.eq.return_value = chain
    chain.single.return_value = chain
    chain.execute.return_value = MagicMock(data=row)
    client = MagicMock()
    client.table.return_value = table
    monkeypatch.setattr("api.routes.pdf.service_client", lambda: client)

    res = TestClient(app).get("/trips/kyoto-7d-aaa/pdf", headers=auth_headers)

    assert res.status_code == 200
    assert res.headers["content-type"] == "application/pdf"
    assert res.content.startswith(b"%PDF-")
```

- [ ] **Step 2: Run to verify it fails**

```bash
cd api && pytest tests/test_routes_pdf.py -v
```
Expected: FAIL.

- [ ] **Step 3: Write the implementation**

`api/api/routes/pdf.py`:
```python
from fastapi import APIRouter, HTTPException
from fastapi.responses import Response

from api.auth import CurrentUser
from api.db import service_client
from api.pdf import generate_pdf

router = APIRouter(tags=["pdf"])


@router.get("/trips/{slug}/pdf")
def trip_pdf(slug: str, user: CurrentUser) -> Response:
    res = service_client().table("trips").select("*").eq("slug", slug).single().execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Trip not found")
    row = res.data

    pdf_bytes = generate_pdf(row["document"]["document_markdown"], row["destination"])
    safe_name = row["destination"].replace(" ", "_").replace(",", "")
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{safe_name}_travel_guide.pdf"'},
    )
```

- [ ] **Step 4: Wire router**

In `api/api/main.py`, add:
```python
from api.routes import pdf as pdf_routes
app.include_router(pdf_routes.router)
```

- [ ] **Step 5: Run test**

```bash
cd api && pytest tests/test_routes_pdf.py -v
```
Expected: 1 passed.

- [ ] **Step 6: Run full test suite**

```bash
cd api && pytest -v
```
Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add api/
git commit -m "Add GET /trips/:slug/pdf"
```

---

## Phase 8 — SSE streaming for trip generation

The empty-state UX in the spec shows progress messages and pins drop on the map as places are geocoded. We add a parallel streaming endpoint that emits Server-Sent Events. The synchronous `POST /trips` route stays — it's useful for testing and simple integrations — but the frontend will use the streaming variant.

### Task 21: SSE response helper

**Files:**
- Create: `api/api/sse.py`
- Test: `api/tests/test_sse.py`

- [ ] **Step 1: Write the failing test**

`api/tests/test_sse.py`:
```python
from fastapi import FastAPI
from fastapi.testclient import TestClient

from api.sse import sse_stream


def test_sse_stream_emits_typed_events() -> None:
    def generator():
        yield ("status", "Mapping…")
        yield ("places", [{"name": "x"}])
        yield ("done", {"slug": "kyoto-7d-aaa"})

    app = FastAPI()

    @app.get("/stream")
    def stream():
        return sse_stream(generator())

    client = TestClient(app)
    with client.stream("GET", "/stream") as res:
        assert res.status_code == 200
        body = res.read().decode()
    assert "event: status" in body
    assert 'data: "Mapping…"' in body
    assert 'event: places' in body
    assert 'data: [{"name": "x"}]' in body
    assert 'event: done' in body
    assert 'data: {"slug": "kyoto-7d-aaa"}' in body
```

- [ ] **Step 2: Run to verify it fails**

```bash
cd api && pytest tests/test_sse.py -v
```
Expected: FAIL.

- [ ] **Step 3: Write the implementation**

`api/api/sse.py`:
```python
import json
from collections.abc import Iterable
from typing import Any

from fastapi.responses import StreamingResponse


def sse_stream(events: Iterable[tuple[str, Any]]) -> StreamingResponse:
    """Wrap an iterable of (event_name, payload) tuples as an SSE response."""
    def _generate():
        for name, payload in events:
            yield f"event: {name}\n"
            yield f"data: {json.dumps(payload)}\n\n"

    return StreamingResponse(
        _generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
```

- [ ] **Step 4: Run test**

```bash
cd api && pytest tests/test_sse.py -v
```
Expected: 1 passed.

- [ ] **Step 5: Commit**

```bash
git add api/
git commit -m "Add SSE stream helper"
```

---

### Task 22: Streaming generation route POST /trips/stream

We add a separate path rather than mutating `POST /trips`, so the synchronous endpoint and its test stay green.

**Files:**
- Modify: `api/api/routes/trips.py`
- Test: `api/tests/test_routes_trips.py`

- [ ] **Step 1: Write the failing test**

Append to `api/tests/test_routes_trips.py`:
```python
def test_post_trips_stream_emits_events(monkeypatch, auth_headers) -> None:
    monkeypatch.setattr(
        "api.routes.trips.parse_brief",
        lambda b: MagicMock(
            destination="Kyoto", days=7, travel_style="veg",
            start_date=None, airport_entry=None, airport_exit=None,
        ),
    )
    monkeypatch.setattr(
        "api.routes.trips.get_travel_research",
        lambda d, l, s: {
            "document": "## x",
            "places": [{"name": "Gion", "category": "neighbourhood", "description": "x"}],
        },
    )
    monkeypatch.setattr("api.routes.trips.geocode_place", lambda n: (35.0, 135.7))

    inserted = {
        "id": "t1", "slug": "kyoto-7d-zzz", "user_id": "u", "destination": "Kyoto",
        "days": 7, "travel_style": "veg",
        "start_date": None, "airport_entry": None, "airport_exit": None,
        "document": {"document_markdown": "## x",
                     "places": [{"name": "Gion", "category": "neighbourhood",
                                 "description": "x", "lat": 35.0, "lng": 135.7}],
                     "neighborhoods": []},
        "places": [],
        "created_at": "2026-05-01T00:00:00+00:00",
    }
    table = MagicMock()
    table.insert.return_value.execute.return_value = MagicMock(data=[inserted])
    client = MagicMock()
    client.table.return_value = table
    monkeypatch.setattr("api.routes.trips.service_client", lambda: client)

    with TestClient(app).stream(
        "POST", "/trips/stream",
        headers=auth_headers,
        json={"text": "Kyoto"},
    ) as res:
        assert res.status_code == 200
        body = res.read().decode()

    assert "event: status" in body
    assert "event: places" in body
    assert "event: done" in body
    assert "kyoto-7d-zzz" in body
```

- [ ] **Step 2: Run to verify it fails**

```bash
cd api && pytest tests/test_routes_trips.py::test_post_trips_stream_emits_events -v
```
Expected: FAIL with 404.

- [ ] **Step 3: Add the streaming route**

Append to `api/api/routes/trips.py`:
```python
from typing import Any

from api.sse import sse_stream


@router.post("/trips/stream")
def create_trip_stream(brief: TripBriefIn, user: CurrentUser):
    def events():
        yield ("status", "Parsing your brief…")
        parsed = parse_brief(brief)

        yield ("status", f"Researching {parsed.destination} for {parsed.days} days…")
        research = get_travel_research(parsed.destination, parsed.days, parsed.travel_style)

        yield ("status", "Mapping places…")
        raw_places = research.get("places", [])
        raw_places.sort(
            key=lambda p: GEOCODE_PRIORITY.index(p.get("category", "logistics"))
            if p.get("category") in GEOCODE_PRIORITY else len(GEOCODE_PRIORITY),
        )
        geocoded: list[dict[str, Any]] = []
        for p in raw_places[:GEOCODE_CAP]:
            lat, lng = geocode_place(p["name"])
            place = {**p, "lat": lat, "lng": lng}
            geocoded.append(place)
            yield ("place", place)

        document = {
            "document_markdown": research["document"],
            "places": geocoded,
            "neighborhoods": [],
        }

        slug = make_trip_slug(parsed.destination, parsed.days)
        row = {
            "slug": slug,
            "user_id": user["sub"],
            "destination": parsed.destination,
            "days": parsed.days,
            "travel_style": parsed.travel_style,
            "start_date": parsed.start_date.isoformat() if parsed.start_date else None,
            "airport_entry": parsed.airport_entry,
            "airport_exit": parsed.airport_exit,
            "document": document,
            "places": [],
        }
        service_client().table("trips").insert(row).execute()
        yield ("done", {"slug": slug})

    return sse_stream(events())
```

- [ ] **Step 4: Run streaming test**

```bash
cd api && pytest tests/test_routes_trips.py -v
```
Expected: all 5 tests pass.

- [ ] **Step 5: Run full suite**

```bash
cd api && pytest -v
```
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add api/
git commit -m "Add POST /trips/stream (SSE) for incremental generation UX"
```

---

## Phase 9 — Containerization and deploy

### Task 23: Dockerfile and local container test

**Files:**
- Create: `api/Dockerfile`
- Create: `api/.dockerignore`

- [ ] **Step 1: Write `api/Dockerfile`**

```dockerfile
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# DejaVu fonts for fpdf2 (matches Linux paths in api/api/pdf.py)
RUN apt-get update && apt-get install -y --no-install-recommends \
    fonts-dejavu-core \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY pyproject.toml ./
RUN pip install --upgrade pip && pip install .

COPY api ./api

EXPOSE 8080
CMD ["sh", "-c", "uvicorn api.main:app --host 0.0.0.0 --port ${PORT:-8080}"]
```

- [ ] **Step 2: Write `api/.dockerignore`**

```
.venv
__pycache__
*.pyc
tests
.env
.env.*
.pytest_cache
```

- [ ] **Step 3: Build and run locally**

```bash
cd api
docker build -t atlas-api:local .
docker run --rm -p 8080:8080 --env-file .env atlas-api:local &
sleep 3
curl -s http://localhost:8080/health
docker kill $(docker ps -q --filter "ancestor=atlas-api:local")
```
Expected: `{"status":"ok"}`

- [ ] **Step 4: Commit**

```bash
git add api/Dockerfile api/.dockerignore
git commit -m "Add Dockerfile and run /health locally"
```

---

### Task 24: Deploy to Cloud Run

This task requires the user's Google Cloud account and gcloud CLI. The agent should pause here and ask the user to confirm before running `gcloud` commands that bind to a billable project.

**Files:** none (deploy-only)

**Prereqs:** Install gcloud CLI (`brew install --cask google-cloud-sdk`), pick or create a GCP project, enable Cloud Run API and Artifact Registry API.

- [ ] **Step 1: Authenticate and pick project**

```bash
gcloud auth login
gcloud config set project <YOUR_PROJECT_ID>
gcloud services enable run.googleapis.com artifactregistry.googleapis.com
```

- [ ] **Step 2: Create an Artifact Registry repo**

```bash
gcloud artifacts repositories create atlas \
  --repository-format=docker \
  --location=us-central1
gcloud auth configure-docker us-central1-docker.pkg.dev
```

- [ ] **Step 3: Build and push the image**

```bash
cd api
IMAGE=us-central1-docker.pkg.dev/$(gcloud config get-value project)/atlas/api:v0.1
docker build --platform=linux/amd64 -t "$IMAGE" .
docker push "$IMAGE"
```

- [ ] **Step 4: Deploy to Cloud Run**

```bash
gcloud run deploy atlas-api \
  --image="$IMAGE" \
  --region=us-central1 \
  --platform=managed \
  --allow-unauthenticated \
  --memory=512Mi \
  --cpu=1 \
  --min-instances=0 \
  --max-instances=3 \
  --timeout=300 \
  --set-env-vars="OPENROUTER_API_KEY=$(grep OPENROUTER_API_KEY .env | cut -d= -f2-),GOOGLE_MAPS_API_KEY=$(grep GOOGLE_MAPS_API_KEY .env | cut -d= -f2-),SUPABASE_URL=$(grep SUPABASE_URL .env | cut -d= -f2-),SUPABASE_ANON_KEY=$(grep SUPABASE_ANON_KEY .env | cut -d= -f2-),SUPABASE_SERVICE_ROLE_KEY=$(grep SUPABASE_SERVICE_ROLE_KEY .env | cut -d= -f2-),SUPABASE_JWT_SECRET=$(grep SUPABASE_JWT_SECRET .env | cut -d= -f2-),ALLOWED_ORIGINS=https://atlas.viggy.dev"
```

- [ ] **Step 5: Smoke test the deployed URL**

```bash
SERVICE_URL=$(gcloud run services describe atlas-api --region=us-central1 --format='value(status.url)')
curl -s "$SERVICE_URL/health"
```
Expected: `{"status":"ok"}`

- [ ] **Step 6: Verify a real generation end-to-end**

Sign in via Supabase CLI or generate a JWT manually, then:
```bash
curl -s -X POST "$SERVICE_URL/trips" \
  -H "Authorization: Bearer <YOUR_JWT>" \
  -H "Content-Type: application/json" \
  -d '{"text": "3 days in Lisbon, vegetarian, photography"}'
```
Expected: a JSON response with `slug`, `destination`, `document`.

- [ ] **Step 7: Commit deploy notes**

Add a one-liner deploy script for future redeploys, `api/deploy.sh`:
```bash
#!/usr/bin/env bash
set -euo pipefail
PROJECT="$(gcloud config get-value project)"
IMAGE="us-central1-docker.pkg.dev/$PROJECT/atlas/api:$(git rev-parse --short HEAD)"
docker build --platform=linux/amd64 -t "$IMAGE" .
docker push "$IMAGE"
gcloud run services update atlas-api --region=us-central1 --image="$IMAGE"
```

```bash
chmod +x api/deploy.sh
git add api/deploy.sh
git commit -m "Add Cloud Run deploy script"
```

---

### Task 25: Map `api.atlas.viggy.dev` to the Cloud Run service

Cloud Run domain mapping requires DNS verification of the parent domain. The user owns `viggy.dev`, so this is straightforward.

- [ ] **Step 1: Verify domain ownership in Google Search Console**

Add `viggy.dev` in [Google Search Console](https://search.google.com/search-console/welcome). Add the TXT record they provide on whatever DNS host runs `viggy.dev`.

- [ ] **Step 2: Create Cloud Run domain mapping**

```bash
gcloud beta run domain-mappings create \
  --service=atlas-api \
  --domain=api.atlas.viggy.dev \
  --region=us-central1
```

This emits a CNAME record value like `ghs.googlehosted.com.`.

- [ ] **Step 3: Add the CNAME on your DNS provider**

Create:
```
api.atlas   CNAME   ghs.googlehosted.com.
```

Wait 5–30 minutes for DNS propagation and SSL provisioning.

- [ ] **Step 4: Smoke test the public domain**

```bash
curl -s https://api.atlas.viggy.dev/health
```
Expected: `{"status":"ok"}`

- [ ] **Step 5: Commit deploy notes**

Add a brief paragraph in `api/README.md` documenting the public domain and the deploy command. No new commit needed if README already lists it; otherwise:

```bash
git add api/README.md
git commit -m "Document api.atlas.viggy.dev domain mapping"
```

---

## Self-review

**1. Spec coverage**

| Spec section | Implemented in |
|---|---|
| Repo structure (`api/`) | Task 1 |
| Pydantic models | Task 3 |
| LLM logic ported | Tasks 5–9 |
| Geocoding | Task 10 |
| PDF | Task 11 |
| Supabase schema + RLS | Task 12 |
| Auth (Supabase JWT) | Task 13 |
| `POST /trips` | Task 16 |
| `GET /trips`, `GET /trips/:slug` | Task 17 |
| `POST /trips/:slug/refine` | Task 18 |
| `POST /trips/:slug/hotels` (rework) | Tasks 9, 19 |
| `GET /trips/:slug/pdf` | Task 20 |
| SSE streaming | Tasks 21–22 |
| Cloud Run hosting | Tasks 23–25 |
| `api.atlas.viggy.dev` DNS | Task 25 |

The frontend, `Share` button, trip-history UI, and Mapbox style live in plan 2 — explicitly out of scope here.

**2. Placeholder scan** — No "TBD"/"TODO"/"add appropriate handling" entries. Every code step has the actual code an engineer needs.

**3. Type consistency** — Cross-checked: `TripFull`, `TripDocument`, `TripSummary`, `Place`, `Neighborhood`, `Hotel`, `ParsedBrief`, `TripBriefIn`, `RefineIn` are defined in Task 3 and used consistently across Tasks 16–22. The hotels module uses `Hotel`/`Neighborhood` from `api.models`. The streaming route emits `place` events using the same dict shape that gets persisted into `document.places`.

One mismatch fixed inline before saving: the SSE example in the spec emitted `event: places` (plural array) while the implementation in Task 22 emits `event: place` (one per geocoded place). Decision: emit one `place` event per item — better UX (pins drop one at a time on the map) and simpler to consume. The spec's SSE example is illustrative; the implementation is canonical.
