# Trip Sharing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Public read-only share links — owner clicks Share → `/s/{token}` URL works for anyone, hides budget/refine/delete/PDF/owner identity.

**Architecture:** New `share_token` column on `trips` (rotates on each Share-press, clears on revoke). Two new owner routes (`POST`/`DELETE /trips/:slug/share`) and one anonymous route (`GET /public/trips/:token`). New `/s/[token]` page renders a stripped `TripView` with no UserMenu, no Refine, no PDF, no Budget tab.

**Tech Stack:** FastAPI, Pydantic v2, Supabase Postgres + RLS, Next 16, Tailwind v4. No new external deps.

**Spec reference:** [docs/superpowers/specs/2026-05-03-trip-sharing-design.md](../specs/2026-05-03-trip-sharing-design.md)

---

## File structure

```
api/api/
├── routes/share.py                    NEW: POST/DELETE /trips/:slug/share
├── routes/public.py                   NEW: GET /public/trips/:token (no auth)
├── models.py                          MODIFIED: ShareOut, PublicTrip,
│                                                 TripFull.share_token
├── routes/trips.py                    MODIFIED: include share_token in
│                                                 returned rows (select '*')
├── main.py                            MODIFIED: include both new routers
└── config.py                          MODIFIED: app_base_url setting

api/tests/
├── test_routes_share.py               NEW
└── test_routes_public.py              NEW

supabase/migrations/
└── 2026-05-03_trip_share_token.sql    NEW

web/src/
├── app/s/[token]/
│   ├── page.tsx                       NEW: server shell
│   └── PublicView.tsx                 NEW: stripped TripView
├── components/
│   ├── ShareMenu.tsx                  NEW: owner popover
│   ├── TripPanel.tsx                  MODIFIED: readOnly prop
│   └── PublicShell.tsx                NEW: minimal header for /s/
├── app/trip/[slug]/TripView.tsx       MODIFIED: render <ShareMenu/>
├── lib/api.ts                         MODIFIED: createShare, revokeShare,
│                                                 getPublicTrip
└── lib/types.ts                       MODIFIED: TripFull.share_token,
                                                  PublicTrip
```

---

## Phase 1 — Backend foundation

### Task 1: Schema migration (share_token column + RLS)

**Files:**
- Create: `supabase/migrations/2026-05-03_trip_share_token.sql`

- [ ] **Step 1: Write the migration**

```sql
alter table public.trips add column share_token text unique;

create index trips_share_token_idx on public.trips(share_token)
  where share_token is not null;

-- Public read access scoped to rows that have an active share token.
-- Owner-only policy on trips remains in place; this adds a second
-- policy that anyone (including the anon role) can read shared rows.
create policy trips_public_read on public.trips
  for select using (share_token is not null);
```

- [ ] **Step 2: USER ACTION — apply in Supabase SQL editor**

Surface to the user: "Open the Supabase SQL editor for the project, paste the contents of `supabase/migrations/2026-05-03_trip_share_token.sql`, and run. Verify in the trips table editor that `share_token` (text, nullable) appears, and that under Policies you see `trips_public_read`."

- [ ] **Step 3: Commit**

```bash
cd /Users/viggy/travel-planning
git add supabase/
git commit -m "$(cat <<'EOF'
Add share_token column on trips with public-read RLS policy

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: APP_BASE_URL setting

**Files:**
- Modify: `api/api/config.py`

- [ ] **Step 1: Inspect the existing settings module**

```bash
cat /Users/viggy/travel-planning/api/api/config.py
```

Note the current `Settings` class shape and the names of the existing fields. The new field follows the same pattern.

- [ ] **Step 2: Add `app_base_url`**

Add the field to `Settings`:

```python
app_base_url: str = "https://atlas.viggy.dev"
```

(Place it next to the other URL/environment settings.)

- [ ] **Step 3: Commit**

```bash
cd /Users/viggy/travel-planning
git add api/api/config.py
git commit -m "$(cat <<'EOF'
Add APP_BASE_URL setting for sharable URLs

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Pydantic models

**Files:**
- Modify: `api/api/models.py`
- Test: `api/tests/test_models.py`

- [ ] **Step 1: Write failing tests**

Append to `api/tests/test_models.py`:

```python
def test_share_out_round_trips():
    from api.models import ShareOut

    s = ShareOut(share_url="https://atlas.viggy.dev/s/abc", token="abc")
    assert s.share_url.endswith("/s/abc")
    assert s.token == "abc"


def test_public_trip_excludes_personal_fields():
    """The PublicTrip model is the wire format for the anonymous public
    read route. It must NOT carry user_id, airport_*, or travel_style."""
    from api.models import PublicTrip

    field_names = set(PublicTrip.model_fields.keys())
    assert "user_id" not in field_names
    assert "airport_entry" not in field_names
    assert "airport_exit" not in field_names
    assert "travel_style" not in field_names
    # Spot-check the things that ARE included.
    for f in ("slug", "destination", "days", "document"):
        assert f in field_names


def test_trip_full_accepts_optional_share_token():
    from datetime import datetime
    from api.models import TripDocument, TripFull

    t = TripFull(
        id="t1", slug="x-7d-aaa", user_id="u",
        destination="Kyoto", days=7, travel_style="x",
        start_date=None, airport_entry=None, airport_exit=None,
        document=TripDocument(document_markdown="x", places=[], neighborhoods=[]),
        created_at=datetime.now(),
    )
    assert t.share_token is None
```

- [ ] **Step 2: Run to verify failure**

```bash
cd /Users/viggy/travel-planning/api && source .venv/bin/activate
pytest tests/test_models.py -v
```
Expected: FAIL — `ImportError: cannot import name 'ShareOut'`.

- [ ] **Step 3: Add the models**

In `api/api/models.py`, find the existing `TripFull` class:

```python
class TripFull(TripSummary):
    travel_style: str
    start_date: date | None
    airport_entry: str | None
    airport_exit: str | None
    document: TripDocument
```

Add `share_token` at the end:

```python
class TripFull(TripSummary):
    travel_style: str
    start_date: date | None
    airport_entry: str | None
    airport_exit: str | None
    document: TripDocument
    share_token: str | None = None
```

(Adapt to what the actual file looks like — the field list may differ slightly. The key thing is to add `share_token: str | None = None`.)

Then append at the end of the file:

```python
# ── Sharing ─────────────────────────────────────────────────────────────────


class ShareOut(BaseModel):
    share_url: str
    token: str


class PublicTrip(BaseModel):
    """Anonymous-readable subset of a trip. Excludes personal fields:
    no user_id, no airport_*, no travel_style (which now carries the
    profile addendum like "Knee injury, light walking")."""
    slug: str
    destination: str
    days: int
    start_date: date | None
    document: TripDocument
    created_at: datetime
```

- [ ] **Step 4: Run tests**

```bash
cd /Users/viggy/travel-planning/api && source .venv/bin/activate
pytest tests/test_models.py -v
```
Expected: 3 new tests pass; existing tests still green.

- [ ] **Step 5: Commit**

```bash
cd /Users/viggy/travel-planning
git add api/api/models.py api/tests/test_models.py
git commit -m "$(cat <<'EOF'
Add ShareOut + PublicTrip models, TripFull.share_token

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase 2 — Backend routes

### Task 4: Owner share routes (POST + DELETE)

**Files:**
- Create: `api/api/routes/share.py`
- Modify: `api/api/main.py`
- Test: `api/tests/test_routes_share.py`

- [ ] **Step 1: Write failing tests**

Create `api/tests/test_routes_share.py`:

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


def _trip_row(share_token=None) -> dict:
    return {"id": "t1", "user_id": OWNER_ID, "slug": "kyoto-7d-aaa",
            "share_token": share_token}


def _mock_db(trip_row=None, updated_row=None) -> MagicMock:
    select_chain = MagicMock()
    select_chain.select.return_value = select_chain
    select_chain.eq.return_value = select_chain
    select_chain.single.return_value = select_chain
    select_chain.execute.return_value = MagicMock(data=trip_row)

    update_chain = select_chain
    update_chain.update.return_value = update_chain
    update_chain.execute.return_value = MagicMock(data=[updated_row] if updated_row else [])

    client = MagicMock()
    client.table.return_value = select_chain
    return client


def test_post_share_generates_token(monkeypatch, auth_headers):
    saved = {**_trip_row(), "share_token": "generated-token"}
    db = _mock_db(trip_row=_trip_row(), updated_row=saved)
    monkeypatch.setattr("api.routes.share.service_client", lambda: db)
    monkeypatch.setattr(
        "api.routes.share.secrets.token_urlsafe", lambda n: "generated-token",
    )

    res = TestClient(app).post(
        "/trips/kyoto-7d-aaa/share", headers=auth_headers,
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["token"] == "generated-token"
    assert body["share_url"].endswith("/s/generated-token")


def test_post_share_rotates_existing_token(monkeypatch, auth_headers):
    """Each press of Share generates a fresh token regardless of prior state."""
    saved = {**_trip_row(share_token="old"), "share_token": "new"}
    db = _mock_db(trip_row=_trip_row(share_token="old"), updated_row=saved)
    monkeypatch.setattr("api.routes.share.service_client", lambda: db)
    monkeypatch.setattr(
        "api.routes.share.secrets.token_urlsafe", lambda n: "new",
    )

    res = TestClient(app).post(
        "/trips/kyoto-7d-aaa/share", headers=auth_headers,
    )
    assert res.status_code == 200, res.text
    assert res.json()["token"] == "new"


def test_post_share_403_when_not_owner(monkeypatch, auth_headers):
    other = {**_trip_row(), "user_id": "someone-else"}
    monkeypatch.setattr(
        "api.routes.share.service_client", lambda: _mock_db(trip_row=other),
    )
    res = TestClient(app).post(
        "/trips/kyoto-7d-aaa/share", headers=auth_headers,
    )
    assert res.status_code == 403


def test_post_share_404_when_trip_missing(monkeypatch, auth_headers):
    monkeypatch.setattr(
        "api.routes.share.service_client", lambda: _mock_db(trip_row=None),
    )
    res = TestClient(app).post(
        "/trips/missing/share", headers=auth_headers,
    )
    assert res.status_code == 404


def test_delete_share_clears_token(monkeypatch, auth_headers):
    cleared = {**_trip_row(share_token="abc"), "share_token": None}
    db = _mock_db(trip_row=_trip_row(share_token="abc"), updated_row=cleared)
    monkeypatch.setattr("api.routes.share.service_client", lambda: db)

    res = TestClient(app).delete(
        "/trips/kyoto-7d-aaa/share", headers=auth_headers,
    )
    assert res.status_code == 204


def test_delete_share_403_when_not_owner(monkeypatch, auth_headers):
    other = {**_trip_row(share_token="abc"), "user_id": "someone-else"}
    monkeypatch.setattr(
        "api.routes.share.service_client", lambda: _mock_db(trip_row=other),
    )
    res = TestClient(app).delete(
        "/trips/kyoto-7d-aaa/share", headers=auth_headers,
    )
    assert res.status_code == 403


def test_share_routes_require_auth():
    cli = TestClient(app)
    assert cli.post("/trips/x/share").status_code == 401
    assert cli.delete("/trips/x/share").status_code == 401
```

- [ ] **Step 2: Run to verify failure**

```bash
cd /Users/viggy/travel-planning/api && source .venv/bin/activate
pytest tests/test_routes_share.py -v
```
Expected: FAIL — endpoints 404.

- [ ] **Step 3: Write the route module**

Create `api/api/routes/share.py`:

```python
import secrets

from fastapi import APIRouter, HTTPException, Response

from api.auth import CurrentUser
from api.config import get_settings
from api.db import service_client
from api.models import ShareOut

router = APIRouter(tags=["share"])


def _load_trip_or_404(slug: str, user_sub: str) -> dict:
    res = (
        service_client().table("trips")
        .select("id, user_id, slug, share_token")
        .eq("slug", slug).single().execute()
    )
    if not res or not res.data:
        raise HTTPException(status_code=404, detail="Trip not found")
    if res.data["user_id"] != user_sub:
        raise HTTPException(status_code=403, detail="Not your trip")
    return res.data


def _generate_token() -> str:
    # ~22 chars, ~128 bits of entropy.
    return secrets.token_urlsafe(16)


@router.post("/trips/{slug}/share", response_model=ShareOut)
def create_share(slug: str, user: CurrentUser) -> ShareOut:
    trip = _load_trip_or_404(slug, user["sub"])
    token = _generate_token()
    res = (
        service_client().table("trips")
        .update({"share_token": token})
        .eq("id", trip["id"]).execute()
    )
    if not res.data:
        raise HTTPException(status_code=500, detail="share update returned no row")
    base = get_settings().app_base_url.rstrip("/")
    return ShareOut(share_url=f"{base}/s/{token}", token=token)


@router.delete("/trips/{slug}/share", status_code=204)
def revoke_share(slug: str, user: CurrentUser) -> Response:
    trip = _load_trip_or_404(slug, user["sub"])
    (
        service_client().table("trips")
        .update({"share_token": None})
        .eq("id", trip["id"]).execute()
    )
    return Response(status_code=204)
```

- [ ] **Step 4: Wire the router in `api/api/main.py`**

Add to imports:

```python
from api.routes import share as share_routes
```

After existing `app.include_router(...)` lines:

```python
app.include_router(share_routes.router)
```

- [ ] **Step 5: Run tests**

```bash
cd /Users/viggy/travel-planning/api && source .venv/bin/activate
pytest tests/test_routes_share.py -v
```
Expected: 7 passed.

- [ ] **Step 6: Commit**

```bash
cd /Users/viggy/travel-planning
git add api/
git commit -m "$(cat <<'EOF'
Add owner share routes: POST + DELETE /trips/:slug/share

POST always rotates — generates a fresh token whether the trip was
already shared or not. DELETE clears the token (link 404s).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Public read route (anonymous)

**Files:**
- Create: `api/api/routes/public.py`
- Modify: `api/api/main.py`
- Test: `api/tests/test_routes_public.py`

- [ ] **Step 1: Write failing tests**

Create `api/tests/test_routes_public.py`:

```python
from unittest.mock import MagicMock

from fastapi.testclient import TestClient

from api.main import app


def _trip_row(share_token: str | None) -> dict:
    return {
        "id": "t1",
        "user_id": "owner-uid",
        "slug": "kyoto-7d-aaa",
        "destination": "Kyoto",
        "days": 7,
        "travel_style": "vegetarian, mid budget",
        "start_date": None,
        "airport_entry": "ITM",
        "airport_exit": "ITM",
        "document": {
            "document_markdown": "## Day 1",
            "places": [],
            "neighborhoods": [],
        },
        "places": [],
        "share_token": share_token,
        "created_at": "2026-05-01T00:00:00+00:00",
    }


def _mock_db(row: dict | None) -> MagicMock:
    chain = MagicMock()
    chain.select.return_value = chain
    chain.eq.return_value = chain
    chain.maybe_single.return_value = chain
    chain.execute.return_value = MagicMock(data=row)
    client = MagicMock()
    client.table.return_value = chain
    return client


def test_public_get_returns_trip_minus_personal_fields(monkeypatch):
    monkeypatch.setattr(
        "api.routes.public.service_client",
        lambda: _mock_db(_trip_row("abc")),
    )
    res = TestClient(app).get("/public/trips/abc")
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["destination"] == "Kyoto"
    assert body["days"] == 7
    # Personal fields must NOT be present.
    assert "user_id" not in body
    assert "airport_entry" not in body
    assert "airport_exit" not in body
    assert "travel_style" not in body


def test_public_get_404_when_token_missing(monkeypatch):
    monkeypatch.setattr(
        "api.routes.public.service_client", lambda: _mock_db(None),
    )
    res = TestClient(app).get("/public/trips/garbage")
    assert res.status_code == 404


def test_public_get_does_not_require_auth():
    """No Authorization header — should NOT return 401."""
    # We don't even need to mock the DB here; the auth check happens
    # before any handler code runs in the JWT-protected paths. For this
    # public route there is no JWT dependency at all, so even with no
    # patches the route reaches its handler. Mock the DB to short-circuit.
    from unittest.mock import patch
    with patch("api.routes.public.service_client", return_value=_mock_db(None)):
        res = TestClient(app).get("/public/trips/whatever")
    assert res.status_code != 401
```

- [ ] **Step 2: Run to verify failure**

```bash
cd /Users/viggy/travel-planning/api && source .venv/bin/activate
pytest tests/test_routes_public.py -v
```
Expected: FAIL — endpoint 404.

- [ ] **Step 3: Write the route module**

Create `api/api/routes/public.py`:

```python
from fastapi import APIRouter, HTTPException

from api.db import service_client
from api.models import PublicTrip, TripDocument

router = APIRouter(tags=["public"])


@router.get("/public/trips/{token}", response_model=PublicTrip)
def public_trip(token: str) -> PublicTrip:
    res = (
        service_client().table("trips")
        .select("slug, destination, days, start_date, document, created_at")
        .eq("share_token", token).maybe_single().execute()
    )
    if not res or not res.data:
        raise HTTPException(status_code=404, detail="Not found")
    row = res.data
    doc = TripDocument(**row["document"])
    return PublicTrip(
        slug=row["slug"],
        destination=row["destination"],
        days=row["days"],
        start_date=row.get("start_date"),
        document=doc,
        created_at=row["created_at"],
    )
```

- [ ] **Step 4: Wire the router in `api/api/main.py`**

Add to imports:

```python
from api.routes import public as public_routes
```

After existing `app.include_router(...)` lines:

```python
app.include_router(public_routes.router)
```

- [ ] **Step 5: Run tests**

```bash
cd /Users/viggy/travel-planning/api && source .venv/bin/activate
pytest tests/test_routes_public.py -v
```
Expected: 3 passed.

- [ ] **Step 6: Run the full suite**

```bash
cd /Users/viggy/travel-planning/api && source .venv/bin/activate
pytest -q
```
Expected: all green.

- [ ] **Step 7: Commit**

```bash
cd /Users/viggy/travel-planning
git add api/
git commit -m "$(cat <<'EOF'
Add anonymous public route: GET /public/trips/:token

Returns PublicTrip — itinerary, hotels, map, dates, destination. No
user_id, airport_*, or travel_style (which carries profile addendum).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Include `share_token` in owner trip-fetch responses

**Files:**
- Modify: `api/api/routes/trips.py`

- [ ] **Step 1: Verify the existing get_trip and create_trip routes**

Both routes return `TripFull(...)` from a Supabase row. The select uses `select("*")` which already includes `share_token` after the migration. The `TripFull` model now has `share_token: str | None = None` (Task 3), so deserialization picks it up automatically with no code change.

Run an existing test to confirm nothing broke:

```bash
cd /Users/viggy/travel-planning/api && source .venv/bin/activate
pytest tests/test_routes_trips.py -v
```
Expected: all green.

- [ ] **Step 2: Add an explicit assertion test**

Append to `api/tests/test_routes_trips.py`:

```python
def test_get_trip_carries_share_token(monkeypatch, auth_headers) -> None:
    """share_token from the row should ride along on the TripFull response."""
    OWNER_ID = "owner-uid"
    trip_row = {
        "id": "t1", "slug": "kyoto-7d-zzz", "user_id": OWNER_ID,
        "destination": "Kyoto", "days": 7, "travel_style": "x",
        "start_date": None, "airport_entry": None, "airport_exit": None,
        "document": {"document_markdown": "x", "places": [], "neighborhoods": []},
        "places": [], "share_token": "shared-token-123",
        "created_at": "2026-05-01T00:00:00+00:00",
    }
    chain = MagicMock()
    chain.select.return_value = chain
    chain.eq.return_value = chain
    chain.single.return_value = chain
    chain.execute.return_value = MagicMock(data=trip_row)
    client = MagicMock()
    client.table.return_value = chain
    monkeypatch.setattr("api.routes.trips.service_client", lambda: client)

    headers = {"Authorization": auth_headers["Authorization"]}
    # The fixture user-id is not OWNER_ID; we need a fresh token.
    from jose import jwt
    import time as _t
    headers = {"Authorization": "Bearer " + jwt.encode(
        {"sub": OWNER_ID, "email": "v@example.com",
         "exp": int(_t.time()) + 3600, "aud": "authenticated"},
        get_settings().supabase_jwt_secret, algorithm="HS256",
    )}

    res = TestClient(app).get("/trips/kyoto-7d-zzz", headers=headers)
    assert res.status_code == 200, res.text
    assert res.json()["share_token"] == "shared-token-123"
```

(`get_settings` is already imported at the top of `test_routes_trips.py`.)

- [ ] **Step 3: Run tests**

```bash
cd /Users/viggy/travel-planning/api && source .venv/bin/activate
pytest tests/test_routes_trips.py::test_get_trip_carries_share_token -v
```
Expected: pass.

- [ ] **Step 4: Commit**

```bash
cd /Users/viggy/travel-planning
git add api/tests/test_routes_trips.py
git commit -m "$(cat <<'EOF'
Test: TripFull carries share_token from the row

No code change — TripFull.share_token (added in Task 3) auto-picks
up share_token from select("*") rows. This test pins the contract.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase 3 — Frontend types + API client

### Task 7: Add types and API methods

**Files:**
- Modify: `web/src/lib/types.ts`
- Modify: `web/src/lib/api.ts`

- [ ] **Step 1: Append types**

Find the existing `TripFull` interface in `web/src/lib/types.ts`:

```typescript
export interface TripFull extends TripSummary {
  travel_style: string;
  start_date: string | null;
  airport_entry: string | null;
  airport_exit: string | null;
  document: TripDocument;
}
```

Add `share_token`:

```typescript
export interface TripFull extends TripSummary {
  travel_style: string;
  start_date: string | null;
  airport_entry: string | null;
  airport_exit: string | null;
  document: TripDocument;
  share_token: string | null;
}
```

Then append at the bottom of the file:

```typescript
export interface ShareOut {
  share_url: string;
  token: string;
}

export interface PublicTrip {
  slug: string;
  destination: string;
  days: number;
  start_date: string | null;
  document: TripDocument;
  created_at: string;
}
```

- [ ] **Step 2: API methods**

In `web/src/lib/api.ts`, update the `import type` line at the top to include the new types:

```typescript
import type {
  Budget,
  BudgetDay,
  BudgetDayIn,
  Neighborhood,
  PublicTrip,
  ShareOut,
  TripBriefIn,
  TripFull,
  TripSummary,
  UserProfile,
  UserProfileIn,
} from "./types";
```

Append at the bottom of the file:

```typescript
export async function createShare(slug: string, token: string): Promise<ShareOut> {
  const res = await authedFetch(
    `/trips/${slug}/share`, { method: "POST" }, token,
  );
  if (!res.ok) throw new Error(`createShare ${res.status}`);
  return res.json();
}

export async function revokeShare(slug: string, token: string): Promise<void> {
  const res = await authedFetch(
    `/trips/${slug}/share`, { method: "DELETE" }, token,
  );
  if (!res.ok && res.status !== 204) throw new Error(`revokeShare ${res.status}`);
}

export async function getPublicTrip(token: string): Promise<PublicTrip | null> {
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_API_BASE}/public/trips/${token}`,
    { method: "GET" },
  );
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`getPublicTrip ${res.status}`);
  return res.json();
}
```

(`getPublicTrip` is intentionally NOT using `authedFetch` — the route is anonymous.)

- [ ] **Step 3: Type-check**

```bash
cd /Users/viggy/travel-planning/web && npx tsc --noEmit
```
Expected: clean.

- [ ] **Step 4: Commit**

```bash
cd /Users/viggy/travel-planning
git add web/
git commit -m "$(cat <<'EOF'
Add ShareOut + PublicTrip types and API client methods

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase 4 — Frontend: owner share UI

### Task 8: ShareMenu popover

**Files:**
- Create: `web/src/components/ShareMenu.tsx`

- [ ] **Step 1: Write the component**

Create `web/src/components/ShareMenu.tsx`:

```tsx
"use client";

import { useEffect, useRef, useState } from "react";

import { createShare, revokeShare } from "@/lib/api";
import { getBrowserToken } from "@/lib/auth.browser";

type Phase = "idle" | "busy" | "error";

export function ShareMenu({
  slug, initialToken,
}: {
  slug: string;
  initialToken: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [token, setToken] = useState<string | null>(initialToken);
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    window.addEventListener("mousedown", handler);
    return () => window.removeEventListener("mousedown", handler);
  }, [open]);

  const shareUrl = token
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/s/${token}`
    : null;

  async function generate() {
    setPhase("busy");
    setError(null);
    try {
      const auth = await getBrowserToken();
      if (!auth) { setError("Not signed in"); setPhase("error"); return; }
      const out = await createShare(slug, auth);
      setToken(out.token);
      setPhase("idle");
    } catch (e) {
      console.error("createShare failed", e);
      setError("Couldn't create share link");
      setPhase("error");
    }
  }

  async function rotate() {
    await generate();
  }

  async function stop() {
    setPhase("busy");
    setError(null);
    try {
      const auth = await getBrowserToken();
      if (!auth) { setError("Not signed in"); setPhase("error"); return; }
      await revokeShare(slug, auth);
      setToken(null);
      setPhase("idle");
    } catch (e) {
      console.error("revokeShare failed", e);
      setError("Couldn't stop sharing");
      setPhase("error");
    }
  }

  async function copy() {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (e) {
      console.error("clipboard failed", e);
    }
  }

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={
          token
            ? "rounded-[10px] bg-amber-100 text-amber-800 text-xs font-semibold px-3 py-1.5 hover:bg-amber-200"
            : "rounded-[10px] bg-white/70 text-ink-700 text-xs px-3 py-1.5 border border-amber-700/12 hover:bg-white/90"
        }
        title={token ? "Public link active — manage" : "Share this trip"}
      >
        {token ? "Public" : "Share"}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-[320px] frosted-strong rounded-[14px] p-4 shadow-lg z-30 flex flex-col gap-3">
          {!token && (
            <>
              <p className="text-xs text-ink-700">
                Generate a link anyone can open — no account needed.
              </p>
              <button
                type="button"
                onClick={generate}
                disabled={phase === "busy"}
                className="rounded-[10px] bg-gradient-to-br from-amber-400 to-amber-600 text-white text-sm py-2 font-medium hover:shadow-md disabled:opacity-50"
              >
                {phase === "busy" ? "Generating…" : "Generate share link"}
              </button>
            </>
          )}

          {token && shareUrl && (
            <>
              <div className="text-[10px] uppercase tracking-wider text-amber-700">
                Public link
              </div>
              <input
                readOnly
                value={shareUrl}
                onFocus={(e) => e.currentTarget.select()}
                className="w-full rounded-[8px] bg-white/85 border border-amber-700/12 px-2 py-1.5 text-xs text-ink-900 outline-none focus:border-amber-600/40"
              />
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={copy}
                  className="rounded-[8px] bg-amber-600 text-white text-xs font-semibold px-3 py-1.5 hover:bg-amber-700"
                >
                  {copied ? "Copied ✓" : "Copy"}
                </button>
                <button
                  type="button"
                  onClick={rotate}
                  disabled={phase === "busy"}
                  className="text-xs text-ink-500 hover:text-ink-900 disabled:opacity-50"
                  title="Generate a new link (the current one stops working)"
                >
                  Rotate link
                </button>
                <button
                  type="button"
                  onClick={stop}
                  disabled={phase === "busy"}
                  className="text-xs text-rose-500 hover:text-rose-700 ml-auto disabled:opacity-50"
                >
                  Stop sharing
                </button>
              </div>
              <p className="text-[10px] text-ink-500">
                Anyone with the link can view the itinerary, hotels, and map.
                Budget stays private.
              </p>
            </>
          )}

          {error && <span className="text-xs text-rose-600">{error}</span>}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
cd /Users/viggy/travel-planning/web && npx tsc --noEmit
```
Expected: clean.

- [ ] **Step 3: Commit**

```bash
cd /Users/viggy/travel-planning
git add web/src/components/ShareMenu.tsx
git commit -m "$(cat <<'EOF'
Add ShareMenu owner popover (generate / rotate / stop)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: Wire ShareMenu into TripView header

**Files:**
- Modify: `web/src/app/trip/[slug]/TripView.tsx`

- [ ] **Step 1: Inspect the header**

Read `web/src/app/trip/[slug]/TripView.tsx`. Locate the header `<div>` that contains the destination + days line and the existing PDF Export button. The ShareMenu sits next to the PDF Export.

- [ ] **Step 2: Render ShareMenu**

Add the import:

```tsx
import { ShareMenu } from "@/components/ShareMenu";
```

Inside the header, next to `<PdfExportMenu ... />`:

```tsx
<ShareMenu slug={trip.slug} initialToken={trip.share_token} />
```

(`trip.share_token` is now on `TripFull` after Task 7.)

- [ ] **Step 3: Type-check + build**

```bash
cd /Users/viggy/travel-planning/web && npx tsc --noEmit
cd /Users/viggy/travel-planning/web && npm run build
```
Expected: clean.

- [ ] **Step 4: Commit**

```bash
cd /Users/viggy/travel-planning
git add web/src/app/trip/[slug]/TripView.tsx
git commit -m "$(cat <<'EOF'
Render ShareMenu in trip header next to PDF Export

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase 5 — Frontend: public viewer

### Task 10: TripPanel readOnly prop

**Files:**
- Modify: `web/src/components/TripPanel.tsx`

- [ ] **Step 1: Add the readOnly prop**

Find the existing TripPanel signature:

```tsx
export function TripPanel({
  trip,
  budget,
  onFocusPlaces,
  onRefinePrefill,
}: {
  trip: TripFull;
  budget: Budget | null;
  onFocusPlaces: (places: Place[] | null) => void;
  onRefinePrefill: (text: string) => void;
}) {
```

Extend it:

```tsx
export function TripPanel({
  trip,
  budget,
  readOnly = false,
  onFocusPlaces,
  onRefinePrefill,
}: {
  trip: TripFull | { slug: string; destination: string; days: number;
                     document: TripFull["document"] };
  budget: Budget | null;
  readOnly?: boolean;
  onFocusPlaces: (places: Place[] | null) => void;
  onRefinePrefill: (text: string) => void;
}) {
```

(The widened `trip` type lets PublicView pass a `PublicTrip`-like object. Existing call sites pass `TripFull` and remain compatible.)

- [ ] **Step 2: Filter the Budget tab in readOnly**

Find the existing tabs array. Wrap it:

```tsx
import { type Tab } from "./TripPanelTabs";

const TABS_FULL: Tab[] = ["Itinerary", "Where to stay", "Budget"];
const TABS_READONLY: Tab[] = ["Itinerary", "Where to stay"];

const visibleTabs = readOnly ? TABS_READONLY : TABS_FULL;
```

Pass `tabs={visibleTabs}` into `<TripPanelTabs>` (this requires accepting an optional `tabs` prop — see Step 3).

In the body, when `tab === "Budget"`, only render `<BudgetTab>` if `!readOnly`. The tab can never be selected in readOnly because the selector won't render it; defensive guard.

- [ ] **Step 3: Make TripPanelTabs accept an explicit tabs list**

Open `web/src/components/TripPanelTabs.tsx`. Change the signature:

```tsx
const ALL_TABS = ["Itinerary", "Where to stay", "Budget"] as const;
export type Tab = (typeof ALL_TABS)[number];

export function TripPanelTabs({
  active, onChange, tabs = ALL_TABS as readonly Tab[],
}: {
  active: Tab;
  onChange: (t: Tab) => void;
  tabs?: readonly Tab[];
}) {
  return (
    <div className="flex gap-4 px-4 pt-3 border-b border-amber-700/10">
      {tabs.map((t) => ( /* same JSX as before */ ))}
    </div>
  );
}
```

- [ ] **Step 4: Type-check**

```bash
cd /Users/viggy/travel-planning/web && npx tsc --noEmit
```
Expected: clean.

- [ ] **Step 5: Commit**

```bash
cd /Users/viggy/travel-planning
git add web/
git commit -m "$(cat <<'EOF'
TripPanel: optional readOnly prop hides Budget tab

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 11: PublicShell + PublicView + /s/[token] page

**Files:**
- Create: `web/src/components/PublicShell.tsx`
- Create: `web/src/app/s/[token]/PublicView.tsx`
- Create: `web/src/app/s/[token]/page.tsx`

- [ ] **Step 1: PublicShell — minimal header**

Create `web/src/components/PublicShell.tsx`:

```tsx
import Link from "next/link";

import { BrandMark } from "./BrandMark";

export function PublicShell({
  children, title, subtitle,
}: {
  children: React.ReactNode;
  title: string;
  subtitle?: string;
}) {
  return (
    <main className="relative h-dvh w-screen overflow-hidden">
      {children}
      <header className="absolute top-0 inset-x-0 px-6 py-3 flex items-center justify-between backdrop-blur-md bg-cream-50/40 z-10 anim-slide-up">
        <Link href="/" className="contents"><BrandMark /></Link>
        <div className="text-sm text-ink-700 font-medium">
          {title}
          {subtitle && <span className="text-ink-500"> · {subtitle}</span>}
        </div>
        <Link
          href="/"
          className="text-xs text-ink-500 hover:text-ink-900"
        >
          Plan your own →
        </Link>
      </header>
    </main>
  );
}
```

- [ ] **Step 2: PublicView — stripped TripView**

Create `web/src/app/s/[token]/PublicView.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";

import { Map } from "@/components/Map";
import { MobileSheet } from "@/components/MobileSheet";
import { PublicShell } from "@/components/PublicShell";
import { TripPanel } from "@/components/TripPanel";
import type { Place, PublicTrip } from "@/lib/types";

function useIsMobile(): boolean | null {
  const [isMobile, setIsMobile] = useState<boolean | null>(null);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return isMobile;
}

export function PublicView({ trip }: { trip: PublicTrip }) {
  const isMobile = useIsMobile();
  const [focusPlaces, setFocusPlaces] = useState<Place[] | null>(null);

  return (
    <PublicShell title={trip.destination} subtitle={`${trip.days} days`}>
      <div className="absolute inset-0 anim-fade-in">
        <Map places={trip.document.places} focusPlaces={focusPlaces} />
      </div>

      {isMobile === false && (
        <aside className="absolute left-4 top-16 bottom-4 w-[330px] frosted-strong rounded-[18px] overflow-hidden flex flex-col z-10 anim-slide-left">
          <div className="flex-1 overflow-hidden">
            <TripPanel
              trip={trip}
              budget={null}
              readOnly
              onFocusPlaces={setFocusPlaces}
              onRefinePrefill={() => {}}
            />
          </div>
          <div className="border-t border-amber-700/10 px-3 py-2 text-[10px] text-ink-500 text-center">
            Created with Atlas — atlas.viggy.dev
          </div>
        </aside>
      )}

      {isMobile === true && (
        <MobileSheet>
          <div className="h-full flex flex-col">
            <div className="flex-1 overflow-hidden">
              <TripPanel
                trip={trip}
                budget={null}
                readOnly
                onFocusPlaces={setFocusPlaces}
                onRefinePrefill={() => {}}
              />
            </div>
            <div className="border-t border-amber-700/10 px-3 py-2 text-[10px] text-ink-500 text-center">
              Created with Atlas — atlas.viggy.dev
            </div>
          </div>
        </MobileSheet>
      )}
    </PublicShell>
  );
}
```

- [ ] **Step 3: Server page**

Create `web/src/app/s/[token]/page.tsx`:

```tsx
import { notFound } from "next/navigation";

import { getPublicTrip } from "@/lib/api";

import { PublicView } from "./PublicView";

export default async function PublicTripPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const trip = await getPublicTrip(token).catch(() => null);
  if (!trip) notFound();
  return <PublicView trip={trip} />;
}
```

- [ ] **Step 4: Type-check + build**

```bash
cd /Users/viggy/travel-planning/web && npx tsc --noEmit
cd /Users/viggy/travel-planning/web && npm run build
```
Expected: clean. The `/s/[token]` route should appear in the build output.

- [ ] **Step 5: Commit**

```bash
cd /Users/viggy/travel-planning
git add web/
git commit -m "$(cat <<'EOF'
Add /s/[token] public viewer

Reuses Map + TripPanel(readOnly) so the friend sees the same Atlas
layout minus Budget, Refine, Delete, PDF, and owner identity.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase 6 — Deploy

### Task 12: Deploy backend + verify end-to-end

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

1. Open an existing trip → click Share button → "Generate share link" → URL appears.
2. Copy the URL, open it in an incognito window → trip loads, no signin prompt.
3. Verify the public view: itinerary visible ✓, hotels visible ✓, map visible ✓, NO Budget tab ✓, NO Refine input ✓, NO PDF Export ✓, NO UserMenu ✓.
4. In the owner window, click Rotate → previous URL 404s in incognito; new URL works.
5. Click Stop sharing → URL 404s; Share button reverts to "Share" state (no longer "Public").
6. Hit `/public/trips/garbage` directly → 404 page.

- [ ] **Step 5: Done**

No commit — deploy is a side effect.

---

## Self-review

**1. Spec coverage**

| Spec section                             | Implemented in     |
| ---                                      | ---                |
| `share_token` column + RLS               | Task 1             |
| `APP_BASE_URL` setting                   | Task 2             |
| Pydantic models (ShareOut, PublicTrip)   | Task 3             |
| `TripFull.share_token`                   | Task 3             |
| POST/DELETE /trips/:slug/share           | Task 4             |
| GET /public/trips/:token (anon)          | Task 5             |
| share_token rides on TripFull responses  | Task 6             |
| Frontend types + API methods             | Task 7             |
| ShareMenu popover (generate/rotate/stop) | Task 8             |
| ShareMenu in trip header                 | Task 9             |
| TripPanel `readOnly` prop                | Task 10            |
| PublicShell + PublicView + /s/[token]    | Task 11            |
| Deploy + smoke                           | Task 12            |

**2. Placeholder scan** — no TBDs / TODOs / "add appropriate handling". Tasks that touch existing files (Task 9 finding the header, Task 10 wrapping tab arrays) name the function/element to find and the exact change required.

**3. Type consistency**
- `share_token` is `str | None` in Pydantic, `string | null` in TS, `text` (nullable) in Postgres.
- `ShareOut.share_url` and `.token` match Python and TS.
- `PublicTrip` excludes the same fields in both Python and TS: no `user_id`, no `airport_*`, no `travel_style`.
- `TripPanelTabs.tabs` defaults to all three so existing call sites that didn't pass a `tabs` prop continue to work.
- `PublicView` passes `budget={null}` and `readOnly` so TripPanel's existing budget-aware code paths short-circuit.

**4. Out-of-scope items deferred** — no per-share toggles, no expiry, no analytics, no comments, no rich previews, no multi-token-per-trip. All matched the spec.
