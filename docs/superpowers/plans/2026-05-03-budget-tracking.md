# Budget Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Per-trip budget with destination-currency LLM estimates, GBP equivalents (frankfurter.app FX), per-day overrides + line items, and a categorised cost breakdown page in the PDF.

**Architecture:** New `trip_budgets` Supabase table (1:1 with trips, RLS via parent ownership). New `api/api/llm/budget.py` runs in parallel with research at trip-creation time. New `api/api/fx.py` fetches and memoises GBP conversion rates. New `Budget` tab on the trip page with a small `useBudget(slug)` hook. `PdfPlan` gains a nullable `costs: PdfCosts` populated by a separate LLM pass (`api/api/llm/pdf_costs.py`); the renderer draws an "Estimated costs" page with four category bars.

**Tech Stack:** Same as the rest — FastAPI, Pydantic v2, Supabase Postgres + RLS, Next.js 16, Tailwind v4, fpdf2. New external dep: none — frankfurter.app called via existing `httpx`.

**Spec reference:** [docs/superpowers/specs/2026-05-03-budget-tracking-design.md](../specs/2026-05-03-budget-tracking-design.md)

---

## File structure

```
api/api/
├── fx.py                       NEW: get_gbp_rate() + 24h memo
├── llm/budget.py               NEW: budget_estimate() — per-day estimates
├── llm/pdf_costs.py            NEW: estimate_pdf_costs() — categorised totals
├── routes/budget.py            NEW: GET / regenerate / PUT day
├── models.py                   MODIFIED: BudgetItem, BudgetDayIn, BudgetDay,
│                                          Budget, BudgetEstimateRaw,
│                                          BudgetEstimateDay, PdfCostCategory,
│                                          PdfCosts; PdfPlan.costs; PdfSections.costs
├── pdf.py                      MODIFIED: render Estimated-costs page
├── routes/trips.py             MODIFIED: parallel budget call + persist row
├── routes/pdf.py               MODIFIED: thread costs flag
├── llm/pdf_plan.py             MODIFIED: call pdf_costs after days, attach to plan
└── main.py                     MODIFIED: include budget router

api/tests/
├── test_fx.py                  NEW
├── test_llm_budget.py          NEW
├── test_llm_pdf_costs.py       NEW
├── test_routes_budget.py       NEW
├── test_routes_trips.py        MODIFIED: assert budget gets created in stream
├── test_routes_pdf.py          MODIFIED: assert costs flag flows
└── conftest.py                 MODIFIED: default no-budget at fetch_budget_for

supabase/migrations/
└── 2026-05-03_trip_budgets.sql NEW

web/src/
├── lib/budget.ts               NEW: useBudget hook + helpers
├── lib/currency.ts             NEW: format helpers
├── lib/api.ts                  MODIFIED: getBudget, regenerateBudget, updateBudgetDay
├── lib/types.ts                MODIFIED: Budget, BudgetDay, BudgetItem,
│                                          PdfCosts, PdfCostCategory
├── components/
│   ├── BudgetTab.tsx           NEW
│   ├── BudgetDayRow.tsx        NEW
│   ├── BudgetItemRow.tsx       NEW
│   ├── DayCard.tsx             MODIFIED: budget pill in header
│   ├── TripPanelTabs.tsx       MODIFIED: Budget tab
│   └── PdfExportMenu.tsx       MODIFIED: Costs checkbox
└── app/trip/[slug]/page.tsx    MODIFIED: server-fetch budget + pass down
```

---

## Phase 1 — Backend foundation

### Task 1: Schema migration

**Files:**
- Create: `supabase/migrations/2026-05-03_trip_budgets.sql`

- [ ] **Step 1: Write the migration**

```sql
create table public.trip_budgets (
  trip_id uuid primary key references public.trips(id) on delete cascade,
  currency text not null,
  gbp_rate numeric(12,6) not null,
  gbp_rate_date date not null,
  days jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.trip_budgets enable row level security;

create policy trip_budgets_select on public.trip_budgets
  for select using (
    exists (select 1 from public.trips t
            where t.id = trip_id and t.user_id = auth.uid())
  );
create policy trip_budgets_insert on public.trip_budgets
  for insert with check (
    exists (select 1 from public.trips t
            where t.id = trip_id and t.user_id = auth.uid())
  );
create policy trip_budgets_update on public.trip_budgets
  for update using (
    exists (select 1 from public.trips t
            where t.id = trip_id and t.user_id = auth.uid())
  );
create policy trip_budgets_delete on public.trip_budgets
  for delete using (
    exists (select 1 from public.trips t
            where t.id = trip_id and t.user_id = auth.uid())
  );
```

- [ ] **Step 2: USER ACTION — apply in Supabase SQL editor**

Surface to the user: "Open the Supabase SQL editor for the project, paste the contents of `supabase/migrations/2026-05-03_trip_budgets.sql`, and run. Verify in Table Editor that `trip_budgets` appears."

- [ ] **Step 3: Commit**

```bash
git add supabase/
git commit -m "$(cat <<'EOF'
Add trip_budgets table with RLS via parent trip ownership

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Pydantic models

**Files:**
- Modify: `api/api/models.py`
- Test: `api/tests/test_models.py`

- [ ] **Step 1: Write failing tests**

Append to `api/tests/test_models.py`:

```python
# ── Budget ──────────────────────────────────────────────────────────────────


def test_budget_item_rejects_negative_amount():
    import pytest
    from pydantic import ValidationError

    from api.models import BudgetItem

    with pytest.raises(ValidationError):
        BudgetItem(name="Spa", amount=-5)


def test_budget_item_rejects_empty_name():
    import pytest
    from pydantic import ValidationError

    from api.models import BudgetItem

    with pytest.raises(ValidationError):
        BudgetItem(name="", amount=10)


def test_budget_day_in_caps_items_at_20():
    import pytest
    from pydantic import ValidationError

    from api.models import BudgetDayIn, BudgetItem

    too_many = [BudgetItem(name=f"x{i}", amount=1) for i in range(21)]
    with pytest.raises(ValidationError):
        BudgetDayIn(items=too_many)


def test_budget_day_in_accepts_null_override():
    from api.models import BudgetDayIn

    d = BudgetDayIn(override=None, items=[])
    assert d.override is None
    assert d.items == []


def test_pdf_costs_categories_are_typed():
    import pytest
    from pydantic import ValidationError

    from api.models import PdfCostCategory

    with pytest.raises(ValidationError):
        PdfCostCategory(name="Souvenirs", amount=100, gbp_amount=1)


def test_pdf_plan_accepts_optional_costs():
    from api.models import PdfPlan

    p = PdfPlan(destination="Kyoto", subtitle="x", days=[])
    assert p.costs is None
```

- [ ] **Step 2: Run to verify failure**

```bash
cd /Users/viggy/travel-planning/api && source .venv/bin/activate
pytest tests/test_models.py -v
```
Expected: FAIL — `ImportError: cannot import name 'BudgetItem' from 'api.models'`.

- [ ] **Step 3: Add the models**

Append to `api/api/models.py` (after the existing `class UserProfile(...)` block):

```python
# ── Budget ──────────────────────────────────────────────────────────────────


class BudgetItem(BaseModel):
    name: str = Field(..., min_length=1, max_length=80)
    amount: int = Field(..., ge=0)


class BudgetDayIn(BaseModel):
    override: int | None = Field(None, ge=0)
    items: list[BudgetItem] = Field(default_factory=list, max_length=20)


class BudgetDay(BudgetDayIn):
    number: int
    title: str
    estimated: int


class Budget(BaseModel):
    trip_id: str
    currency: str
    gbp_rate: float
    gbp_rate_date: date
    days: list[BudgetDay]
    updated_at: datetime


class BudgetEstimateDay(BaseModel):
    number: int
    estimated: int = Field(..., ge=0)


class BudgetEstimateRaw(BaseModel):
    """Wire format from the LLM. Validated, then converted to BudgetDay rows."""
    currency: str
    days: list[BudgetEstimateDay]
```

Then modify the existing `PdfPlan` class to add `costs`. Find:

```python
class PdfPlan(BaseModel):
    destination: str
    subtitle: str
    route: list[str] = []
    days: list[PdfDay]
```

Replace with:

```python
class PdfCostCategory(BaseModel):
    name: Literal["Lodging", "Food", "Activities", "Transport"]
    amount: int = Field(..., ge=0)
    gbp_amount: int = Field(..., ge=0)


class PdfCosts(BaseModel):
    currency: str
    gbp_rate: float
    categories: list[PdfCostCategory]
    total_local: int = Field(..., ge=0)
    total_gbp: int = Field(..., ge=0)


class PdfPlan(BaseModel):
    destination: str
    subtitle: str
    route: list[str] = []
    days: list[PdfDay]
    costs: PdfCosts | None = None
```

- [ ] **Step 4: Run tests**

```bash
cd /Users/viggy/travel-planning/api && source .venv/bin/activate
pytest tests/test_models.py -v
```
Expected: 6 new tests pass; existing tests still green.

- [ ] **Step 5: Commit**

```bash
cd /Users/viggy/travel-planning
git add api/api/models.py api/tests/test_models.py
git commit -m "$(cat <<'EOF'
Add Budget + PdfCosts pydantic models

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: FX rate fetcher

**Files:**
- Create: `api/api/fx.py`
- Test: `api/tests/test_fx.py`

- [ ] **Step 1: Write failing tests**

Create `api/tests/test_fx.py`:

```python
from datetime import date
from unittest.mock import MagicMock, patch

import pytest

from api import fx


@pytest.fixture(autouse=True)
def _clear_cache():
    fx._cache.clear()


def test_gbp_to_gbp_short_circuits():
    rate = fx.get_gbp_rate("GBP")
    assert rate.rate == 1.0
    assert rate.fetched_on == date.today()


def test_fetch_jpy_to_gbp():
    fake = MagicMock()
    fake.json.return_value = {"date": "2026-05-03", "rates": {"GBP": 0.0052}}
    fake.raise_for_status.return_value = None
    with patch("api.fx.httpx.get", return_value=fake) as mock_get:
        rate = fx.get_gbp_rate("JPY")
    assert rate.rate == 0.0052
    assert rate.fetched_on == date(2026, 5, 3)
    mock_get.assert_called_once()
    assert "from=JPY" in mock_get.call_args[0][0]
    assert "to=GBP" in mock_get.call_args[0][0]


def test_cache_avoids_second_fetch_within_24h():
    fake = MagicMock()
    fake.json.return_value = {"date": "2026-05-03", "rates": {"GBP": 0.0052}}
    fake.raise_for_status.return_value = None
    with patch("api.fx.httpx.get", return_value=fake) as mock_get:
        fx.get_gbp_rate("JPY")
        fx.get_gbp_rate("JPY")
    assert mock_get.call_count == 1


def test_lowercase_currency_normalised():
    fake = MagicMock()
    fake.json.return_value = {"date": "2026-05-03", "rates": {"GBP": 1.17}}
    fake.raise_for_status.return_value = None
    with patch("api.fx.httpx.get", return_value=fake):
        rate = fx.get_gbp_rate("eur")
    assert rate.rate == 1.17
```

- [ ] **Step 2: Run to verify failure**

```bash
cd /Users/viggy/travel-planning/api && source .venv/bin/activate
pytest tests/test_fx.py -v
```
Expected: FAIL — `ModuleNotFoundError: api.fx`.

- [ ] **Step 3: Write the module**

Create `api/api/fx.py`:

```python
"""GBP conversion rates from frankfurter.app (free, no auth, ECB rates).

In-process 24h memo. Single source of truth for any currency → GBP
conversion in the API.
"""

from __future__ import annotations

import time
from dataclasses import dataclass
from datetime import date

import httpx

_FRANKFURTER = "https://api.frankfurter.app/latest"
_TTL_SECONDS = 24 * 60 * 60


@dataclass(frozen=True)
class FxRate:
    rate: float
    fetched_on: date


_cache: dict[str, tuple[FxRate, float]] = {}


def get_gbp_rate(currency: str) -> FxRate:
    """Return {currency} → GBP rate. Cached per-currency for 24h."""
    code = currency.strip().upper()
    if code == "GBP":
        return FxRate(rate=1.0, fetched_on=date.today())

    cached = _cache.get(code)
    if cached and (time.time() - cached[1]) < _TTL_SECONDS:
        return cached[0]

    url = f"{_FRANKFURTER}?from={code}&to=GBP"
    resp = httpx.get(url, timeout=10)
    resp.raise_for_status()
    body = resp.json()
    rate = FxRate(
        rate=float(body["rates"]["GBP"]),
        fetched_on=date.fromisoformat(body["date"]),
    )
    _cache[code] = (rate, time.time())
    return rate
```

- [ ] **Step 4: Run tests**

```bash
cd /Users/viggy/travel-planning/api && source .venv/bin/activate
pytest tests/test_fx.py -v
```
Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
cd /Users/viggy/travel-planning
git add api/api/fx.py api/tests/test_fx.py
git commit -m "$(cat <<'EOF'
Add fx module: GBP rates from frankfurter.app with 24h memo

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Budget LLM helper

**Files:**
- Create: `api/api/llm/budget.py`
- Test: `api/tests/test_llm_budget.py`

- [ ] **Step 1: Write failing tests**

Create `api/tests/test_llm_budget.py`:

```python
from unittest.mock import MagicMock, patch

from api.llm.budget import budget_estimate


def _fake_response(content: str) -> MagicMock:
    msg = MagicMock(content=content)
    choice = MagicMock(message=msg)
    return MagicMock(choices=[choice])


def test_budget_estimate_returns_per_day_numbers():
    payload = (
        '{"currency": "JPY", "days": ['
        '{"number": 1, "estimated": 18000},'
        '{"number": 2, "estimated": 22000}'
        "]}"
    )
    with patch("api.llm.budget.client") as mock_client:
        mock_client.chat.completions.create.return_value = _fake_response(payload)
        out = budget_estimate("Kyoto", 2, "vegetarian, mid budget")
    assert out.currency == "JPY"
    assert len(out.days) == 2
    assert out.days[0].estimated == 18000
    assert out.days[1].number == 2


def test_budget_estimate_strips_markdown_fences():
    payload = '```json\n{"currency": "EUR", "days": [{"number": 1, "estimated": 120}]}\n```'
    with patch("api.llm.budget.client") as mock_client:
        mock_client.chat.completions.create.return_value = _fake_response(payload)
        out = budget_estimate("Lisbon", 1, "")
    assert out.currency == "EUR"
    assert out.days[0].estimated == 120


def test_budget_estimate_raises_on_invalid_json():
    import pytest

    with patch("api.llm.budget.client") as mock_client:
        mock_client.chat.completions.create.return_value = _fake_response("not json")
        with pytest.raises(ValueError):
            budget_estimate("Kyoto", 2, "")
```

- [ ] **Step 2: Run to verify failure**

```bash
cd /Users/viggy/travel-planning/api && source .venv/bin/activate
pytest tests/test_llm_budget.py -v
```
Expected: FAIL — `ModuleNotFoundError: api.llm.budget`.

- [ ] **Step 3: Write the helper**

Create `api/api/llm/budget.py`:

```python
"""Per-day budget estimates in destination currency.

Single LLM call. Runs in parallel with research at trip-creation time.
Cheap model: gemini-2.5-flash-lite.
"""

from __future__ import annotations

import json
import re

from api.llm.client import client
from api.models import BudgetEstimateRaw

_MODEL = "google/gemini-2.5-flash-lite"

_PROMPT = """You estimate per-day travel budgets.

Destination: {destination}
Days: {days}
Travel style: {travel_style}

Return ONLY a JSON object — no prose, no markdown.

{{
  "currency": "<ISO 4217 code for the destination, e.g. JPY for Kyoto, EUR for Lisbon>",
  "days": [
    {{"number": 1, "estimated": <integer in destination currency>}},
    ...one row per day...
  ]
}}

Rules:
- Estimates are PER PERSON, PER DAY, and EXCLUDE flights and lodging.
- Cover food, local transport, activities, and incidentals.
- Round to natural increments (¥500, €5, $5).
- Reflect the budget tier in the travel_style. Cheap is shoestring,
  mid is comfortable, premium is splurge.
- Vary days based on travel intensity (long sightseeing day > rest day).
"""


def budget_estimate(
    destination: str,
    days: int,
    travel_style: str,
    day_titles: list[str] | None = None,
) -> BudgetEstimateRaw:
    prompt = _PROMPT.format(
        destination=destination,
        days=days,
        travel_style=travel_style or "balanced",
    )
    if day_titles:
        prompt += "\n\nDay titles for context (in order):\n" + "\n".join(
            f"  Day {i + 1}: {t}" for i, t in enumerate(day_titles)
        )

    resp = client.chat.completions.create(
        model=_MODEL,
        messages=[{"role": "user", "content": prompt}],
        temperature=0.2,
    )
    raw = resp.choices[0].message.content.strip()

    # Tolerate ```json fences the model occasionally adds.
    fence = re.match(r"^```(?:json)?\s*(.*?)\s*```$", raw, flags=re.S)
    if fence:
        raw = fence.group(1)

    try:
        data = json.loads(raw)
    except json.JSONDecodeError as e:
        raise ValueError(f"budget_estimate: not JSON: {e}: {raw[:200]!r}") from e

    return BudgetEstimateRaw(**data)
```

- [ ] **Step 4: Run tests**

```bash
cd /Users/viggy/travel-planning/api && source .venv/bin/activate
pytest tests/test_llm_budget.py -v
```
Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
cd /Users/viggy/travel-planning
git add api/api/llm/budget.py api/tests/test_llm_budget.py
git commit -m "$(cat <<'EOF'
Add budget_estimate LLM helper (gemini-2.5-flash-lite)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase 2 — Backend routes

### Task 5: Budget routes (GET / regenerate / PUT day)

**Files:**
- Create: `api/api/routes/budget.py`
- Modify: `api/api/main.py`
- Test: `api/tests/test_routes_budget.py`
- Modify: `api/tests/conftest.py` (autouse default for fetch_budget_for)

- [ ] **Step 1: Write failing tests**

Create `api/tests/test_routes_budget.py`:

```python
import time
from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient
from jose import jwt

from api.config import get_settings
from api.main import app

OWNER_ID = "owner-uid"


def _token(user_id: str) -> str:
    return jwt.encode(
        {"sub": user_id, "email": "v@example.com",
         "exp": int(time.time()) + 3600, "aud": "authenticated"},
        get_settings().supabase_jwt_secret, algorithm="HS256",
    )


@pytest.fixture
def auth_headers() -> dict[str, str]:
    return {"Authorization": f"Bearer {_token(OWNER_ID)}"}


def _trip_row() -> dict:
    return {"id": "t1", "user_id": OWNER_ID, "slug": "kyoto-7d-aaa",
            "destination": "Kyoto", "days": 2, "travel_style": "vegetarian"}


def _budget_row() -> dict:
    return {
        "trip_id": "t1",
        "currency": "JPY",
        "gbp_rate": 0.0052,
        "gbp_rate_date": "2026-05-03",
        "days": [
            {"number": 1, "title": "Day 1", "estimated": 18000,
             "override": None, "items": []},
            {"number": 2, "title": "Day 2", "estimated": 22000,
             "override": None, "items": []},
        ],
        "updated_at": "2026-05-03T10:00:00+00:00",
    }


def _mock_db(trip_row=None, budget_row=None,
             budget_select_chain=None) -> MagicMock:
    """Returns a Supabase client mock that handles the GET-trip-by-slug
    and GET-budget-by-trip-id queries."""
    trips_chain = MagicMock()
    trips_chain.select.return_value = trips_chain
    trips_chain.eq.return_value = trips_chain
    trips_chain.single.return_value = trips_chain
    trips_chain.execute.return_value = MagicMock(data=trip_row)

    budgets_chain = MagicMock()
    budgets_chain.select.return_value = budgets_chain
    budgets_chain.eq.return_value = budgets_chain
    budgets_chain.maybe_single.return_value = budgets_chain
    budgets_chain.execute.return_value = MagicMock(data=budget_row)

    budgets_chain.update.return_value = budgets_chain
    budgets_chain.upsert.return_value = budgets_chain

    def table(name: str) -> MagicMock:
        return trips_chain if name == "trips" else budgets_chain

    client = MagicMock()
    client.table.side_effect = table
    return client


def test_get_budget_returns_404_when_trip_missing(monkeypatch, auth_headers):
    monkeypatch.setattr(
        "api.routes.budget.service_client",
        lambda: _mock_db(trip_row=None),
    )
    res = TestClient(app).get("/trips/nope/budget", headers=auth_headers)
    assert res.status_code == 404


def test_get_budget_returns_404_when_no_budget_row(monkeypatch, auth_headers):
    monkeypatch.setattr(
        "api.routes.budget.service_client",
        lambda: _mock_db(trip_row=_trip_row(), budget_row=None),
    )
    res = TestClient(app).get("/trips/kyoto-7d-aaa/budget", headers=auth_headers)
    assert res.status_code == 404


def test_get_budget_returns_row(monkeypatch, auth_headers):
    monkeypatch.setattr(
        "api.routes.budget.service_client",
        lambda: _mock_db(trip_row=_trip_row(), budget_row=_budget_row()),
    )
    res = TestClient(app).get("/trips/kyoto-7d-aaa/budget", headers=auth_headers)
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["currency"] == "JPY"
    assert len(body["days"]) == 2


def test_get_budget_403_when_not_owner(monkeypatch, auth_headers):
    other = {**_trip_row(), "user_id": "someone-else"}
    monkeypatch.setattr(
        "api.routes.budget.service_client",
        lambda: _mock_db(trip_row=other),
    )
    res = TestClient(app).get("/trips/kyoto-7d-aaa/budget", headers=auth_headers)
    assert res.status_code == 403


def test_put_day_updates_override_and_items(monkeypatch, auth_headers):
    db = _mock_db(trip_row=_trip_row(), budget_row=_budget_row())
    saved = {**_budget_row()}
    saved["days"][0] = {**saved["days"][0], "override": 20000,
                        "items": [{"name": "Spa", "amount": 5000}]}
    db.table("trip_budgets").update.return_value.eq.return_value.execute.return_value = (
        MagicMock(data=[saved])
    )
    monkeypatch.setattr("api.routes.budget.service_client", lambda: db)

    res = TestClient(app).put(
        "/trips/kyoto-7d-aaa/budget/days/1",
        headers=auth_headers,
        json={"override": 20000, "items": [{"name": "Spa", "amount": 5000}]},
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["override"] == 20000
    assert body["items"][0]["name"] == "Spa"


def test_put_day_404_for_unknown_day(monkeypatch, auth_headers):
    monkeypatch.setattr(
        "api.routes.budget.service_client",
        lambda: _mock_db(trip_row=_trip_row(), budget_row=_budget_row()),
    )
    res = TestClient(app).put(
        "/trips/kyoto-7d-aaa/budget/days/99",
        headers=auth_headers,
        json={"override": 1, "items": []},
    )
    assert res.status_code == 404


def test_put_day_rejects_negative(monkeypatch, auth_headers):
    monkeypatch.setattr(
        "api.routes.budget.service_client",
        lambda: _mock_db(trip_row=_trip_row(), budget_row=_budget_row()),
    )
    res = TestClient(app).put(
        "/trips/kyoto-7d-aaa/budget/days/1",
        headers=auth_headers,
        json={"override": -1, "items": []},
    )
    assert res.status_code == 422


def test_regenerate_replaces_estimates_preserves_overrides(monkeypatch, auth_headers):
    """Regenerate updates `estimated` per day but keeps user override + items."""
    from api.models import BudgetEstimateDay, BudgetEstimateRaw

    monkeypatch.setattr(
        "api.routes.budget.budget_estimate",
        lambda *_a, **_k: BudgetEstimateRaw(
            currency="JPY",
            days=[BudgetEstimateDay(number=1, estimated=21000),
                  BudgetEstimateDay(number=2, estimated=25000)],
        ),
    )
    monkeypatch.setattr(
        "api.routes.budget.get_gbp_rate",
        lambda c: __import__("api.fx", fromlist=["FxRate"]).FxRate(
            rate=0.0050, fetched_on=__import__("datetime").date(2026, 5, 3),
        ),
    )

    existing_with_overrides = _budget_row()
    existing_with_overrides["days"][0] = {
        **existing_with_overrides["days"][0],
        "override": 20000,
        "items": [{"name": "Spa", "amount": 5000}],
    }
    db = _mock_db(trip_row=_trip_row(), budget_row=existing_with_overrides)

    captured: dict = {}

    def upsert_side_effect(row, on_conflict=None):
        captured["row"] = row
        chain = MagicMock()
        chain.execute.return_value = MagicMock(data=[row])
        return chain

    db.table("trip_budgets").upsert.side_effect = upsert_side_effect
    monkeypatch.setattr("api.routes.budget.service_client", lambda: db)

    res = TestClient(app).post(
        "/trips/kyoto-7d-aaa/budget/regenerate", headers=auth_headers,
    )
    assert res.status_code == 200, res.text
    saved_days = captured["row"]["days"]
    # New estimate, preserved override + items on day 1.
    assert saved_days[0]["estimated"] == 21000
    assert saved_days[0]["override"] == 20000
    assert saved_days[0]["items"] == [{"name": "Spa", "amount": 5000}]
    # Day 2 had no override; gets fresh estimate, override stays None.
    assert saved_days[1]["estimated"] == 25000
    assert saved_days[1]["override"] is None


def test_endpoints_require_auth():
    cli = TestClient(app)
    assert cli.get("/trips/x/budget").status_code == 401
    assert cli.put("/trips/x/budget/days/1", json={}).status_code == 401
    assert cli.post("/trips/x/budget/regenerate").status_code == 401
```

- [ ] **Step 2: Run to verify failure**

```bash
cd /Users/viggy/travel-planning/api && source .venv/bin/activate
pytest tests/test_routes_budget.py -v
```
Expected: FAIL — endpoints 404.

- [ ] **Step 3: Write the route module**

Create `api/api/routes/budget.py`:

```python
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException

from api.auth import CurrentUser
from api.db import service_client
from api.fx import get_gbp_rate
from api.llm.budget import budget_estimate
from api.models import Budget, BudgetDay, BudgetDayIn, BudgetEstimateRaw

router = APIRouter(tags=["budget"])


def _load_trip_or_404(slug: str, user_sub: str) -> dict:
    res = (
        service_client().table("trips")
        .select("id, user_id, destination, days, travel_style")
        .eq("slug", slug).single().execute()
    )
    if not res.data:
        raise HTTPException(status_code=404, detail="Trip not found")
    if res.data["user_id"] != user_sub:
        raise HTTPException(status_code=403, detail="Not your trip")
    return res.data


def _load_budget(trip_id: str) -> dict | None:
    res = (
        service_client().table("trip_budgets")
        .select("*").eq("trip_id", trip_id).maybe_single().execute()
    )
    return res.data if res and res.data else None


@router.get("/trips/{slug}/budget", response_model=Budget)
def get_budget(slug: str, user: CurrentUser) -> Budget:
    trip = _load_trip_or_404(slug, user["sub"])
    row = _load_budget(trip["id"])
    if not row:
        raise HTTPException(status_code=404, detail="Budget not generated")
    return Budget(**row)


@router.put("/trips/{slug}/budget/days/{day_number}", response_model=BudgetDay)
def put_budget_day(
    slug: str, day_number: int, body: BudgetDayIn, user: CurrentUser,
) -> BudgetDay:
    trip = _load_trip_or_404(slug, user["sub"])
    row = _load_budget(trip["id"])
    if not row:
        raise HTTPException(status_code=404, detail="Budget not generated")

    days = row["days"]
    idx = next((i for i, d in enumerate(days) if d["number"] == day_number), None)
    if idx is None:
        raise HTTPException(status_code=404, detail=f"Day {day_number} not found")

    days[idx] = {
        **days[idx],
        "override": body.override,
        "items": [item.model_dump() for item in body.items],
    }

    res = (
        service_client().table("trip_budgets")
        .update({
            "days": days,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        })
        .eq("trip_id", trip["id"]).execute()
    )
    if not res.data:
        raise HTTPException(status_code=500, detail="update returned no row")
    return BudgetDay(**res.data[0]["days"][idx])


@router.post("/trips/{slug}/budget/regenerate", response_model=Budget)
def regenerate_budget(slug: str, user: CurrentUser) -> Budget:
    trip = _load_trip_or_404(slug, user["sub"])
    existing = _load_budget(trip["id"]) or {"days": []}

    estimate: BudgetEstimateRaw = budget_estimate(
        trip["destination"],
        trip["days"],
        trip.get("travel_style", ""),
    )
    fx = get_gbp_rate(estimate.currency)

    # Preserve user's overrides + items keyed by day number.
    prior_by_num = {d["number"]: d for d in existing.get("days", [])}
    new_days = []
    for ed in estimate.days:
        prior = prior_by_num.get(ed.number, {})
        new_days.append({
            "number": ed.number,
            "title": prior.get("title", f"Day {ed.number}"),
            "estimated": ed.estimated,
            "override": prior.get("override"),
            "items": prior.get("items", []),
        })

    row = {
        "trip_id": trip["id"],
        "currency": estimate.currency,
        "gbp_rate": fx.rate,
        "gbp_rate_date": fx.fetched_on.isoformat(),
        "days": new_days,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }

    res = (
        service_client().table("trip_budgets")
        .upsert(row, on_conflict="trip_id").execute()
    )
    if not res.data:
        raise HTTPException(status_code=500, detail="upsert returned no row")
    return Budget(**res.data[0])


def fetch_budget_for(trip_id: str) -> dict | None:
    """Helper used by other routes (e.g. PDF) that need read-only access."""
    return _load_budget(trip_id)
```

- [ ] **Step 4: Wire the router**

In `api/api/main.py`, after the existing imports add:

```python
from api.routes import budget as budget_routes
```

After existing `app.include_router(...)` lines:

```python
app.include_router(budget_routes.router)
```

- [ ] **Step 5: Add conftest default for fetch_budget_for**

Edit `api/tests/conftest.py`. Find:

```python
    for path in (
        "api.routes.trips.fetch_profile_for",
        "api.routes.pdf.fetch_profile_for",
    ):
        try:
            monkeypatch.setattr(path, lambda _uid: None)
        except AttributeError:
            # Module doesn't import the helper yet (e.g., before Task 7) — fine.
            pass
```

Replace with:

```python
    for path in (
        "api.routes.trips.fetch_profile_for",
        "api.routes.pdf.fetch_profile_for",
    ):
        try:
            monkeypatch.setattr(path, lambda _uid: None)
        except AttributeError:
            pass

    for path in (
        "api.routes.pdf.fetch_budget_for",
    ):
        try:
            monkeypatch.setattr(path, lambda _trip_id: None)
        except AttributeError:
            pass
```

- [ ] **Step 6: Run tests**

```bash
cd /Users/viggy/travel-planning/api && source .venv/bin/activate
pytest tests/test_routes_budget.py -v
```
Expected: 9 passed.

- [ ] **Step 7: Commit**

```bash
cd /Users/viggy/travel-planning
git add api/
git commit -m "$(cat <<'EOF'
Add budget routes: GET / PUT day / POST regenerate

Regenerate preserves per-day overrides and items by day-number;
new estimated values from the LLM and a fresh FX snapshot.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Wire budget into trip-creation streaming

**Files:**
- Modify: `api/api/routes/trips.py`
- Test: `api/tests/test_routes_trips.py`

- [ ] **Step 1: Write failing test**

Append to `api/tests/test_routes_trips.py`:

```python
def test_post_trips_stream_creates_budget(monkeypatch, auth_headers) -> None:
    """When budget_estimate succeeds, the stream inserts a trip_budgets row."""
    from datetime import date

    from api.fx import FxRate
    from api.models import BudgetEstimateDay, BudgetEstimateRaw

    monkeypatch.setattr(
        "api.routes.trips.parse_brief",
        lambda b: MagicMock(
            destination="Kyoto", days=2, travel_style="brief style",
            start_date=None, airport_entry=None, airport_exit=None,
        ),
    )
    monkeypatch.setattr(
        "api.routes.trips.stream_travel_research",
        lambda *_a, **_k: iter([("result", {"document": "## x", "places": []})]),
    )
    monkeypatch.setattr("api.routes.trips.geocode_place", lambda n: (35.0, 135.7))
    monkeypatch.setattr(
        "api.routes.trips.budget_estimate",
        lambda *_a, **_k: BudgetEstimateRaw(
            currency="JPY",
            days=[BudgetEstimateDay(number=1, estimated=18000),
                  BudgetEstimateDay(number=2, estimated=22000)],
        ),
    )
    monkeypatch.setattr(
        "api.routes.trips.get_gbp_rate",
        lambda c: FxRate(rate=0.0052, fetched_on=date(2026, 5, 3)),
    )

    captured: dict = {}
    trips_table = MagicMock()
    trips_table.insert.return_value.execute.return_value = MagicMock(data=[{
        "id": "t1", "slug": "kyoto-2d-z", "user_id": "u", "destination": "Kyoto",
        "days": 2, "travel_style": "brief style",
        "start_date": None, "airport_entry": None, "airport_exit": None,
        "document": {"document_markdown": "## x", "places": [], "neighborhoods": []},
        "places": [], "created_at": "2026-05-03T00:00:00+00:00",
    }])
    budgets_table = MagicMock()

    def upsert_side_effect(row, on_conflict=None):
        captured["budget"] = row
        chain = MagicMock()
        chain.execute.return_value = MagicMock(data=[row])
        return chain

    budgets_table.upsert.side_effect = upsert_side_effect

    def table_router(name: str) -> MagicMock:
        return trips_table if name == "trips" else budgets_table

    client = MagicMock()
    client.table.side_effect = table_router
    monkeypatch.setattr("api.routes.trips.service_client", lambda: client)

    with TestClient(app).stream(
        "POST", "/trips/stream",
        headers=auth_headers, json={"text": "Kyoto"},
    ) as res:
        res.read()

    assert captured["budget"]["currency"] == "JPY"
    assert captured["budget"]["trip_id"] == "t1"
    assert captured["budget"]["days"][0]["estimated"] == 18000


def test_post_trips_stream_succeeds_when_budget_fails(monkeypatch, auth_headers) -> None:
    """If budget_estimate raises, trip creation still completes."""
    monkeypatch.setattr(
        "api.routes.trips.parse_brief",
        lambda b: MagicMock(
            destination="Kyoto", days=2, travel_style="x",
            start_date=None, airport_entry=None, airport_exit=None,
        ),
    )
    monkeypatch.setattr(
        "api.routes.trips.stream_travel_research",
        lambda *_a, **_k: iter([("result", {"document": "## x", "places": []})]),
    )
    monkeypatch.setattr("api.routes.trips.geocode_place", lambda n: (35.0, 135.7))

    def boom(*_a, **_k):
        raise RuntimeError("LLM hiccup")

    monkeypatch.setattr("api.routes.trips.budget_estimate", boom)

    trips_table = MagicMock()
    trips_table.insert.return_value.execute.return_value = MagicMock(data=[{
        "id": "t1", "slug": "kyoto-2d-y", "user_id": "u", "destination": "Kyoto",
        "days": 2, "travel_style": "x",
        "start_date": None, "airport_entry": None, "airport_exit": None,
        "document": {"document_markdown": "## x", "places": [], "neighborhoods": []},
        "places": [], "created_at": "2026-05-03T00:00:00+00:00",
    }])

    def table_router(name: str) -> MagicMock:
        return trips_table if name == "trips" else MagicMock()

    client = MagicMock()
    client.table.side_effect = table_router
    monkeypatch.setattr("api.routes.trips.service_client", lambda: client)

    with TestClient(app).stream(
        "POST", "/trips/stream",
        headers=auth_headers, json={"text": "Kyoto"},
    ) as res:
        body = res.read().decode()

    assert "event: done" in body
    assert "kyoto-2d-y" in body
```

- [ ] **Step 2: Run to verify failure**

```bash
cd /Users/viggy/travel-planning/api && source .venv/bin/activate
pytest tests/test_routes_trips.py::test_post_trips_stream_creates_budget -v
```
Expected: FAIL — `budget_estimate` not patched into `api.routes.trips`.

- [ ] **Step 3: Wire the budget arm**

Edit `api/api/routes/trips.py`. Find the import block and add:

```python
from api.fx import get_gbp_rate
from api.llm.budget import budget_estimate
from api.models import BudgetEstimateRaw
```

(Keep all existing imports.)

Find `def events():` inside `create_trip_stream`. After the `addendum = profile_addendum(fetch_profile_for(user["sub"]))` line and the `combine` helper, the executor is created with `max_workers=2`. Bump to 3:

```python
        executor = concurrent.futures.ThreadPoolExecutor(max_workers=3)
```

Just before the `try:` block that uses the executor, kick off the budget call. The destination + days might come from `fast_dest`/`fast_days` OR from `parsed_now`. So we need a small helper to defer:

Replace the whole `try: ... finally: ...` block in `events()` with:

```python
        try:
            if fast_dest and fast_days:
                yield ("status", f"Researching {fast_dest} for {fast_days} days…")
                parse_future = executor.submit(parse_brief, brief)
                research_dest, research_days, research_style = (
                    fast_dest,
                    fast_days,
                    combine(brief.text),
                )
                budget_future = executor.submit(
                    budget_estimate, fast_dest, fast_days, combine(brief.text),
                )
            else:
                yield ("status", "Parsing your brief…")
                parsed_now = parse_brief(brief)
                yield (
                    "status",
                    f"Researching {parsed_now.destination} for {parsed_now.days} days…",
                )
                parse_future = executor.submit(lambda: parsed_now)
                research_dest, research_days, research_style = (
                    parsed_now.destination,
                    parsed_now.days,
                    combine(parsed_now.travel_style),
                )
                budget_future = executor.submit(
                    budget_estimate, parsed_now.destination, parsed_now.days,
                    combine(parsed_now.travel_style),
                )

            research: dict[str, Any] | None = None
            for ev_type, payload in stream_travel_research(
                research_dest, research_days, research_style
            ):
                if ev_type == "progress":
                    yield ("progress", payload)
                elif ev_type == "result":
                    research = payload
                elif ev_type == "error":
                    yield ("status", f"Research error: {payload}")
                    return
            if research is None:
                yield ("status", "Research failed: no response")
                return

            parsed = parse_future.result(timeout=30)
        finally:
            executor.shutdown(wait=False)
```

Then, after the existing trip insert (the `res = service_client().table("trips").insert(row).execute()` block), append:

```python
        # Persist the budget row alongside, if the LLM call + FX fetch succeeded.
        try:
            estimate: BudgetEstimateRaw = budget_future.result(timeout=30)
            fx = get_gbp_rate(estimate.currency)
            budget_row = {
                "trip_id": res.data[0]["id"],
                "currency": estimate.currency,
                "gbp_rate": fx.rate,
                "gbp_rate_date": fx.fetched_on.isoformat(),
                "days": [
                    {
                        "number": d.number,
                        "title": f"Day {d.number}",
                        "estimated": d.estimated,
                        "override": None,
                        "items": [],
                    }
                    for d in estimate.days
                ],
            }
            service_client().table("trip_budgets").upsert(
                budget_row, on_conflict="trip_id",
            ).execute()
        except Exception as e:
            # Budget is best-effort. Trip creation already succeeded.
            print(f"[trips.stream] budget persist failed: {e}")
```

(Place this right before the `yield ("done", {"slug": saved_slug})` line.)

Apply the same pattern to the synchronous `create_trip` route — after the trip insert, run the LLM serially and try to persist the budget, swallowing failures with a print.

- [ ] **Step 4: Run all trip tests**

```bash
cd /Users/viggy/travel-planning/api && source .venv/bin/activate
pytest tests/test_routes_trips.py -v
```
Expected: all green including the two new tests.

- [ ] **Step 5: Commit**

```bash
cd /Users/viggy/travel-planning
git add api/
git commit -m "$(cat <<'EOF'
Generate trip budget in parallel with research at trip creation

Best-effort: a budget LLM failure or FX fetch failure no longer blocks
trip creation; the Budget tab will surface the empty state instead.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase 3 — PDF cost categories

### Task 7: pdf_costs LLM helper

**Files:**
- Create: `api/api/llm/pdf_costs.py`
- Test: `api/tests/test_llm_pdf_costs.py`

- [ ] **Step 1: Write failing tests**

Create `api/tests/test_llm_pdf_costs.py`:

```python
from unittest.mock import MagicMock, patch

from api.llm.pdf_costs import estimate_pdf_costs


def _fake_response(content: str) -> MagicMock:
    msg = MagicMock(content=content)
    choice = MagicMock(message=msg)
    return MagicMock(choices=[choice])


def test_estimate_pdf_costs_returns_four_categories():
    payload = (
        '{"currency":"JPY","categories":['
        '{"name":"Lodging","amount":80000},'
        '{"name":"Food","amount":40000},'
        '{"name":"Activities","amount":30000},'
        '{"name":"Transport","amount":15000}'
        "]}"
    )
    with patch("api.llm.pdf_costs.client") as mock_client:
        mock_client.chat.completions.create.return_value = _fake_response(payload)
        out = estimate_pdf_costs(
            destination="Kyoto",
            travel_style="vegetarian, mid budget",
            day_titles=["Arrival", "Temples"],
            day_estimates=[18000, 22000],
            hotel_names=["Hotel Granvia"],
            gbp_rate=0.0052,
        )
    assert out.currency == "JPY"
    assert {c.name for c in out.categories} == {
        "Lodging", "Food", "Activities", "Transport",
    }
    lodging = next(c for c in out.categories if c.name == "Lodging")
    assert lodging.amount == 80000
    assert lodging.gbp_amount == round(80000 * 0.0052)
    assert out.total_local == 80000 + 40000 + 30000 + 15000


def test_estimate_pdf_costs_strips_fences():
    payload = (
        "```json\n"
        '{"currency":"EUR","categories":['
        '{"name":"Lodging","amount":300},'
        '{"name":"Food","amount":150},'
        '{"name":"Activities","amount":100},'
        '{"name":"Transport","amount":40}'
        "]}\n```"
    )
    with patch("api.llm.pdf_costs.client") as mock_client:
        mock_client.chat.completions.create.return_value = _fake_response(payload)
        out = estimate_pdf_costs(
            destination="Lisbon", travel_style="", day_titles=[],
            day_estimates=[], hotel_names=[], gbp_rate=0.85,
        )
    assert out.currency == "EUR"
    assert out.total_local == 590
```

- [ ] **Step 2: Run to verify failure**

```bash
cd /Users/viggy/travel-planning/api && source .venv/bin/activate
pytest tests/test_llm_pdf_costs.py -v
```
Expected: FAIL — `ModuleNotFoundError`.

- [ ] **Step 3: Write the helper**

Create `api/api/llm/pdf_costs.py`:

```python
"""Categorised cost estimate for the PDF Estimated-costs page."""

from __future__ import annotations

import json
import re

from api.llm.client import client
from api.models import PdfCostCategory, PdfCosts

_MODEL = "google/gemini-2.5-flash-lite"

_PROMPT = """You estimate trip costs by category for a printable travel guide.

Destination: {destination}
Travel style: {travel_style}
Days: {n_days}
Day plans: {day_titles}
Per-day budgets (destination currency, sums to non-lodging spend):
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
    resp = client.chat.completions.create(
        model=_MODEL,
        messages=[{"role": "user", "content": prompt}],
        temperature=0.2,
    )
    raw = resp.choices[0].message.content.strip()
    fence = re.match(r"^```(?:json)?\s*(.*?)\s*```$", raw, flags=re.S)
    if fence:
        raw = fence.group(1)
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
```

- [ ] **Step 4: Run tests**

```bash
cd /Users/viggy/travel-planning/api && source .venv/bin/activate
pytest tests/test_llm_pdf_costs.py -v
```
Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
cd /Users/viggy/travel-planning
git add api/
git commit -m "$(cat <<'EOF'
Add pdf_costs LLM helper for the Estimated-costs PDF page

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: Wire pdf_costs + render in PDF + flag in route

**Files:**
- Modify: `api/api/llm/pdf_plan.py` (call pdf_costs after days, attach to plan, add `costs` to PdfSections)
- Modify: `api/api/pdf.py` (render the page)
- Modify: `api/api/routes/pdf.py` (thread the costs flag, pass budget anchors + hotels into stream_pdf_plan)

- [ ] **Step 1: Add costs to PdfSections + extend stream_pdf_plan**

Open `api/api/llm/pdf_plan.py`. Find the `PdfSections` dataclass and add `costs`:

```python
@dataclass(frozen=True)
class PdfSections:
    food: bool = True
    photos: bool = True
    tips: bool = True
    costs: bool = True
```

Find the `stream_pdf_plan` signature. Extend it to accept `day_estimates`, `hotel_names`, and `gbp_rate`:

```python
def stream_pdf_plan(
    *,
    destination: str,
    total_days: int,
    travel_style: str,
    base_md: str,
    sections: PdfSections,
    start_date_iso: str | None,
    day_estimates: list[int] | None = None,
    hotel_names: list[str] | None = None,
    gbp_rate: float | None = None,
) -> Iterator[tuple[str, Any]]:
```

After the existing per-day loop completes and `plan` has been assembled, before the final `yield ("plan", plan)`, add the costs pass:

```python
    if sections.costs and gbp_rate is not None:
        yield ("stage", {"key": "costs", "label": "Estimating costs", "status": "running"})
        try:
            from api.llm.pdf_costs import estimate_pdf_costs

            costs = estimate_pdf_costs(
                destination=destination,
                travel_style=travel_style,
                day_titles=[d.title for d in plan.days],
                day_estimates=day_estimates or [],
                hotel_names=hotel_names or [],
                gbp_rate=gbp_rate,
            )
            plan = plan.model_copy(update={"costs": costs})
            yield ("stage", {"key": "costs", "label": "Estimating costs", "status": "done"})
        except Exception as e:
            yield ("stage", {"key": "costs", "label": "Estimating costs",
                             "status": "error", "message": str(e)})
            # Plan still ships without the costs page.
```

(Locate the precise insertion point: just before whatever line yields the final assembled plan to the route. Inspect the file when implementing.)

- [ ] **Step 2: Render the costs page in `api/api/pdf.py`**

Open `api/api/pdf.py`. After the per-day rendering loop in `render_plan_pdf` (and after any tips section), add a new helper call:

```python
    if plan.costs is not None:
        _render_costs_page(pdf, plan.costs)
```

Add the helper at the bottom of the module:

```python
def _render_costs_page(pdf: FPDF, costs: PdfCosts) -> None:
    pdf.add_page()
    pdf.set_font("body", "B", 22)
    pdf.set_text_color(*BRICK)
    pdf.cell(0, 12, "Estimated costs", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(2)

    pdf.set_font("body", "", 10)
    pdf.set_text_color(*INK_500)
    pdf.cell(0, 6, f"In {costs.currency} (GBP at rate {costs.gbp_rate:.4f}).",
             new_x="LMARGIN", new_y="NEXT")
    pdf.ln(6)

    max_amount = max((c.amount for c in costs.categories), default=1)
    bar_w_max = pdf.w - pdf.l_margin - pdf.r_margin - 80  # 80 reserved for label + numbers

    for cat in costs.categories:
        # Row: NAME .... ¥amount (£gbp) [bar]
        y = pdf.get_y()
        pdf.set_font("body", "B", 11)
        pdf.set_text_color(*INK_900)
        pdf.cell(40, 7, cat.name, new_x="RIGHT", new_y="TOP")

        pdf.set_font("body", "", 10)
        pdf.set_text_color(*INK_700)
        pdf.cell(40, 7, f"{cat.amount:,} {costs.currency} (£{cat.gbp_amount:,})",
                 new_x="RIGHT", new_y="TOP")

        bar_x = pdf.get_x()
        bar_w = bar_w_max * (cat.amount / max_amount) if max_amount else 0
        pdf.set_fill_color(*AMBER_200)
        pdf.rect(bar_x, y + 1.5, bar_w, 4, "F")
        pdf.set_y(y + 9)

    pdf.ln(4)
    pdf.set_draw_color(*INK_200)
    pdf.set_line_width(0.3)
    pdf.line(pdf.l_margin, pdf.get_y(), pdf.w - pdf.r_margin, pdf.get_y())
    pdf.ln(4)

    pdf.set_font("body", "B", 13)
    pdf.set_text_color(*BRICK)
    pdf.cell(40, 9, "Total")
    pdf.set_text_color(*INK_900)
    pdf.cell(0, 9, f"{costs.total_local:,} {costs.currency} (£{costs.total_gbp:,})",
             new_x="LMARGIN", new_y="NEXT")

    pdf.ln(8)
    pdf.set_font("body", "I", 8)
    pdf.set_text_color(*INK_500)
    pdf.multi_cell(0, 4, "Estimates based on the itinerary; actual prices vary.")
```

(`AMBER_200`, `INK_*`, `BRICK` constants already exist in the file. If `AMBER_200` doesn't, derive from the existing palette — e.g. `(240, 200, 130)`. Adapt to whatever already exists in the palette section.)

Add `PdfCosts` to the existing imports at the top of `pdf.py`.

- [ ] **Step 3: Pass anchors from `routes/pdf.py`**

In `api/api/routes/pdf.py`, extend `PdfBuildIn`:

```python
class PdfBuildIn(BaseModel):
    food: bool = True
    photos: bool = True
    tips: bool = True
    costs: bool = True
```

Inside `build_pdf`, after fetching the trip row and computing `travel_style`, fetch budget + hotels for anchoring:

```python
    from api.routes.budget import fetch_budget_for

    bgt = fetch_budget_for(row["id"]) or {}
    day_estimates = [
        (d.get("override") if d.get("override") is not None else d.get("estimated", 0))
        + sum(it.get("amount", 0) for it in d.get("items", []))
        for d in bgt.get("days", [])
    ]
    gbp_rate = bgt.get("gbp_rate")

    hotel_names: list[str] = []
    nbhs = doc.neighborhoods or []
    for n in nbhs:
        for h in (n.hotels if hasattr(n, "hotels") else n.get("hotels", []) or []):
            name = h.name if hasattr(h, "name") else h.get("name")
            if name:
                hotel_names.append(name)

    sections = PdfSections(
        food=body.food, photos=body.photos, tips=body.tips, costs=body.costs,
    )
```

Then pass through into `stream_pdf_plan`:

```python
        for ev_type, payload in stream_pdf_plan(
            destination=destination,
            total_days=days,
            travel_style=travel_style,
            base_md=base_md,
            sections=sections,
            start_date_iso=start_date_iso,
            day_estimates=day_estimates,
            hotel_names=hotel_names,
            gbp_rate=gbp_rate,
        ):
```

- [ ] **Step 4: Run pdf tests**

```bash
cd /Users/viggy/travel-planning/api && source .venv/bin/activate
pytest tests/test_routes_pdf.py tests/test_llm_pdf_costs.py -v
```
Expected: green. Existing PDF tests still pass; new costs tests pass.

- [ ] **Step 5: Manual smoke**

```bash
cd /Users/viggy/travel-planning/api && source .venv/bin/activate
pytest -q
```
Expected: full suite green.

- [ ] **Step 6: Commit**

```bash
cd /Users/viggy/travel-planning
git add api/
git commit -m "$(cat <<'EOF'
Add Estimated-costs page to PDF (Lodging/Food/Activities/Transport)

Single LLM pass after per-day plans, anchored to budget overrides and
chosen hotels. Toggleable via the Costs flag in PdfBuildIn.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase 4 — Frontend types + API + currency + hook

### Task 9: Types + currency helper + API methods

**Files:**
- Modify: `web/src/lib/types.ts`
- Modify: `web/src/lib/api.ts`
- Create: `web/src/lib/currency.ts`

- [ ] **Step 1: Append types**

Append to `web/src/lib/types.ts`:

```typescript
export interface BudgetItem {
  name: string;
  amount: number;
}

export interface BudgetDay {
  number: number;
  title: string;
  estimated: number;
  override: number | null;
  items: BudgetItem[];
}

export interface Budget {
  trip_id: string;
  currency: string;
  gbp_rate: number;
  gbp_rate_date: string;
  days: BudgetDay[];
  updated_at: string;
}

export interface BudgetDayIn {
  override: number | null;
  items: BudgetItem[];
}

export interface PdfCostCategory {
  name: "Lodging" | "Food" | "Activities" | "Transport";
  amount: number;
  gbp_amount: number;
}

export interface PdfCosts {
  currency: string;
  gbp_rate: number;
  categories: PdfCostCategory[];
  total_local: number;
  total_gbp: number;
}
```

- [ ] **Step 2: Currency helpers**

Create `web/src/lib/currency.ts`:

```typescript
export function formatLocal(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency: currency,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${amount.toLocaleString("en-GB")} ${currency}`;
  }
}

export function formatGbp(amount: number): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function combined(local: number, currency: string, gbp_rate: number): string {
  const gbp = Math.round(local * gbp_rate);
  return `${formatLocal(local, currency)} (${formatGbp(gbp)})`;
}

export function dayTotal(day: { estimated: number; override: number | null; items: { amount: number }[] }): number {
  const base = day.override ?? day.estimated;
  const items = day.items.reduce((sum, it) => sum + it.amount, 0);
  return base + items;
}
```

- [ ] **Step 3: API methods**

Append to `web/src/lib/api.ts`. Update the `import type` line at the top to include the new types:

```typescript
import type {
  Budget,
  BudgetDay,
  BudgetDayIn,
  Neighborhood,
  TripBriefIn,
  TripFull,
  TripSummary,
  UserProfile,
  UserProfileIn,
} from "./types";
```

Append at the bottom of the file:

```typescript
export async function getBudget(slug: string, token: string): Promise<Budget | null> {
  const res = await authedFetch(`/trips/${slug}/budget`, { method: "GET" }, token);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`getBudget ${res.status}`);
  return res.json();
}

export async function regenerateBudget(slug: string, token: string): Promise<Budget> {
  const res = await authedFetch(
    `/trips/${slug}/budget/regenerate`, { method: "POST" }, token,
  );
  if (!res.ok) throw new Error(`regenerateBudget ${res.status}`);
  return res.json();
}

export async function updateBudgetDay(
  slug: string, day: number, body: BudgetDayIn, token: string,
): Promise<BudgetDay> {
  const res = await authedFetch(
    `/trips/${slug}/budget/days/${day}`,
    { method: "PUT", body: JSON.stringify(body) },
    token,
  );
  if (!res.ok) throw new Error(`updateBudgetDay ${res.status}`);
  return res.json();
}
```

- [ ] **Step 4: Type-check**

```bash
cd /Users/viggy/travel-planning/web && npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
cd /Users/viggy/travel-planning
git add web/
git commit -m "$(cat <<'EOF'
Add Budget types, currency helpers, and API client methods

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 10: useBudget hook

**Files:**
- Create: `web/src/lib/budget.ts`

- [ ] **Step 1: Write the hook**

Create `web/src/lib/budget.ts`:

```typescript
"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { getBudget, regenerateBudget, updateBudgetDay } from "./api";
import { getBrowserToken } from "./auth.browser";
import type { Budget, BudgetDay, BudgetItem } from "./types";

const DEBOUNCE_MS = 800;

export function useBudget(slug: string, initial: Budget | null) {
  const [budget, setBudget] = useState<Budget | null>(initial);
  const [error, setError] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<"idle" | "regenerating">("idle");

  const debounceRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const setDay = useCallback(
    (dayNumber: number, partial: Partial<Pick<BudgetDay, "override" | "items">>) => {
      setBudget((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          days: prev.days.map((d) =>
            d.number === dayNumber ? { ...d, ...partial } : d,
          ),
        };
      });

      const existing = debounceRef.current.get(dayNumber);
      if (existing) clearTimeout(existing);
      const t = setTimeout(async () => {
        const day = budget?.days.find((d) => d.number === dayNumber);
        const merged = { ...day, ...partial } as BudgetDay | undefined;
        if (!merged) return;
        try {
          const token = await getBrowserToken();
          if (!token) return;
          await updateBudgetDay(
            slug, dayNumber,
            { override: merged.override, items: merged.items },
            token,
          );
        } catch (e) {
          console.error("updateBudgetDay failed", e);
          setError("Save failed. Refresh and try again.");
        }
      }, DEBOUNCE_MS);
      debounceRef.current.set(dayNumber, t);
    },
    [slug, budget],
  );

  const addItem = useCallback(
    (dayNumber: number, item: BudgetItem) => {
      const day = budget?.days.find((d) => d.number === dayNumber);
      if (!day) return;
      setDay(dayNumber, { items: [...day.items, item] });
    },
    [budget, setDay],
  );

  const removeItem = useCallback(
    (dayNumber: number, idx: number) => {
      const day = budget?.days.find((d) => d.number === dayNumber);
      if (!day) return;
      setDay(dayNumber, { items: day.items.filter((_, i) => i !== idx) });
    },
    [budget, setDay],
  );

  const regenerate = useCallback(async () => {
    setBusyAction("regenerating");
    setError(null);
    try {
      const token = await getBrowserToken();
      if (!token) return;
      const fresh = await regenerateBudget(slug, token);
      setBudget(fresh);
    } catch (e) {
      console.error("regenerate failed", e);
      setError("Could not refresh estimates. Please try again.");
    } finally {
      setBusyAction("idle");
    }
  }, [slug]);

  // If we don't have a budget yet on first load, try to fetch (the
  // server might have failed to generate one). This covers older trips.
  useEffect(() => {
    if (budget !== null) return;
    let cancelled = false;
    (async () => {
      const token = await getBrowserToken();
      if (!token) return;
      const fetched = await getBudget(slug, token).catch(() => null);
      if (!cancelled && fetched) setBudget(fetched);
    })();
    return () => { cancelled = true; };
  }, [budget, slug]);

  // Flush pending debounces on unmount.
  useEffect(() => {
    const debounces = debounceRef.current;
    return () => {
      debounces.forEach((t) => clearTimeout(t));
    };
  }, []);

  return { budget, error, busyAction, setDay, addItem, removeItem, regenerate };
}
```

- [ ] **Step 2: Type-check**

```bash
cd /Users/viggy/travel-planning/web && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
cd /Users/viggy/travel-planning
git add web/
git commit -m "$(cat <<'EOF'
Add useBudget hook (optimistic updates + debounced PUT)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase 5 — Frontend UI

### Task 11: BudgetItemRow + BudgetDayRow + BudgetTab

**Files:**
- Create: `web/src/components/BudgetItemRow.tsx`
- Create: `web/src/components/BudgetDayRow.tsx`
- Create: `web/src/components/BudgetTab.tsx`

- [ ] **Step 1: BudgetItemRow**

Create `web/src/components/BudgetItemRow.tsx`:

```tsx
"use client";

import { combined } from "@/lib/currency";
import type { BudgetItem } from "@/lib/types";

export function BudgetItemRow({
  item, currency, gbpRate, onRemove,
}: {
  item: BudgetItem;
  currency: string;
  gbpRate: number;
  onRemove: () => void;
}) {
  return (
    <div className="group flex items-center justify-between text-xs text-ink-700 px-2 py-1 rounded hover:bg-white/60">
      <span className="truncate">{item.name}</span>
      <div className="flex items-center gap-2 shrink-0">
        <span className="text-ink-500">{combined(item.amount, currency, gbpRate)}</span>
        <button
          type="button"
          onClick={onRemove}
          className="text-ink-300 hover:text-rose-500 opacity-0 group-hover:opacity-100"
          aria-label={`Remove ${item.name}`}
        >
          ×
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: BudgetDayRow**

Create `web/src/components/BudgetDayRow.tsx`:

```tsx
"use client";

import { useState } from "react";

import { BudgetItemRow } from "./BudgetItemRow";
import { combined, dayTotal, formatGbp } from "@/lib/currency";
import type { BudgetDay } from "@/lib/types";

export function BudgetDayRow({
  day, currency, gbpRate,
  onOverride, onAddItem, onRemoveItem,
}: {
  day: BudgetDay;
  currency: string;
  gbpRate: number;
  onOverride: (value: number | null) => void;
  onAddItem: (item: { name: string; amount: number }) => void;
  onRemoveItem: (idx: number) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");

  const total = dayTotal(day);

  function submitItem() {
    const value = Number(amount);
    if (!name.trim() || !Number.isFinite(value) || value < 0) return;
    onAddItem({ name: name.trim(), amount: Math.round(value) });
    setName("");
    setAmount("");
    setAdding(false);
  }

  return (
    <div id={`budget-day-${day.number}`} className="frosted rounded-[14px] p-4 flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs uppercase tracking-wider text-amber-700">Day {day.number}</div>
          <div className="text-sm font-semibold text-ink-900 truncate">{day.title}</div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-xs text-ink-500">Total</div>
          <div className="text-sm font-semibold text-ink-900">
            {combined(total, currency, gbpRate)}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 text-xs">
        <span className="text-ink-500">Estimate:</span>
        <input
          type="number"
          inputMode="numeric"
          min={0}
          value={day.override ?? day.estimated}
          onChange={(e) => {
            const v = e.target.value === "" ? null : Math.max(0, Math.round(Number(e.target.value)));
            onOverride(v);
          }}
          className="w-28 rounded-[8px] bg-white/80 border border-amber-700/12 px-2 py-1 text-sm text-ink-900 outline-none focus:border-amber-600/40"
        />
        <span className="text-ink-500">{currency}</span>
        <span className="text-ink-300">·</span>
        <span className="text-ink-500">≈ {formatGbp(Math.round((day.override ?? day.estimated) * gbpRate))}</span>
        {day.override !== null && day.override !== day.estimated && (
          <button
            type="button"
            onClick={() => onOverride(null)}
            className="text-ink-500 hover:text-ink-900 underline ml-2"
            title="Reset to AI estimate"
          >
            reset
          </button>
        )}
      </div>

      {day.items.length > 0 && (
        <div className="flex flex-col">
          {day.items.map((it, i) => (
            <BudgetItemRow
              key={`${it.name}-${i}`}
              item={it}
              currency={currency}
              gbpRate={gbpRate}
              onRemove={() => onRemoveItem(i)}
            />
          ))}
        </div>
      )}

      {adding ? (
        <div className="flex items-center gap-2 text-xs">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Cooking class"
            className="flex-1 rounded-[8px] bg-white/80 border border-amber-700/12 px-2 py-1 text-sm text-ink-900 outline-none focus:border-amber-600/40"
            autoFocus
          />
          <input
            type="number"
            inputMode="numeric"
            min={0}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="4500"
            className="w-24 rounded-[8px] bg-white/80 border border-amber-700/12 px-2 py-1 text-sm text-ink-900 outline-none focus:border-amber-600/40"
            onKeyDown={(e) => { if (e.key === "Enter") submitItem(); }}
          />
          <button
            type="button"
            onClick={submitItem}
            className="rounded-[8px] bg-amber-600 text-white px-3 py-1 text-xs font-semibold hover:bg-amber-700"
          >
            Add
          </button>
          <button
            type="button"
            onClick={() => { setAdding(false); setName(""); setAmount(""); }}
            className="text-ink-500 hover:text-ink-900 text-xs"
          >
            cancel
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="text-xs text-amber-700 hover:text-amber-900 self-start"
        >
          + Add item
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 3: BudgetTab**

Create `web/src/components/BudgetTab.tsx`:

```tsx
"use client";

import { BudgetDayRow } from "./BudgetDayRow";
import { useBudget } from "@/lib/budget";
import { combined } from "@/lib/currency";
import type { Budget } from "@/lib/types";

export function BudgetTab({ slug, initial }: { slug: string; initial: Budget | null }) {
  const {
    budget, error, busyAction, setDay, addItem, removeItem, regenerate,
  } = useBudget(slug, initial);

  if (!budget) {
    return (
      <div className="frosted-strong rounded-[18px] p-6 text-center flex flex-col items-center gap-3">
        <p className="text-sm text-ink-700">No budget estimate yet.</p>
        <button
          type="button"
          onClick={regenerate}
          disabled={busyAction === "regenerating"}
          className="rounded-[10px] bg-gradient-to-br from-amber-400 to-amber-600 text-white text-sm py-2 px-5 font-medium hover:shadow-md disabled:opacity-50"
        >
          {busyAction === "regenerating" ? "Generating…" : "Generate budget"}
        </button>
        {error && <span className="text-xs text-rose-600">{error}</span>}
      </div>
    );
  }

  const tripTotal = budget.days.reduce(
    (sum, d) => sum + (d.override ?? d.estimated)
      + d.items.reduce((s, it) => s + it.amount, 0),
    0,
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="frosted-strong rounded-[18px] p-5 flex items-baseline justify-between">
        <div>
          <div className="text-xs uppercase tracking-wider text-amber-700">Trip total</div>
          <div className="font-display text-2xl font-semibold text-ink-900">
            {combined(tripTotal, budget.currency, budget.gbp_rate)}
          </div>
        </div>
        <button
          type="button"
          onClick={regenerate}
          disabled={busyAction === "regenerating"}
          className="text-xs text-ink-500 hover:text-ink-900 disabled:opacity-50"
        >
          {busyAction === "regenerating" ? "Refreshing…" : "Refresh estimates"}
        </button>
      </div>

      {budget.days.map((d) => (
        <BudgetDayRow
          key={d.number}
          day={d}
          currency={budget.currency}
          gbpRate={budget.gbp_rate}
          onOverride={(value) => setDay(d.number, { override: value })}
          onAddItem={(item) => addItem(d.number, item)}
          onRemoveItem={(idx) => removeItem(d.number, idx)}
        />
      ))}

      <div className="text-[11px] text-ink-500 text-center">
        FX rate snapshotted {budget.gbp_rate_date}.
      </div>

      {error && <div className="text-xs text-rose-600 text-center">{error}</div>}
    </div>
  );
}
```

- [ ] **Step 4: Type-check**

```bash
cd /Users/viggy/travel-planning/web && npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
cd /Users/viggy/travel-planning
git add web/
git commit -m "$(cat <<'EOF'
Add BudgetTab + BudgetDayRow + BudgetItemRow components

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 12: Wire Budget tab into trip page + DayCard pill + Costs checkbox

**Files:**
- Modify: `web/src/components/TripPanelTabs.tsx` (add Budget tab)
- Modify: `web/src/app/trip/[slug]/page.tsx` (server-fetch budget, pass down)
- Modify: `web/src/components/DayCard.tsx` (budget pill in header)
- Modify: `web/src/components/PdfExportMenu.tsx` (Costs checkbox)

- [ ] **Step 1: Add Budget tab to TripPanelTabs**

Open `web/src/components/TripPanelTabs.tsx`. Locate the existing tab list (e.g. `["Itinerary", "Hotels"]` or similar). Add a "Budget" entry. Locate where the panel content switches by tab key and add a `case "Budget":` branch that renders `<BudgetTab slug={slug} initial={budget} />`. Pass `slug` and `budget` props through from the parent. (Adapt to the file's actual shape — open and read it before editing.)

The component signature now needs:

```tsx
import { BudgetTab } from "./BudgetTab";
import type { Budget } from "@/lib/types";

export function TripPanelTabs({
  // ...existing props,
  slug, budget,
}: {
  // ...existing,
  slug: string;
  budget: Budget | null;
}) {
  // ...existing tab state
  // Add "Budget" to the tab labels list.
  // In the body, when active === "Budget", render <BudgetTab slug={slug} initial={budget} />
}
```

- [ ] **Step 2: Server-fetch budget in trip page**

In `web/src/app/trip/[slug]/page.tsx`, at the top of the page component (alongside the existing trip fetch), add:

```tsx
import { getBudget } from "@/lib/api";
// ...
const budget = token ? await getBudget(slug, token).catch(() => null) : null;
```

Pass it down to `<TripPanelTabs ... slug={slug} budget={budget} />`.

- [ ] **Step 3: DayCard budget pill**

In `web/src/components/DayCard.tsx`, accept an optional `budgetTotal` and `currency` + `gbpRate`. Render a small pill in the header right when `budgetTotal !== undefined`:

```tsx
import Link from "next/link";

import { combined } from "@/lib/currency";

export function DayCard({
  // existing props,
  dayNumber,
  budgetTotal,
  currency,
  gbpRate,
}: {
  // existing types,
  dayNumber: number;
  budgetTotal?: number;
  currency?: string;
  gbpRate?: number;
}) {
  return (
    <div className="...">
      <div className="flex items-center justify-between">
        <h3 className="...">Day {dayNumber} — {/* title */}</h3>
        {budgetTotal !== undefined && currency && gbpRate !== undefined && (
          <Link
            href={`#budget-day-${dayNumber}`}
            onClick={(e) => {
              // Switch to Budget tab if a parent handler is wired; otherwise
              // fall back to anchor scroll (works after first user click).
            }}
            className="text-[11px] rounded-full bg-amber-100 text-amber-800 px-2 py-0.5 hover:bg-amber-200"
            title="Open in Budget"
          >
            {combined(budgetTotal, currency, gbpRate)}
          </Link>
        )}
      </div>
      {/* existing body */}
    </div>
  );
}
```

The parent (likely `Itinerary.tsx` or similar) computes `budgetTotal` per day from the `budget` prop:

```tsx
const totalsByDay = new Map<number, number>(
  (budget?.days ?? []).map((d) => [
    d.number,
    (d.override ?? d.estimated) + d.items.reduce((s, it) => s + it.amount, 0),
  ]),
);

// when rendering DayCard:
<DayCard
  // existing props,
  dayNumber={d.number}
  budgetTotal={totalsByDay.get(d.number)}
  currency={budget?.currency}
  gbpRate={budget?.gbp_rate}
/>
```

(Adapt to whatever the existing Itinerary file shape looks like.)

- [ ] **Step 4: Costs checkbox in PdfExportMenu**

In `web/src/components/PdfExportMenu.tsx`, find the existing `food`/`photos`/`tips` toggle state and the JSON body sent to `/pdf/build`. Add `costs`:

```tsx
const [sections, setSections] = useState({
  food: true, photos: true, tips: true, costs: true,
});
```

Add a checkbox row to the menu phase between the existing options:

```tsx
<label className="flex items-center gap-2 text-sm">
  <input
    type="checkbox"
    checked={sections.costs}
    onChange={(e) => setSections((s) => ({ ...s, costs: e.target.checked }))}
  />
  <span>Costs</span>
</label>
```

In the `/pdf/build` POST body, include `costs: sections.costs`.

- [ ] **Step 5: Type-check + build**

```bash
cd /Users/viggy/travel-planning/web && npx tsc --noEmit
cd /Users/viggy/travel-planning/web && npm run build
```
Expected: clean.

- [ ] **Step 6: Commit**

```bash
cd /Users/viggy/travel-planning
git add web/
git commit -m "$(cat <<'EOF'
Wire Budget tab + DayCard pill + Costs PDF toggle

Server-fetches the budget alongside the trip so the inline pills appear
on first paint and the Budget tab renders without a loading state.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase 6 — Deploy

### Task 13: Deploy backend + verify

- [ ] **Step 1: Run full test suite**

```bash
cd /Users/viggy/travel-planning/api && source .venv/bin/activate
pytest -q
```
Expected: all green.

- [ ] **Step 2: Push (Vercel auto-deploys frontend)**

```bash
cd /Users/viggy/travel-planning
git push
```

- [ ] **Step 3: Deploy backend**

```bash
cd /Users/viggy/travel-planning/api && ./deploy.sh
```

- [ ] **Step 4: Smoke test on https://atlas.viggy.dev**

1. Open an existing trip → Budget tab → click "Generate budget" → row appears with per-day estimates.
2. Edit a day's override → wait 1s → reload → override persisted.
3. Add a line item → it appears with both currencies → reload → persisted.
4. Click a budget pill on the Itinerary tab → switches to Budget and scrolls to that day.
5. Build PDF with Costs ON → page 4 (or last) shows the categorised cost breakdown.
6. Build PDF with Costs OFF → no costs page.
7. Create a brand-new trip → on first open, Budget tab already populated.

- [ ] **Step 5: Done**

No commit — deploy is a side effect.

---

## Self-review

**1. Spec coverage**

| Spec section                           | Implemented in        |
| ---                                    | ---                   |
| `trip_budgets` table + RLS             | Task 1                |
| Pydantic models (Budget*, PdfCosts)    | Task 2                |
| FX module (frankfurter.app + memo)     | Task 3                |
| Budget LLM helper                      | Task 4                |
| GET / PUT day / regenerate routes      | Task 5                |
| Trip-creation parallel budget arm      | Task 6                |
| pdf_costs LLM helper                   | Task 7                |
| Costs section in PDF + render + flag   | Task 8                |
| Frontend types + API + currency helper | Task 9                |
| useBudget hook                         | Task 10               |
| BudgetTab + DayRow + ItemRow           | Task 11               |
| Wiring (tab, page fetch, pill, PDF)    | Task 12               |
| Deploy + verify                        | Task 13               |

**2. Placeholder scan** — no TBDs / TODOs / "add appropriate handling". Steps that wire into existing files (Task 8 step 1 in `pdf_plan.py`, Task 12 steps 1/3/4) intentionally direct the implementer to inspect the file before editing — those files have varied prior shape and prescribing exact line numbers would lie. Each such step still names the function to find, the prop to add, and the value to pass.

**3. Type consistency** — `BudgetDay` uses `override: number | null` and `items: BudgetItem[]` consistently across Pydantic, TypeScript, and the routes. `PdfCosts.categories[].name` is the same Literal in both Python (`Literal["Lodging", "Food", "Activities", "Transport"]`) and TypeScript. `gbp_rate` is `numeric(12,6)` in Postgres → `float` in Pydantic → `number` in TS. Day-number-as-key is consistent between PUT route, regenerate's preserve-by-day-number, and `setDay(dayNumber, ...)`.

**4. Out-of-scope items deferred** — categories in the in-app Budget tab, multi-currency display preferences, hotel-cost auto-merge, mid-trip "log actuals". All matched the spec.
