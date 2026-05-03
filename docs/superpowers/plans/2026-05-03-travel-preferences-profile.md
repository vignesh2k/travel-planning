# Travel Preferences Profile Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Per-user travel-preferences profile (diet, budget tier, pace, interests, notes) that silently augments every LLM call so users stop retyping the same preferences in every brief.

**Architecture:** New `user_profiles` table in Supabase (PK = user_id, RLS-scoped to owner). Two new FastAPI routes (`GET`/`PUT /me/profile`). A single `profile_addendum()` helper prepends profile context to `travel_style` at three existing LLM call sites (trips create + stream, pdf build). Frontend: a `/profile` settings page, a UserMenu link, and an empty-state banner on the home page when profile is null.

**Tech Stack:** Same as the rest — FastAPI, Pydantic v2, Supabase Postgres + RLS, Next.js 16, Tailwind v4. No new external deps.

**Spec reference:** [docs/superpowers/specs/2026-05-03-travel-preferences-profile-design.md](../specs/2026-05-03-travel-preferences-profile-design.md)

---

## File structure

```
api/api/
├── models.py                MODIFIED: add UserProfile, UserProfileIn
├── routes/profile.py        NEW: GET/PUT /me/profile
├── llm/profile.py           NEW: profile_addendum() helper
├── routes/trips.py          MODIFIED: fetch profile + prepend addendum
└── routes/pdf.py            MODIFIED: fetch profile + prepend addendum

api/api/main.py              MODIFIED: include profile router

api/tests/
├── test_models.py           MODIFIED: add UserProfile coercion tests
├── test_llm_profile.py      NEW: addendum rendering tests
└── test_routes_profile.py   NEW: GET/PUT endpoint tests

supabase/migrations/
└── 2026-05-03_user_profiles.sql   NEW: table + RLS policies

web/src/
├── lib/types.ts             MODIFIED: UserProfile, UserProfileIn
├── lib/api.ts               MODIFIED: getProfile, saveProfile
├── app/profile/page.tsx     NEW: server shell that loads profile
├── components/
│   ├── ProfileForm.tsx      NEW: client form (diet/budget/pace/interests/notes)
│   ├── ProfileBanner.tsx    NEW: empty-state nudge
│   └── UserMenu.tsx         MODIFIED: add "Preferences" link
└── app/page.tsx             MODIFIED: fetch profile, show banner if null
```

---

## Phase 1 — Backend: schema, models, helper

### Task 1: Supabase schema migration

**Files:**
- Create: `supabase/migrations/2026-05-03_user_profiles.sql`

- [ ] **Step 1: Write the migration**

```sql
create table public.user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  diet text,
  budget text check (budget in ('cheap', 'mid', 'premium')),
  pace text check (pace in ('relaxed', 'balanced', 'packed')),
  interests text[] not null default '{}',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_profiles enable row level security;

-- Each user can only read/write their own profile.
create policy user_profiles_select on public.user_profiles
  for select using (auth.uid() = user_id);
create policy user_profiles_insert on public.user_profiles
  for insert with check (auth.uid() = user_id);
create policy user_profiles_update on public.user_profiles
  for update using (auth.uid() = user_id);
create policy user_profiles_delete on public.user_profiles
  for delete using (auth.uid() = user_id);
```

- [ ] **Step 2: USER ACTION — apply in Supabase SQL editor**

Surface to the user: "Open the Supabase SQL editor for the project, paste the contents of `supabase/migrations/2026-05-03_user_profiles.sql`, and run. Verify in Table Editor that `user_profiles` appears."

- [ ] **Step 3: Commit**

```bash
cd /Users/viggy/travel-planning
git add supabase/
git commit -m "$(cat <<'EOF'
Add user_profiles table with RLS

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Pydantic models

**Files:**
- Modify: `api/api/models.py`
- Test: `api/tests/test_models.py`

- [ ] **Step 1: Write failing test**

Append to `api/tests/test_models.py`:

```python
from api.models import UserProfile, UserProfileIn


def test_user_profile_in_accepts_partial():
    p = UserProfileIn(diet="vegetarian")
    assert p.diet == "vegetarian"
    assert p.budget is None
    assert p.interests == []


def test_user_profile_in_rejects_invalid_budget():
    import pytest
    from pydantic import ValidationError

    with pytest.raises(ValidationError):
        UserProfileIn(budget="luxury")  # not in literal


def test_user_profile_in_accepts_all_fields():
    p = UserProfileIn(
        diet="pescatarian",
        budget="mid",
        pace="balanced",
        interests=["food", "photography"],
        notes="Knee injury",
    )
    assert p.budget == "mid"
    assert p.interests == ["food", "photography"]
```

- [ ] **Step 2: Run to verify failure**

```bash
cd /Users/viggy/travel-planning/api && source .venv/bin/activate
pytest tests/test_models.py -v
```
Expected: FAIL — `ImportError: cannot import name 'UserProfile' from 'api.models'`

- [ ] **Step 3: Add the models**

Append to `api/api/models.py`:

```python
# ── User profile ────────────────────────────────────────────────────────────


class UserProfileIn(BaseModel):
    """Per-user travel preferences. All fields optional."""
    diet: str | None = None
    budget: Literal["cheap", "mid", "premium"] | None = None
    pace: Literal["relaxed", "balanced", "packed"] | None = None
    interests: list[str] = Field(default_factory=list)
    notes: str | None = None


class UserProfile(UserProfileIn):
    updated_at: datetime
```

- [ ] **Step 4: Run tests**

```bash
cd /Users/viggy/travel-planning/api && source .venv/bin/activate
pytest tests/test_models.py -v
```
Expected: 3 new tests pass.

- [ ] **Step 5: Commit**

```bash
cd /Users/viggy/travel-planning
git add api/
git commit -m "$(cat <<'EOF'
Add UserProfile / UserProfileIn pydantic models

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: profile_addendum() helper

**Files:**
- Create: `api/api/llm/profile.py`
- Test: `api/tests/test_llm_profile.py`

- [ ] **Step 1: Write failing test**

`api/tests/test_llm_profile.py`:

```python
from api.llm.profile import profile_addendum
from api.models import UserProfile
from datetime import datetime, timezone


def _profile(**overrides) -> UserProfile:
    base = {
        "diet": None,
        "budget": None,
        "pace": None,
        "interests": [],
        "notes": None,
        "updated_at": datetime.now(timezone.utc),
    }
    base.update(overrides)
    return UserProfile(**base)


def test_empty_profile_returns_empty_string():
    assert profile_addendum(None) == ""
    assert profile_addendum(_profile()) == ""


def test_diet_only():
    assert profile_addendum(_profile(diet="vegetarian")) == "vegetarian"


def test_full_profile_renders_all_fields():
    out = profile_addendum(_profile(
        diet="vegan",
        budget="mid",
        pace="balanced",
        interests=["food", "photography"],
        notes="Knee injury, light walking",
    ))
    assert "vegan" in out
    assert "mid budget" in out
    assert "balanced pace" in out
    assert "Interests: food, photography" in out
    assert "Knee injury" in out


def test_partial_profile_omits_missing_fields():
    out = profile_addendum(_profile(budget="cheap", interests=["hiking"]))
    assert out == "cheap budget. Interests: hiking"
```

- [ ] **Step 2: Run to verify failure**

```bash
cd /Users/viggy/travel-planning/api && source .venv/bin/activate
pytest tests/test_llm_profile.py -v
```
Expected: FAIL — `ModuleNotFoundError: api.llm.profile`

- [ ] **Step 3: Write the helper**

`api/api/llm/profile.py`:

```python
"""Render a user profile into a one-paragraph context addendum the LLM
calls (research, hotels, augment) prepend to the brief's travel_style.
"""

from api.models import UserProfile


def profile_addendum(profile: UserProfile | None) -> str:
    if not profile:
        return ""
    parts: list[str] = []
    if profile.diet:
        parts.append(profile.diet)
    if profile.budget:
        parts.append(f"{profile.budget} budget")
    if profile.pace:
        parts.append(f"{profile.pace} pace")
    if profile.interests:
        parts.append("Interests: " + ", ".join(profile.interests))
    if profile.notes:
        parts.append(profile.notes)
    return ". ".join(parts)
```

- [ ] **Step 4: Run tests**

```bash
cd /Users/viggy/travel-planning/api && source .venv/bin/activate
pytest tests/test_llm_profile.py -v
```
Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
cd /Users/viggy/travel-planning
git add api/
git commit -m "$(cat <<'EOF'
Add profile_addendum LLM helper

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase 2 — Backend: API endpoints

### Task 4: GET / PUT /me/profile

**Files:**
- Create: `api/api/routes/profile.py`
- Modify: `api/api/main.py`
- Test: `api/tests/test_routes_profile.py`

- [ ] **Step 1: Write the failing test**

`api/tests/test_routes_profile.py`:

```python
import time
import uuid
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
def auth_headers():
    return {"Authorization": f"Bearer {_token(OWNER_ID)}"}


def _mock_db_select(row: dict | None) -> MagicMock:
    table = MagicMock()
    chain = MagicMock()
    table.select.return_value = chain
    chain.eq.return_value = chain
    chain.maybe_single.return_value = chain
    chain.execute.return_value = MagicMock(data=row)
    client = MagicMock()
    client.table.return_value = table
    return client


def _mock_db_upsert(returned_row: dict) -> MagicMock:
    table = MagicMock()
    table.upsert.return_value.execute.return_value = MagicMock(data=[returned_row])
    client = MagicMock()
    client.table.return_value = table
    return client


def test_get_profile_returns_null_when_unset(monkeypatch, auth_headers):
    monkeypatch.setattr("api.routes.profile.service_client",
                        lambda: _mock_db_select(None))
    res = TestClient(app).get("/me/profile", headers=auth_headers)
    assert res.status_code == 200
    assert res.json() is None


def test_get_profile_returns_row_when_set(monkeypatch, auth_headers):
    row = {
        "diet": "vegetarian", "budget": "mid", "pace": "balanced",
        "interests": ["food"], "notes": None,
        "updated_at": "2026-05-03T10:00:00+00:00",
    }
    monkeypatch.setattr("api.routes.profile.service_client",
                        lambda: _mock_db_select(row))
    res = TestClient(app).get("/me/profile", headers=auth_headers)
    assert res.status_code == 200
    body = res.json()
    assert body["diet"] == "vegetarian"
    assert body["budget"] == "mid"


def test_put_profile_upserts_and_returns(monkeypatch, auth_headers):
    saved = {
        "user_id": OWNER_ID,
        "diet": "vegan", "budget": "mid", "pace": "relaxed",
        "interests": ["photography"], "notes": "no fish",
        "updated_at": "2026-05-03T10:00:00+00:00",
    }
    monkeypatch.setattr("api.routes.profile.service_client",
                        lambda: _mock_db_upsert(saved))
    res = TestClient(app).put(
        "/me/profile",
        headers=auth_headers,
        json={"diet": "vegan", "budget": "mid", "pace": "relaxed",
              "interests": ["photography"], "notes": "no fish"},
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["diet"] == "vegan"
    assert body["interests"] == ["photography"]


def test_put_profile_rejects_invalid_budget(monkeypatch, auth_headers):
    monkeypatch.setattr("api.routes.profile.service_client",
                        lambda: _mock_db_upsert({}))
    res = TestClient(app).put(
        "/me/profile",
        headers=auth_headers,
        json={"budget": "luxury"},
    )
    assert res.status_code == 422


def test_endpoints_require_auth():
    assert TestClient(app).get("/me/profile").status_code == 401
    assert TestClient(app).put("/me/profile", json={}).status_code == 401
```

- [ ] **Step 2: Run to verify failure**

```bash
cd /Users/viggy/travel-planning/api && source .venv/bin/activate
pytest tests/test_routes_profile.py -v
```
Expected: FAIL with 404s on the endpoints.

- [ ] **Step 3: Write the route**

`api/api/routes/profile.py`:

```python
from fastapi import APIRouter, HTTPException

from api.auth import CurrentUser
from api.db import service_client
from api.models import UserProfile, UserProfileIn

router = APIRouter(tags=["profile"])


@router.get("/me/profile", response_model=UserProfile | None)
def get_profile(user: CurrentUser) -> UserProfile | None:
    res = (
        service_client().table("user_profiles")
        .select("*").eq("user_id", user["sub"]).maybe_single().execute()
    )
    if not res.data:
        return None
    return UserProfile(**res.data)


@router.put("/me/profile", response_model=UserProfile)
def put_profile(body: UserProfileIn, user: CurrentUser) -> UserProfile:
    row = {
        "user_id": user["sub"],
        "diet": body.diet,
        "budget": body.budget,
        "pace": body.pace,
        "interests": body.interests,
        "notes": body.notes,
        "updated_at": "now()",
    }
    res = (
        service_client().table("user_profiles")
        .upsert(row, on_conflict="user_id")
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=500, detail="upsert returned no row")
    return UserProfile(**res.data[0])
```

- [ ] **Step 4: Wire the router in `api/api/main.py`**

Add to imports:
```python
from api.routes import profile as profile_routes
```
After existing `app.include_router(...)` lines:
```python
app.include_router(profile_routes.router)
```

- [ ] **Step 5: Run tests**

```bash
cd /Users/viggy/travel-planning/api && source .venv/bin/activate
pytest tests/test_routes_profile.py -v
```
Expected: 5 passed.

- [ ] **Step 6: Commit**

```bash
cd /Users/viggy/travel-planning
git add api/
git commit -m "$(cat <<'EOF'
Add GET/PUT /me/profile routes

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase 3 — Backend: wire profile into LLM call sites

### Task 5: Helper to fetch profile by user_id

**Files:**
- Modify: `api/api/routes/profile.py` (export a `fetch_profile_for(user_id)` helper)

- [ ] **Step 1: Add the helper**

Append to `api/api/routes/profile.py`:

```python
def fetch_profile_for(user_id: str) -> UserProfile | None:
    """Used by other routes to silently augment LLM calls with the user's
    saved preferences. Returns None if the user hasn't set one."""
    res = (
        service_client().table("user_profiles")
        .select("*").eq("user_id", user_id).maybe_single().execute()
    )
    if not res.data:
        return None
    return UserProfile(**res.data)
```

- [ ] **Step 2: Commit**

```bash
git add api/api/routes/profile.py
git commit -m "$(cat <<'EOF'
Export fetch_profile_for() helper for LLM call sites

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Inject addendum in trip create + stream

**Files:**
- Modify: `api/api/routes/trips.py`
- Test: `api/tests/test_routes_trips.py`

- [ ] **Step 1: Write a test that asserts the addendum reaches the research call**

Append to `api/tests/test_routes_trips.py`:

```python
def test_post_trips_stream_uses_profile_when_present(monkeypatch, auth_headers) -> None:
    from api.models import UserProfile
    from datetime import datetime, timezone

    captured_style: dict[str, str] = {}

    def fake_stream_research(d, l, s):
        captured_style["s"] = s
        yield ("result", {"document": "## x", "places": []})

    monkeypatch.setattr(
        "api.routes.trips.parse_brief",
        lambda b: MagicMock(
            destination="Kyoto", days=7, travel_style="brief style",
            start_date=None, airport_entry=None, airport_exit=None,
        ),
    )
    monkeypatch.setattr("api.routes.trips.stream_travel_research", fake_stream_research)
    monkeypatch.setattr("api.routes.trips.geocode_place", lambda n: (35.0, 135.7))
    monkeypatch.setattr(
        "api.routes.trips.fetch_profile_for",
        lambda uid: UserProfile(
            diet="vegan", budget="mid", pace=None, interests=["food"],
            notes=None, updated_at=datetime.now(timezone.utc),
        ),
    )

    table = MagicMock()
    table.insert.return_value.execute.return_value = MagicMock(data=[{
        "id": "t1", "slug": "kyoto-7d-z", "user_id": "u", "destination": "Kyoto",
        "days": 7, "travel_style": "brief style",
        "start_date": None, "airport_entry": None, "airport_exit": None,
        "document": {"document_markdown": "## x", "places": [], "neighborhoods": []},
        "places": [],
        "created_at": "2026-05-03T00:00:00+00:00",
    }])
    client = MagicMock()
    client.table.return_value = table
    monkeypatch.setattr("api.routes.trips.service_client", lambda: client)

    with TestClient(app).stream(
        "POST", "/trips/stream",
        headers=auth_headers, json={"text": "Kyoto"},
    ) as res:
        res.read()  # drain the stream

    assert "vegan" in captured_style["s"]
    assert "mid budget" in captured_style["s"]
    assert "brief style" in captured_style["s"]
```

- [ ] **Step 2: Run to verify failure**

```bash
cd /Users/viggy/travel-planning/api && source .venv/bin/activate
pytest tests/test_routes_trips.py::test_post_trips_stream_uses_profile_when_present -v
```
Expected: FAIL — `fetch_profile_for` not patched into `api.routes.trips`.

- [ ] **Step 3: Wire the addendum**

In `api/api/routes/trips.py`, add at the top:

```python
from api.llm.profile import profile_addendum
from api.routes.profile import fetch_profile_for
```

In `create_trip_stream`, after `parse_brief(brief)` call and before passing `parsed.travel_style` into `stream_travel_research`, build a combined style:

```python
profile = fetch_profile_for(user["sub"])
addendum = profile_addendum(profile)
combined_style = (
    f"{addendum}. {parsed.travel_style}".strip(". ").strip()
    if addendum else parsed.travel_style
)
# Pass `combined_style` instead of `parsed.travel_style` to:
#  - stream_travel_research(parsed.destination, parsed.days, combined_style)
# Also persist `combined_style` as the trip row's `travel_style`.
```

Apply the same pattern in the synchronous `create_trip` route — fetch profile, build combined_style, pass to `get_travel_research`.

- [ ] **Step 4: Run all trip tests to confirm no regression**

```bash
cd /Users/viggy/travel-planning/api && source .venv/bin/activate
pytest tests/test_routes_trips.py -v
```
Expected: all green including the new test.

- [ ] **Step 5: Commit**

```bash
cd /Users/viggy/travel-planning
git add api/
git commit -m "$(cat <<'EOF'
Inject profile addendum into trip create + stream

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Inject addendum in PDF build

**Files:**
- Modify: `api/api/routes/pdf.py`

- [ ] **Step 1: Wire the addendum in `build_pdf`**

In `api/api/routes/pdf.py`, after fetching the trip row and before passing `travel_style` into `stream_pdf_plan`:

```python
from api.llm.profile import profile_addendum
from api.routes.profile import fetch_profile_for

# ... inside build_pdf:
profile = fetch_profile_for(user["sub"])
addendum = profile_addendum(profile)
combined_style = (
    f"{addendum}. {row.get('travel_style', '')}".strip(". ").strip()
    if addendum else row.get("travel_style", "")
)
# Pass combined_style instead of row['travel_style'] to stream_pdf_plan.
```

- [ ] **Step 2: Run pdf route tests**

```bash
cd /Users/viggy/travel-planning/api && source .venv/bin/activate
pytest tests/test_routes_pdf.py -v
```
Expected: existing tests still pass. (No new test for profile injection — the fetch is mocked away by lazy default.)

- [ ] **Step 3: Commit**

```bash
cd /Users/viggy/travel-planning
git add api/
git commit -m "$(cat <<'EOF'
Inject profile addendum into PDF build call

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase 4 — Frontend: types + API client

### Task 8: Mirror the profile model in TypeScript

**Files:**
- Modify: `web/src/lib/types.ts`
- Modify: `web/src/lib/api.ts`

- [ ] **Step 1: Add types**

Append to `web/src/lib/types.ts`:

```typescript
export type Budget = "cheap" | "mid" | "premium";
export type Pace = "relaxed" | "balanced" | "packed";

export interface UserProfileIn {
  diet?: string | null;
  budget?: Budget | null;
  pace?: Pace | null;
  interests?: string[];
  notes?: string | null;
}

export interface UserProfile extends UserProfileIn {
  updated_at: string;
}
```

- [ ] **Step 2: Add API client methods**

Append to `web/src/lib/api.ts`:

```typescript
import type { UserProfile, UserProfileIn } from "./types";

export async function getProfile(token: string): Promise<UserProfile | null> {
  const res = await authedFetch("/me/profile", { method: "GET" }, token);
  if (!res.ok) throw new Error(`getProfile ${res.status}`);
  const data = await res.json();
  return data ?? null;
}

export async function saveProfile(profile: UserProfileIn, token: string): Promise<UserProfile> {
  const res = await authedFetch(
    "/me/profile",
    { method: "PUT", body: JSON.stringify(profile) },
    token,
  );
  if (!res.ok) throw new Error(`saveProfile ${res.status}`);
  return res.json();
}
```

(The `import type` line should be merged with the existing one if there is one — adjust as needed.)

- [ ] **Step 3: Type-check**

```bash
cd /Users/viggy/travel-planning/web && npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
cd /Users/viggy/travel-planning
git add web/
git commit -m "$(cat <<'EOF'
Add UserProfile types + getProfile/saveProfile client methods

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase 5 — Frontend: form + page + banner + menu

### Task 9: ProfileForm component

**Files:**
- Create: `web/src/components/ProfileForm.tsx`

- [ ] **Step 1: Write the form**

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { saveProfile } from "@/lib/api";
import { getBrowserToken } from "@/lib/auth.browser";
import type { Budget, Pace, UserProfile } from "@/lib/types";

const PRESET_INTERESTS = [
  "Food", "Photography", "Hiking", "History", "Nightlife",
  "Beach", "Museums", "Architecture", "Nature", "Shopping",
];
const BUDGETS: { value: Budget; label: string }[] = [
  { value: "cheap", label: "Cheap" },
  { value: "mid", label: "Mid" },
  { value: "premium", label: "Premium" },
];
const PACES: { value: Pace; label: string }[] = [
  { value: "relaxed", label: "Relaxed" },
  { value: "balanced", label: "Balanced" },
  { value: "packed", label: "Packed" },
];

export function ProfileForm({ initial }: { initial: UserProfile | null }) {
  const router = useRouter();
  const [diet, setDiet] = useState(initial?.diet ?? "");
  const [budget, setBudget] = useState<Budget | null>(initial?.budget ?? null);
  const [pace, setPace] = useState<Pace | null>(initial?.pace ?? null);
  const [interests, setInterests] = useState<string[]>(initial?.interests ?? []);
  const [customInterest, setCustomInterest] = useState("");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  function toggle(tag: string) {
    setInterests((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
    );
  }
  function addCustom() {
    const v = customInterest.trim();
    if (!v || interests.includes(v)) return;
    setInterests((prev) => [...prev, v]);
    setCustomInterest("");
  }

  async function onSave() {
    setSaving(true);
    try {
      const token = await getBrowserToken();
      if (!token) return;
      await saveProfile({
        diet: diet.trim() || null,
        budget,
        pace,
        interests,
        notes: notes.trim() || null,
      }, token);
      setSavedAt(Date.now());
      router.refresh();
    } catch (e) {
      console.error("save profile failed", e);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="frosted-strong rounded-[18px] p-6 max-w-xl mx-auto flex flex-col gap-5">
      <div>
        <h2 className="font-display text-2xl font-semibold text-ink-900">Travel preferences</h2>
        <p className="text-sm text-ink-500 mt-1">
          Saved once, applied to every future trip. Edit any time.
        </p>
      </div>

      <Field label="Diet">
        <input
          value={diet}
          onChange={(e) => setDiet(e.target.value)}
          placeholder="e.g. vegetarian, no shellfish"
          className="w-full rounded-[10px] bg-white/80 border border-amber-700/12 px-3 py-2 text-sm text-ink-900 outline-none focus:border-amber-600/40"
        />
      </Field>

      <Field label="Budget">
        <Toggle options={BUDGETS} value={budget} onChange={setBudget} allowNull />
      </Field>

      <Field label="Pace">
        <Toggle options={PACES} value={pace} onChange={setPace} allowNull />
      </Field>

      <Field label="Interests">
        <div className="flex flex-wrap gap-2">
          {PRESET_INTERESTS.map((tag) => {
            const on = interests.includes(tag);
            return (
              <button
                key={tag}
                onClick={() => toggle(tag)}
                className={
                  on
                    ? "rounded-full px-3 py-1 text-xs font-semibold bg-amber-600 text-white"
                    : "rounded-full px-3 py-1 text-xs text-ink-700 bg-white/60 border border-amber-700/10 hover:bg-white/85"
                }
              >
                {tag}
              </button>
            );
          })}
          {interests.filter((t) => !PRESET_INTERESTS.includes(t)).map((tag) => (
            <button
              key={tag}
              onClick={() => toggle(tag)}
              className="rounded-full px-3 py-1 text-xs font-semibold bg-amber-600 text-white"
            >
              {tag} ×
            </button>
          ))}
        </div>
        <div className="flex gap-2 mt-2">
          <input
            value={customInterest}
            onChange={(e) => setCustomInterest(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCustom(); } }}
            placeholder="Add interest…"
            className="flex-1 rounded-[10px] bg-white/80 border border-amber-700/12 px-3 py-1.5 text-xs text-ink-900 outline-none focus:border-amber-600/40"
          />
          <button
            onClick={addCustom}
            disabled={!customInterest.trim()}
            className="rounded-[10px] bg-white/80 border border-amber-700/12 px-3 py-1.5 text-xs text-ink-700 hover:bg-white/95 disabled:opacity-50"
          >Add</button>
        </div>
      </Field>

      <Field label="Notes">
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          maxLength={500}
          rows={3}
          placeholder="Anything else? E.g. travelling with parents, light walker, hate seafood, prefer mornings."
          className="w-full rounded-[10px] bg-white/80 border border-amber-700/12 px-3 py-2 text-sm text-ink-900 outline-none focus:border-amber-600/40 resize-none"
        />
        <div className="text-[10px] text-ink-500 mt-1">{notes.length} / 500</div>
      </Field>

      <div className="flex items-center gap-3 mt-2">
        <button
          onClick={onSave}
          disabled={saving}
          className="rounded-[10px] bg-gradient-to-br from-amber-400 to-amber-600 text-white text-sm py-2 px-5 font-medium hover:shadow-md disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save preferences"}
        </button>
        {savedAt && Date.now() - savedAt < 3000 && (
          <span className="text-xs text-amber-700">Saved ✓</span>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-semibold uppercase tracking-wider text-amber-700">{label}</label>
      {children}
    </div>
  );
}

function Toggle<T extends string>({
  options, value, onChange, allowNull = false,
}: {
  options: { value: T; label: string }[];
  value: T | null;
  onChange: (v: T | null) => void;
  allowNull?: boolean;
}) {
  return (
    <div className="flex gap-2 flex-wrap">
      {options.map((o) => {
        const on = value === o.value;
        return (
          <button
            key={o.value}
            onClick={() => onChange(allowNull && on ? null : o.value)}
            className={
              on
                ? "rounded-[10px] px-4 py-1.5 text-xs font-semibold bg-amber-600 text-white"
                : "rounded-[10px] px-4 py-1.5 text-xs text-ink-700 bg-white/60 border border-amber-700/10 hover:bg-white/85"
            }
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
cd /Users/viggy/travel-planning/web && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add web/
git commit -m "$(cat <<'EOF'
Add ProfileForm component (diet, budget, pace, interests, notes)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 10: /profile page (server shell)

**Files:**
- Create: `web/src/app/profile/page.tsx`

- [ ] **Step 1: Write the page**

```tsx
import { redirect } from "next/navigation";
import Link from "next/link";

import { BrandMark } from "@/components/BrandMark";
import { ProfileForm } from "@/components/ProfileForm";
import { getProfile } from "@/lib/api";
import { getServerToken } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function ProfilePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/signin");

  const token = await getServerToken();
  const profile = token ? await getProfile(token).catch(() => null) : null;

  return (
    <main className="min-h-screen">
      <header className="px-6 py-4 flex items-center justify-between">
        <Link href="/" className="contents"><BrandMark /></Link>
        <Link href="/" className="text-xs text-ink-500 hover:text-ink-900">← Back</Link>
      </header>
      <section className="px-6 pb-12 anim-fade-in">
        <ProfileForm initial={profile} />
      </section>
    </main>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
cd /Users/viggy/travel-planning/web && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add web/
git commit -m "$(cat <<'EOF'
Add /profile page

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 11: ProfileBanner empty-state nudge + UserMenu link

**Files:**
- Create: `web/src/components/ProfileBanner.tsx`
- Modify: `web/src/components/UserMenu.tsx`
- Modify: `web/src/app/page.tsx`

- [ ] **Step 1: ProfileBanner component**

```tsx
"use client";

import Link from "next/link";
import { useState } from "react";

export function ProfileBanner() {
  const [hidden, setHidden] = useState(false);
  if (hidden) return null;
  return (
    <div className="frosted rounded-[14px] px-4 py-3 w-full max-w-xl flex items-center gap-3 anim-fade-in">
      <span className="text-amber-600">✦</span>
      <p className="flex-1 text-xs text-ink-700">
        Set your travel preferences to make every trip smarter.{" "}
        <Link href="/profile" className="text-amber-700 font-semibold hover:underline">
          Open preferences →
        </Link>
      </p>
      <button
        onClick={() => setHidden(true)}
        className="text-ink-500 hover:text-ink-900 text-sm"
        aria-label="Dismiss"
      >
        ×
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Add Preferences link to UserMenu**

Modify `web/src/components/UserMenu.tsx` so the menu shows email · Preferences · Log out:

```tsx
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { createClient } from "@/lib/supabase/client";

export function UserMenu({ email }: { email: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function signOut() {
    if (busy) return;
    setBusy(true);
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
      router.replace("/auth/signin");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-ink-500">{email}</span>
      <Link
        href="/profile"
        className="text-xs text-ink-500 hover:text-ink-900"
      >
        Preferences
      </Link>
      <button
        onClick={signOut}
        disabled={busy}
        className="text-xs text-ink-500 hover:text-ink-900 disabled:opacity-60"
      >
        {busy ? "…" : "Log out"}
      </button>
    </div>
  );
}
```

- [ ] **Step 3: Show banner on home page when profile is null**

In `web/src/app/page.tsx`:

```tsx
import { getProfile, listTrips } from "@/lib/api";
// ... existing imports
import { ProfileBanner } from "@/components/ProfileBanner";

export default async function Home() {
  // ... existing auth + trips fetch
  const profile = token ? await getProfile(token).catch(() => null) : null;

  return (
    <main className="min-h-screen flex flex-col">
      {/* existing header */}
      <section className="flex-1 flex flex-col items-center justify-center gap-6 px-6 pb-12 anim-fade-in">
        {profile === null && <ProfileBanner />}
        {/* existing h1, p, ChatInputClient, TripsList */}
      </section>
    </main>
  );
}
```

- [ ] **Step 4: Type-check + manual smoke test**

```bash
cd /Users/viggy/travel-planning/web && npx tsc --noEmit
npm run dev
# Open localhost:3000 — banner shows
# Click Open preferences → fill in form → Save
# Return to / — banner gone
# Hard refresh — banner stays gone
```

- [ ] **Step 5: Commit**

```bash
cd /Users/viggy/travel-planning
git add web/
git commit -m "$(cat <<'EOF'
Add ProfileBanner empty-state + Preferences link in user menu

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase 6 — Polish: shrink the brief placeholder

### Task 12: Update chat-input placeholder when profile is set

**Files:**
- Modify: `web/src/components/ChatInput.tsx` (accept a `placeholder` prop)
- Modify: `web/src/components/ChatInputClient.tsx` (compute placeholder based on whether profile exists)
- Modify: `web/src/app/page.tsx` (pass `hasProfile` down)

- [ ] **Step 1: ChatInput accepts an optional placeholder**

In `web/src/components/ChatInput.tsx`, add a `placeholder?: string` prop and use it. Default to the current long string.

- [ ] **Step 2: ChatInputClient picks placeholder based on profile presence**

Add a `hasProfile?: boolean` prop. If true, use `"Where to next? E.g. 7 days in Kyoto, mid-October"`; otherwise the current `"7 days in Kyoto, vegetarian, photography focus, mid-October…"`.

- [ ] **Step 3: page.tsx passes `hasProfile={profile !== null}`**

```tsx
<ChatInputClient hasProfile={profile !== null} />
```

- [ ] **Step 4: Type-check + commit**

```bash
cd /Users/viggy/travel-planning/web && npx tsc --noEmit
cd /Users/viggy/travel-planning
git add web/
git commit -m "$(cat <<'EOF'
Shrink chat-input placeholder when profile is set

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase 7 — Deploy

### Task 13: Deploy backend + verify end-to-end

- [ ] **Step 1: Run full test suite**

```bash
cd /Users/viggy/travel-planning/api && source .venv/bin/activate
pytest -q
```
Expected: all green.

- [ ] **Step 2: Deploy backend**

```bash
cd /Users/viggy/travel-planning/api && ./deploy.sh
```

- [ ] **Step 3: Smoke test on live deployment**

After Vercel auto-redeploys (frontend changes auto-trigger), open `https://atlas.viggy.dev`:

1. Sign in
2. See empty-state banner ("Set your travel preferences…")
3. Click → land on `/profile`
4. Fill in: vegetarian, mid budget, balanced pace, Photography + Food, "no shellfish"
5. Save → "Saved ✓" appears
6. Return to home → banner gone
7. Type a brief like "5 days in Lisbon" (no diet/style mentioned)
8. Watch the streaming generation — log Cloud Run shows the combined `travel_style` includes the profile fields
9. Open the trip — restaurants reflect vegetarian, recommendations skew mid-budget

- [ ] **Step 4: Done**

No commit — deploy is a side effect.

---

## Self-review

**1. Spec coverage**

| Spec section                                 | Implemented in     |
| ---                                          | ---                |
| `user_profiles` table + RLS                  | Task 1             |
| Pydantic models                              | Task 2             |
| `profile_addendum()` helper                  | Task 3             |
| `GET` / `PUT /me/profile` routes             | Task 4             |
| `fetch_profile_for()` for other routes       | Task 5             |
| Inject into trip create + stream             | Task 6             |
| Inject into PDF build                        | Task 7             |
| Frontend types + API client                  | Task 8             |
| ProfileForm component                        | Task 9             |
| `/profile` page                              | Task 10            |
| Empty-state banner + UserMenu link           | Task 11            |
| Brief placeholder shrinks                    | Task 12            |
| Deploy + verify                              | Task 13            |

**2. Placeholder scan** — no TBDs / TODOs / "add appropriate handling". Each step has the actual code or command.

**3. Type consistency** — `UserProfile` and `UserProfileIn` use the same `Budget` / `Pace` literal types in both Python (`Literal["cheap","mid","premium"]`) and TypeScript (`type Budget = "cheap" | "mid" | "premium"`). The DB CHECK constraints match. The `profile_addendum()` helper renders all five fields the spec calls out.

**4. Out-of-scope items deferred** as the spec specified — per-trip overrides, multiple profiles, profile sharing, and "auto-detect from past trips" are not in the plan.
