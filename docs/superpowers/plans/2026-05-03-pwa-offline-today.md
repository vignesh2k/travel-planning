# PWA + Offline + Today View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Atlas is installable as a PWA, the active trip pre-caches itself for offline travel, the home screen icon launches into today's day, and dateless trips can be patched in-place.

**Architecture:** Hand-rolled service worker with three versioned cache buckets (shell / trips / tiles). When the home page detects an active trip, a tiny client component sends a `precache-trip` postMessage to the SW which fetches the trip's data + map style + bounding-box tiles. New `/today` route resolves the active trip server-side and redirects into `/trip/{slug}?day=N`. New `TripDateEdit` component + `PATCH /trips/{slug}` lets users add or change a trip's start date.

**Tech Stack:** Hand-written `sw.js` (no Workbox), Next 16 App Router, FastAPI/Pydantic v2. New devDependency: `sharp` for one-time icon generation.

**Spec reference:** [docs/superpowers/specs/2026-05-03-pwa-offline-today-design.md](../specs/2026-05-03-pwa-offline-today-design.md)

---

## File structure

```
api/api/
├── models.py                         MODIFIED: TripSummary.start_date, TripPatch
└── routes/trips.py                   MODIFIED: list_trips select; new patch_trip

api/tests/
└── test_routes_trips.py              MODIFIED: list returns start_date;
                                                  patch happy/403/404/clears

web/public/
├── manifest.json                     NEW
├── sw.js                             NEW (~120 lines, hand-rolled)
├── icon-192.png                      NEW (amber-on-cream Atlas mark)
├── icon-512.png                      NEW
└── icon-source.svg                   NEW (source SVG used by gen-icons script)

scripts/
└── gen-icons.mjs                     NEW: one-time PNG export from SVG (sharp)

web/src/
├── app/today/page.tsx                NEW: server redirect / "no trip today"
├── app/offline/page.tsx              NEW: minimal cached offline page
├── app/layout.tsx                    MODIFIED: manifest + meta + SWRegister
├── app/page.tsx                      MODIFIED: TodayBanner + ActiveTripPrecache
├── app/trip/[slug]/page.tsx          MODIFIED: read ?day= query
├── app/trip/[slug]/TripView.tsx      MODIFIED: thread initialDay
├── components/
│   ├── TodayBanner.tsx               NEW
│   ├── ServiceWorkerRegister.tsx     NEW: client; registers /sw.js
│   ├── ActiveTripPrecache.tsx        NEW: postMessage on mount
│   ├── TripDateEdit.tsx              NEW: inline date editor
│   ├── TripPanel.tsx                 MODIFIED: accept initialDay
│   └── Itinerary.tsx                 MODIFIED: accept initialDay
├── lib/
│   ├── active-trip.ts                NEW: findActiveTrip + bboxFromPlaces
│   ├── api.ts                        MODIFIED: patchTrip()
│   └── types.ts                      MODIFIED: TripSummary.start_date

web/AGENTS.md                         MODIFIED: SW lifecycle + PWA gotchas
```

---

## Phase 1 — Backend: TripSummary date + PATCH route

### Task 1: Widen TripSummary + list_trips to include start_date

**Files:**
- Modify: `api/api/models.py:108-114`
- Modify: `api/api/routes/trips.py:238-251`
- Test: `api/tests/test_routes_trips.py`

- [ ] **Step 1: Write the failing test**

Append to `api/tests/test_routes_trips.py`:

```python
def test_list_trips_includes_start_date(monkeypatch, auth_headers) -> None:
    rows = [
        {
            "id": "t1", "slug": "kyoto-7d-aaa", "destination": "Kyoto",
            "days": 7, "start_date": "2026-05-15",
            "created_at": "2026-05-01T00:00:00+00:00",
        },
        {
            "id": "t2", "slug": "lisbon-5d-bbb", "destination": "Lisbon",
            "days": 5, "start_date": None,
            "created_at": "2026-04-10T00:00:00+00:00",
        },
    ]
    monkeypatch.setattr(
        "api.routes.trips.service_client",
        lambda: _mock_supabase_select(rows),
    )
    res = TestClient(app).get("/trips", headers=auth_headers)
    assert res.status_code == 200, res.text
    body = res.json()
    assert body[0]["start_date"] == "2026-05-15"
    assert body[1]["start_date"] is None
```

- [ ] **Step 2: Run to verify failure**

```bash
cd /Users/viggy/travel-planning/api && source .venv/bin/activate
pytest tests/test_routes_trips.py::test_list_trips_includes_start_date -v
```
Expected: FAIL — pydantic ValidationError ("start_date is missing"), or KeyError, depending on order.

- [ ] **Step 3: Add the field on TripSummary**

In `api/api/models.py`, find:

```python
class TripSummary(BaseModel):
    """For the trip list endpoint."""
    id: str
    slug: str
    destination: str
    days: int
    created_at: datetime
```

Replace with:

```python
class TripSummary(BaseModel):
    """For the trip list endpoint."""
    id: str
    slug: str
    destination: str
    days: int
    start_date: date | None = None
    created_at: datetime
```

- [ ] **Step 4: Widen the list_trips select**

In `api/api/routes/trips.py`, find:

```python
def list_trips(user: CurrentUser) -> list[TripSummary]:
    res = (
        service_client().table("trips")
        .select("id, slug, destination, days, created_at")
```

Change the select to include `start_date`:

```python
def list_trips(user: CurrentUser) -> list[TripSummary]:
    res = (
        service_client().table("trips")
        .select("id, slug, destination, days, start_date, created_at")
```

- [ ] **Step 5: Run tests**

```bash
cd /Users/viggy/travel-planning/api && source .venv/bin/activate
pytest tests/test_routes_trips.py -v
```
Expected: all green including the new test.

- [ ] **Step 6: Commit**

```bash
cd /Users/viggy/travel-planning
git add api/api/models.py api/api/routes/trips.py api/tests/test_routes_trips.py
git commit -m "$(cat <<'EOF'
TripSummary now carries start_date

The Today view needs to know each trip's start date without an extra
round-trip per trip; widening the list endpoint is the cheapest path.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: PATCH /trips/{slug} route

**Files:**
- Modify: `api/api/models.py` (add TripPatch)
- Modify: `api/api/routes/trips.py` (add patch_trip)
- Test: `api/tests/test_routes_trips.py`

- [ ] **Step 1: Write the failing tests**

Append to `api/tests/test_routes_trips.py`:

```python
OWNER_ID_PATCH = "owner-uid-patch"


def _mock_supabase_get_then_update(initial: dict, updated: dict) -> MagicMock:
    """select(*).eq.single → initial; update.eq.execute → [updated]."""
    select_chain = MagicMock()
    select_chain.select.return_value = select_chain
    select_chain.eq.return_value = select_chain
    select_chain.single.return_value = select_chain
    select_chain.execute.return_value = MagicMock(data=initial)

    update_chain = MagicMock()
    update_chain.eq.return_value = update_chain
    update_chain.execute.return_value = MagicMock(data=[updated] if updated else [])
    select_chain.update.return_value = update_chain

    client = MagicMock()
    client.table.return_value = select_chain
    return client


def _patch_owner_headers() -> dict[str, str]:
    return {"Authorization": f"Bearer {_token(OWNER_ID_PATCH)}"}


def _patch_trip_row(start_date: str | None = None) -> dict:
    return {
        "id": "tp1",
        "slug": "kyoto-7d-patch",
        "user_id": OWNER_ID_PATCH,
        "destination": "Kyoto",
        "days": 7,
        "travel_style": "x",
        "start_date": start_date,
        "airport_entry": None,
        "airport_exit": None,
        "document": {"document_markdown": "x", "places": [], "neighborhoods": []},
        "places": [],
        "share_token": None,
        "created_at": "2026-05-01T00:00:00+00:00",
    }


def test_patch_trip_sets_start_date(monkeypatch) -> None:
    initial = _patch_trip_row(start_date=None)
    updated = _patch_trip_row(start_date="2026-05-15")
    monkeypatch.setattr(
        "api.routes.trips.service_client",
        lambda: _mock_supabase_get_then_update(initial, updated),
    )
    res = TestClient(app).patch(
        "/trips/kyoto-7d-patch",
        headers=_patch_owner_headers(),
        json={"start_date": "2026-05-15"},
    )
    assert res.status_code == 200, res.text
    assert res.json()["start_date"] == "2026-05-15"


def test_patch_trip_clears_start_date(monkeypatch) -> None:
    initial = _patch_trip_row(start_date="2026-05-15")
    updated = _patch_trip_row(start_date=None)
    monkeypatch.setattr(
        "api.routes.trips.service_client",
        lambda: _mock_supabase_get_then_update(initial, updated),
    )
    res = TestClient(app).patch(
        "/trips/kyoto-7d-patch",
        headers=_patch_owner_headers(),
        json={"start_date": None},
    )
    assert res.status_code == 200, res.text
    assert res.json()["start_date"] is None


def test_patch_trip_403_when_not_owner(monkeypatch) -> None:
    initial = {**_patch_trip_row(), "user_id": "someone-else"}
    monkeypatch.setattr(
        "api.routes.trips.service_client",
        lambda: _mock_supabase_get_then_update(initial, initial),
    )
    res = TestClient(app).patch(
        "/trips/kyoto-7d-patch",
        headers=_patch_owner_headers(),
        json={"start_date": "2026-05-15"},
    )
    assert res.status_code == 403


def test_patch_trip_404_when_missing(monkeypatch) -> None:
    monkeypatch.setattr(
        "api.routes.trips.service_client",
        lambda: _mock_supabase_get_then_update(None, None),
    )
    res = TestClient(app).patch(
        "/trips/missing",
        headers=_patch_owner_headers(),
        json={"start_date": "2026-05-15"},
    )
    assert res.status_code == 404


def test_patch_trip_requires_auth() -> None:
    res = TestClient(app).patch("/trips/x", json={"start_date": "2026-05-15"})
    assert res.status_code == 401
```

- [ ] **Step 2: Run to verify failure**

```bash
cd /Users/viggy/travel-planning/api && source .venv/bin/activate
pytest tests/test_routes_trips.py::test_patch_trip_sets_start_date -v
```
Expected: FAIL — endpoint 404 (route doesn't exist).

- [ ] **Step 3: Add the TripPatch model**

In `api/api/models.py`, near the other Trip-related models (after `class TripFull(...)` or at the end of the trip section):

```python
class TripPatch(BaseModel):
    """Partial-update fields for an existing trip. v1 supports start_date only."""
    start_date: date | None = None
```

- [ ] **Step 4: Add the patch_trip route**

In `api/api/routes/trips.py`, add `TripPatch` to the existing `from api.models import ...` line. Then append a new route at the bottom of the file:

```python
@router.patch("/trips/{slug}", response_model=TripFull)
def patch_trip(slug: str, body: TripPatch, user: CurrentUser) -> TripFull:
    db = service_client()
    res = db.table("trips").select("*").eq("slug", slug).single().execute()
    if not res or not res.data:
        raise HTTPException(status_code=404, detail="Trip not found")
    if res.data["user_id"] != user["sub"]:
        raise HTTPException(status_code=403, detail="Not your trip")

    update = {
        "start_date": body.start_date.isoformat() if body.start_date else None,
    }
    upd = db.table("trips").update(update).eq("slug", slug).execute()
    if not upd.data:
        raise HTTPException(status_code=500, detail="update returned no row")

    row = upd.data[0]
    inserted_data = {**row}
    doc_dict = inserted_data.pop("document")
    return TripFull(**inserted_data, document=TripDocument(**doc_dict))
```

- [ ] **Step 5: Run tests**

```bash
cd /Users/viggy/travel-planning/api && source .venv/bin/activate
pytest tests/test_routes_trips.py -v
```
Expected: 5 new patch tests pass.

- [ ] **Step 6: Commit**

```bash
cd /Users/viggy/travel-planning
git add api/api/models.py api/api/routes/trips.py api/tests/test_routes_trips.py
git commit -m "$(cat <<'EOF'
Add PATCH /trips/:slug for partial updates (start_date only in v1)

Owner-only. Accepts {start_date: date | null}; null clears the date.
Returns the full updated trip so the frontend can refresh state in
one round-trip.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase 2 — Frontend: TripDateEdit

### Task 3: Frontend types + patchTrip + TripDateEdit + wiring

**Files:**
- Modify: `web/src/lib/types.ts`
- Modify: `web/src/lib/api.ts`
- Create: `web/src/components/TripDateEdit.tsx`
- Modify: `web/src/app/trip/[slug]/TripView.tsx`

- [ ] **Step 1: Add start_date to TripSummary**

In `web/src/lib/types.ts`, find the existing `TripSummary` interface:

```typescript
export interface TripSummary {
  id: string;
  slug: string;
  destination: string;
  days: number;
  created_at: string;
}
```

Replace with:

```typescript
export interface TripSummary {
  id: string;
  slug: string;
  destination: string;
  days: number;
  start_date: string | null;
  created_at: string;
}
```

(`TripFull extends TripSummary` so it inherits the field automatically. The existing `start_date` declaration on `TripFull` becomes redundant — remove it from `TripFull`'s field list to avoid duplicate declaration.)

- [ ] **Step 2: Add patchTrip API method**

In `web/src/lib/api.ts`, find the existing `import type { ... } from "./types";` block. Append the new method at the bottom of the file:

```typescript
export async function patchTrip(
  slug: string,
  body: { start_date: string | null },
  token: string,
): Promise<TripFull> {
  const res = await authedFetch(
    `/trips/${slug}`,
    { method: "PATCH", body: JSON.stringify(body) },
    token,
  );
  if (!res.ok) throw new Error(`patchTrip ${res.status}`);
  return res.json();
}
```

- [ ] **Step 3: Create TripDateEdit**

Create `web/src/components/TripDateEdit.tsx`:

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { patchTrip } from "@/lib/api";
import { getBrowserToken } from "@/lib/auth.browser";

function formatDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

export function TripDateEdit({
  slug, initial,
}: {
  slug: string;
  initial: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState<string>(initial ?? "");
  const [current, setCurrent] = useState<string | null>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
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

  async function save(next: string | null) {
    setSaving(true);
    setError(null);
    try {
      const token = await getBrowserToken();
      if (!token) { setError("Not signed in"); return; }
      const updated = await patchTrip(slug, { start_date: next }, token);
      setCurrent(updated.start_date);
      setValue(updated.start_date ?? "");
      setOpen(false);
      router.refresh();
    } catch (e) {
      console.error("patchTrip failed", e);
      setError("Couldn't save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div ref={wrapperRef} className="relative inline-flex items-center">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={
          current
            ? "text-sm text-ink-700 hover:text-ink-900 underline-offset-2 hover:underline"
            : "text-xs text-amber-700 hover:text-amber-900 underline-offset-2 hover:underline"
        }
        title={current ? "Edit start date" : "Add a start date"}
      >
        {current ? formatDate(current) : "+ Add dates"}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-[260px] frosted-strong rounded-[12px] p-3 shadow-lg z-30 flex flex-col gap-2">
          <div className="text-[10px] uppercase tracking-wider text-amber-700">
            Trip start date
          </div>
          <input
            type="date"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="w-full rounded-[8px] bg-white/85 border border-amber-700/12 px-2 py-1.5 text-sm text-ink-900 outline-none focus:border-amber-600/40"
          />
          <div className="flex items-center gap-2 mt-1">
            <button
              type="button"
              onClick={() => save(value || null)}
              disabled={saving || (!value && !current)}
              className="rounded-[8px] bg-amber-600 text-white text-xs font-semibold px-3 py-1.5 hover:bg-amber-700 disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save"}
            </button>
            {current && (
              <button
                type="button"
                onClick={() => save(null)}
                disabled={saving}
                className="text-xs text-rose-500 hover:text-rose-700 disabled:opacity-50 ml-auto"
              >
                Clear
              </button>
            )}
          </div>
          {error && <span className="text-xs text-rose-600">{error}</span>}
          <p className="text-[10px] text-ink-500">
            Setting a date enables the Today view on the home screen.
          </p>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Wire TripDateEdit into TripView header**

Open `web/src/app/trip/[slug]/TripView.tsx`. Find the header line:

```tsx
        <div className="text-sm text-ink-700 font-medium">
          {trip.destination} · {trip.days} days
        </div>
```

Replace with:

```tsx
        <div className="text-sm text-ink-700 font-medium flex items-center gap-2">
          <span>{trip.destination} · {trip.days} days</span>
          <span className="text-ink-300">·</span>
          <TripDateEdit slug={trip.slug} initial={trip.start_date} />
        </div>
```

Add the import at the top:

```tsx
import { TripDateEdit } from "@/components/TripDateEdit";
```

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
Add TripDateEdit inline editor in trip header

Native date input + Save / Clear popover. Calls PATCH /trips/:slug.
Triggers router.refresh() so the home page banner appears or
disappears on next visit.

TripSummary now carries start_date (TripFull inherits it); the
duplicate declaration on TripFull is removed.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase 3 — Today view

### Task 4: active-trip helper

**Files:**
- Create: `web/src/lib/active-trip.ts`

- [ ] **Step 1: Write the helper**

Create `web/src/lib/active-trip.ts`:

```typescript
import type { TripSummary } from "./types";

export interface ActiveTrip {
  trip: TripSummary;
  dayNumber: number;       // 1-indexed
  totalDays: number;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function ymd(d: Date): string {
  // Use local-time YMD so a trip starting "today" matches regardless
  // of TZ offset of the device versus the server.
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function daysBetweenInclusive(startIso: string, todayIso: string): number {
  const start = new Date(`${startIso}T00:00:00`);
  const today = new Date(`${todayIso}T00:00:00`);
  return Math.floor((today.getTime() - start.getTime()) / MS_PER_DAY);
}

/**
 * Find the trip that's active today, if any.
 *
 * "Active" = start_date is set AND start_date <= today < start_date + days.
 * If multiple trips qualify (rare overlap), pick the most recently created.
 */
export function findActiveTrip(
  trips: TripSummary[],
  today: Date = new Date(),
): ActiveTrip | null {
  const todayIso = ymd(today);

  const candidates: ActiveTrip[] = [];
  for (const trip of trips) {
    if (!trip.start_date) continue;
    const offset = daysBetweenInclusive(trip.start_date, todayIso);
    if (offset < 0 || offset >= trip.days) continue;
    candidates.push({
      trip,
      dayNumber: offset + 1,
      totalDays: trip.days,
    });
  }
  if (candidates.length === 0) return null;
  candidates.sort(
    (a, b) =>
      new Date(b.trip.created_at).getTime() - new Date(a.trip.created_at).getTime(),
  );
  return candidates[0];
}

/**
 * Tightest [minLng, minLat, maxLng, maxLat] around the given places.
 * Returns null if fewer than 2 points have valid coordinates.
 */
export function bboxFromPlaces(
  places: { lat: number | null; lng: number | null }[],
): [number, number, number, number] | null {
  const pts = places.filter(
    (p): p is { lat: number; lng: number } => p.lat !== null && p.lng !== null,
  );
  if (pts.length < 2) return null;
  let minLng = pts[0].lng, minLat = pts[0].lat;
  let maxLng = pts[0].lng, maxLat = pts[0].lat;
  for (const p of pts) {
    if (p.lng < minLng) minLng = p.lng;
    if (p.lng > maxLng) maxLng = p.lng;
    if (p.lat < minLat) minLat = p.lat;
    if (p.lat > maxLat) maxLat = p.lat;
  }
  return [minLng, minLat, maxLng, maxLat];
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
git add web/src/lib/active-trip.ts
git commit -m "$(cat <<'EOF'
Add findActiveTrip + bboxFromPlaces helpers

Pure functions. findActiveTrip uses local-TZ YMD so a trip starting
"today" matches regardless of UTC offset. bboxFromPlaces returns null
when fewer than 2 valid points (used to skip pre-cache for trips
whose places haven't geocoded).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: TodayBanner + /today route + ?day= query support

**Files:**
- Create: `web/src/components/TodayBanner.tsx`
- Create: `web/src/app/today/page.tsx`
- Modify: `web/src/app/page.tsx`
- Modify: `web/src/app/trip/[slug]/page.tsx`
- Modify: `web/src/app/trip/[slug]/TripView.tsx`
- Modify: `web/src/components/TripPanel.tsx`
- Modify: `web/src/components/Itinerary.tsx`

- [ ] **Step 1: TodayBanner component**

Create `web/src/components/TodayBanner.tsx`:

```tsx
import Link from "next/link";

import type { ActiveTrip } from "@/lib/active-trip";

export function TodayBanner({ active }: { active: ActiveTrip }) {
  return (
    <Link
      href={`/trip/${active.trip.slug}?day=${active.dayNumber}`}
      className="frosted-strong rounded-[18px] px-4 py-3 w-full max-w-xl flex items-center gap-3 hover:shadow-md transition-shadow anim-fade-in"
    >
      <span className="text-amber-600 text-base">✦</span>
      <div className="flex-1 min-w-0">
        <div className="text-[11px] uppercase tracking-wider text-amber-700">
          Today · Day {active.dayNumber} of {active.totalDays}
        </div>
        <div className="text-sm font-semibold text-ink-900 truncate">
          {active.trip.destination}
        </div>
      </div>
      <span className="text-xs text-ink-500 shrink-0">Open today →</span>
    </Link>
  );
}
```

- [ ] **Step 2: Render the banner on the home page**

In `web/src/app/page.tsx`, find the imports at the top and add:

```tsx
import { TodayBanner } from "@/components/TodayBanner";
import { findActiveTrip } from "@/lib/active-trip";
```

Find where `trips` is fetched. Compute `active` from it and render the banner above the existing children:

```tsx
  const active = findActiveTrip(trips);
```

In the JSX, place the banner BEFORE `<ChatInputClient />` (and, if profile banner is also rendered, above that too — banner ordering top-to-bottom: TodayBanner → ProfileBanner → ChatInput):

```tsx
        {active && <TodayBanner active={active} />}
        {profile === null && <ProfileBanner />}
        <ChatInputClient hasProfile={profile !== null} />
```

(Adapt to the existing JSX structure when implementing.)

- [ ] **Step 3: /today server redirect**

Create `web/src/app/today/page.tsx`:

```tsx
import Link from "next/link";
import { redirect } from "next/navigation";

import { BrandMark } from "@/components/BrandMark";
import { listTrips } from "@/lib/api";
import { findActiveTrip } from "@/lib/active-trip";
import { getServerToken } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function TodayPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/signin");

  const token = await getServerToken();
  const trips = token ? await listTrips(token).catch(() => []) : [];
  const active = findActiveTrip(trips);

  if (active) {
    redirect(`/trip/${active.trip.slug}?day=${active.dayNumber}`);
  }

  return (
    <main className="min-h-screen flex flex-col">
      <header className="px-6 py-4 flex items-center justify-between">
        <Link href="/" className="contents"><BrandMark /></Link>
      </header>
      <section className="flex-1 flex flex-col items-center justify-center gap-4 px-6 pb-12 anim-fade-in text-center">
        <div className="text-amber-600 text-3xl">✦</div>
        <h1 className="font-display text-3xl font-semibold text-ink-900">
          Nothing scheduled today
        </h1>
        <p className="text-sm text-ink-500 max-w-sm">
          When you have an active trip — start date set and today falls
          within the trip — it'll open here directly.
        </p>
        <Link
          href="/"
          className="rounded-[10px] bg-gradient-to-br from-amber-400 to-amber-600 text-white text-sm py-2 px-5 font-medium hover:shadow-md mt-2"
        >
          Plan a trip →
        </Link>
      </section>
    </main>
  );
}
```

- [ ] **Step 4: Read ?day= in the trip page and thread initialDay**

Open `web/src/app/trip/[slug]/page.tsx`. Update the function signature to accept `searchParams`:

```tsx
export default async function TripPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ day?: string }>;
}) {
  const { slug } = await params;
  const { day } = await searchParams;
  const initialDay = day ? Number(day) : undefined;
  // ... existing auth + getTrip + getBudget calls

  return <TripView trip={trip} budget={budget} initialDay={Number.isFinite(initialDay) ? initialDay : undefined} />;
}
```

In `web/src/app/trip/[slug]/TripView.tsx`, accept the new prop:

```tsx
export function TripView({
  trip: initial,
  budget,
  initialDay,
}: {
  trip: TripFull;
  budget: Budget | null;
  initialDay?: number;
}) {
  // existing body
```

Pass `initialDay` to BOTH `<TripPanel>` instances (mobile + desktop):

```tsx
<TripPanel
  trip={trip}
  budget={budget}
  initialDay={initialDay}
  onFocusPlaces={setFocusPlaces}
  onRefinePrefill={pushRefinePrefill}
/>
```

In `web/src/components/TripPanel.tsx`, add `initialDay?: number` to the props and forward to `<Itinerary>`:

```tsx
export function TripPanel({
  trip,
  budget,
  readOnly = false,
  initialDay,
  onFocusPlaces,
  onRefinePrefill,
}: {
  trip: TripFull | PublicTrip;
  budget: Budget | null;
  readOnly?: boolean;
  initialDay?: number;
  onFocusPlaces: (places: Place[] | null) => void;
  onRefinePrefill: (text: string) => void;
}) {
  // ...
  // In the JSX where Itinerary is rendered, pass initialDay:
  // <Itinerary days={days} ... initialDay={initialDay} ... />
```

In `web/src/components/Itinerary.tsx`, accept `initialDay`:

```tsx
export function Itinerary({
  days,
  places,
  restaurants,
  destination,
  budget,
  initialDay,
  onFocusPlaces,
  onRefinePrefill,
  onOpenBudgetDay,
}: {
  days: Day[];
  places: Place[];
  restaurants: string[][];
  destination: string;
  budget: Budget | null;
  initialDay?: number;
  onFocusPlaces: (places: Place[] | null) => void;
  onRefinePrefill: (text: string) => void;
  onOpenBudgetDay: (dayNumber: number) => void;
}) {
  const fallback = days[0]?.number ?? 1;
  const seed =
    initialDay !== undefined
      ? Math.min(Math.max(initialDay, 1), days.length || 1)
      : fallback;
  const [activeNum, setActiveNum] = useState<number>(seed);
```

- [ ] **Step 5: Type-check + build**

```bash
cd /Users/viggy/travel-planning/web && npx tsc --noEmit
cd /Users/viggy/travel-planning/web && npm run build
```
Expected: clean. `/today` should appear in the route list.

- [ ] **Step 6: Manual smoke test**

```bash
cd /Users/viggy/travel-planning/web && npm run dev
```

1. Open `localhost:3000` — without an active trip, banner is absent.
2. Open a trip → click `+ Add dates` → set date to today → save → return home.
3. Banner appears on home with "Day 1 of N · destination". Click → opens trip on the right day.
4. Visit `localhost:3000/today` — redirects into the right trip's day.
5. Clear the date in the trip header → banner disappears next visit.
6. Hit `/today` with no active trip → "Nothing scheduled today" page.

- [ ] **Step 7: Commit**

```bash
cd /Users/viggy/travel-planning
git add web/
git commit -m "$(cat <<'EOF'
Add Today view: home banner + /today redirect + ?day= query

When the home page detects an active trip (start_date set and
today within trip range), shows a TodayBanner above the chat input.
Click → opens the trip on the right day via ?day=N query param,
which Itinerary uses to seed its activeNum.

/today is a server-rendered redirect: signed-in + active trip →
/trip/:slug?day=N; signed-in + no active trip → "Nothing today"
page; signed-out → /auth/signin.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase 4 — PWA + Service worker

### Task 6: Icons + manifest

**Files:**
- Create: `web/public/icon-source.svg`
- Create: `scripts/gen-icons.mjs`
- Create: `web/public/icon-192.png` (generated)
- Create: `web/public/icon-512.png` (generated)
- Create: `web/public/manifest.json`

- [ ] **Step 1: Source SVG**

Create `web/public/icon-source.svg`:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="amber" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#fbbf24"/>
      <stop offset="100%" stop-color="#b45309"/>
    </linearGradient>
  </defs>
  <!-- Solid amber background fills full canvas; safe-zone aware so
       Android's adaptive-icon mask (circular crop) keeps the glyph. -->
  <rect width="512" height="512" rx="96" fill="url(#amber)"/>
  <text x="50%" y="54%" text-anchor="middle"
        font-family="Helvetica, Arial, sans-serif"
        font-weight="700" font-size="320" fill="white"
        dominant-baseline="middle">✦</text>
</svg>
```

- [ ] **Step 2: gen-icons script**

Create `scripts/gen-icons.mjs`:

```javascript
#!/usr/bin/env node
// One-time PNG export from web/public/icon-source.svg.
// Re-run if the brand mark changes.
//
// Usage: cd web && npm install --save-dev sharp
//        node ../scripts/gen-icons.mjs

import sharp from "sharp";
import { readFile, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(__dirname, "../web/public/icon-source.svg");

async function render(size) {
  const svg = await readFile(SRC);
  const png = await sharp(svg, { density: 320 })
    .resize(size, size, { fit: "contain", background: { r: 254, g: 249, b: 241, alpha: 1 } })
    .png()
    .toBuffer();
  const out = resolve(__dirname, `../web/public/icon-${size}.png`);
  await writeFile(out, png);
  console.log("wrote", out);
}

await render(192);
await render(512);
```

- [ ] **Step 3: Install sharp + run script**

```bash
cd /Users/viggy/travel-planning/web && npm install --save-dev sharp
cd /Users/viggy/travel-planning && node scripts/gen-icons.mjs
```
Expected: `wrote .../icon-192.png` + `wrote .../icon-512.png`. Two PNGs land in `web/public/`.

- [ ] **Step 4: Manifest**

Create `web/public/manifest.json`:

```json
{
  "name": "Atlas — AI Travel Planner",
  "short_name": "Atlas",
  "description": "Polished AI travel guides, offline-ready.",
  "start_url": "/today",
  "display": "standalone",
  "orientation": "portrait",
  "background_color": "#fef9f1",
  "theme_color": "#b45309",
  "icons": [
    { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any maskable" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any maskable" }
  ]
}
```

- [ ] **Step 5: Commit**

```bash
cd /Users/viggy/travel-planning
git add web/public/icon-source.svg web/public/icon-192.png web/public/icon-512.png web/public/manifest.json scripts/gen-icons.mjs web/package.json web/package-lock.json
git commit -m "$(cat <<'EOF'
Add PWA manifest + icons + one-time gen script

Icons generated from web/public/icon-source.svg via sharp. Re-run
scripts/gen-icons.mjs if the brand mark changes.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Service worker (sw.js)

**Files:**
- Create: `web/public/sw.js`
- Create: `web/src/app/offline/page.tsx`

- [ ] **Step 1: Offline page**

Create `web/src/app/offline/page.tsx`:

```tsx
import Link from "next/link";

import { BrandMark } from "@/components/BrandMark";

export default function OfflinePage() {
  return (
    <main className="min-h-screen flex flex-col">
      <header className="px-6 py-4 flex items-center justify-between">
        <Link href="/" className="contents"><BrandMark /></Link>
      </header>
      <section className="flex-1 flex flex-col items-center justify-center gap-4 px-6 pb-12 text-center">
        <div className="text-amber-600 text-3xl">✦</div>
        <h1 className="font-display text-2xl font-semibold text-ink-900">
          You're offline
        </h1>
        <p className="text-sm text-ink-500 max-w-sm">
          Trips you've opened recently are still readable. Try heading
          back home.
        </p>
        <Link
          href="/"
          className="rounded-[10px] bg-gradient-to-br from-amber-400 to-amber-600 text-white text-sm py-2 px-5 font-medium hover:shadow-md mt-2"
        >
          Home
        </Link>
      </section>
    </main>
  );
}
```

- [ ] **Step 2: Service worker**

Create `web/public/sw.js`:

```javascript
/* Atlas service worker — hand-rolled, no Workbox.
 *
 * Cache buckets are versioned. Bump the version suffix to invalidate
 * everything on the next activation (e.g. shell HTML structure change).
 */

const VERSION = "v1";
const CACHE_SHELL = `atlas-shell-${VERSION}`;
const CACHE_TRIPS = `atlas-trips-${VERSION}`;
const CACHE_TILES = `atlas-tiles-${VERSION}`;
const ALL_CACHES = [CACHE_SHELL, CACHE_TRIPS, CACHE_TILES];

const PRECACHE = ["/", "/today", "/offline", "/manifest.json", "/icon-192.png", "/icon-512.png"];
const TILE_CAP = 1000;
const TILES_HOST = "tiles.openfreemap.org";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_SHELL).then((cache) =>
      // Best-effort precache: missing entries shouldn't block install.
      Promise.allSettled(PRECACHE.map((url) => cache.add(url))),
    ).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(
        names
          .filter((n) => n.startsWith("atlas-") && !ALL_CACHES.includes(n))
          .map((n) => caches.delete(n)),
      ),
    ).then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Never cache mutations — fail fast offline with a synthetic 503.
  if (req.method !== "GET") {
    event.respondWith(
      fetch(req).catch(
        () =>
          new Response(
            JSON.stringify({ detail: "You're offline." }),
            { status: 503, headers: { "Content-Type": "application/json" } },
          ),
      ),
    );
    return;
  }

  // OpenFreeMap tiles → cache-first with LRU cap.
  if (url.host === TILES_HOST) {
    event.respondWith(handleTile(req));
    return;
  }

  // Atlas API GET → network-first, fall back to cache.
  // We treat anything under api.atlas.viggy.dev as the API.
  if (url.host.startsWith("api.atlas.")) {
    event.respondWith(networkFirst(req, CACHE_TRIPS));
    return;
  }

  // Same-origin navigation requests → network-first → cache → /offline.
  if (req.mode === "navigate") {
    event.respondWith(navigationHandler(req));
    return;
  }

  // Same-origin static assets (_next/static, icons, manifest, etc.) →
  // stale-while-revalidate.
  if (url.origin === self.location.origin) {
    event.respondWith(staleWhileRevalidate(req, CACHE_SHELL));
    return;
  }

  // Everything else → network only.
});

async function networkFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const fresh = await fetch(req);
    if (fresh && fresh.ok) cache.put(req, fresh.clone());
    return fresh;
  } catch {
    const cached = await cache.match(req);
    if (cached) return cached;
    return new Response(
      JSON.stringify({ detail: "Offline and not cached." }),
      { status: 504, headers: { "Content-Type": "application/json" } },
    );
  }
}

async function navigationHandler(req) {
  const cache = await caches.open(CACHE_SHELL);
  try {
    const fresh = await fetch(req);
    if (fresh && fresh.ok) cache.put(req, fresh.clone());
    return fresh;
  } catch {
    const cached = await cache.match(req);
    if (cached) return cached;
    const offline = await cache.match("/offline");
    if (offline) return offline;
    return new Response("Offline", { status: 503 });
  }
}

async function staleWhileRevalidate(req, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req);
  const networkPromise = fetch(req)
    .then((res) => {
      if (res && res.ok) cache.put(req, res.clone());
      return res;
    })
    .catch(() => null);
  return cached || (await networkPromise) || new Response("", { status: 504 });
}

async function handleTile(req) {
  const cache = await caches.open(CACHE_TILES);
  const cached = await cache.match(req);
  if (cached) {
    bumpTileLru(req.url);
    return cached;
  }
  try {
    const fresh = await fetch(req);
    if (fresh && fresh.ok) {
      cache.put(req, fresh.clone());
      bumpTileLru(req.url);
      maybeEvictTiles();
    }
    return fresh;
  } catch {
    return new Response("", { status: 504 });
  }
}

// LRU bookkeeping for tiles. Stored in IndexedDB to survive SW restarts.
const LRU_DB = "atlas-tile-meta";
const LRU_STORE = "lru";

function openLru() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(LRU_DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(LRU_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function bumpTileLru(url) {
  try {
    const db = await openLru();
    const tx = db.transaction(LRU_STORE, "readwrite");
    tx.objectStore(LRU_STORE).put(Date.now(), url);
  } catch {
    // LRU is best-effort.
  }
}

let evictionInFlight = false;
async function maybeEvictTiles() {
  if (evictionInFlight) return;
  evictionInFlight = true;
  try {
    const cache = await caches.open(CACHE_TILES);
    const keys = await cache.keys();
    if (keys.length <= TILE_CAP) return;
    const db = await openLru();
    const tx = db.transaction(LRU_STORE, "readonly");
    const store = tx.objectStore(LRU_STORE);
    const all = await new Promise((resolve) => {
      const req = store.getAll();
      const reqKeys = store.getAllKeys();
      Promise.all([
        new Promise((r) => { req.onsuccess = () => r(req.result); }),
        new Promise((r) => { reqKeys.onsuccess = () => r(reqKeys.result); }),
      ]).then(([values, keys]) => resolve(keys.map((k, i) => [k, values[i]])));
    });
    all.sort((a, b) => a[1] - b[1]); // oldest first
    const toEvict = all.slice(0, keys.length - TILE_CAP);
    for (const [url] of toEvict) {
      await cache.delete(url);
      const dx = db.transaction(LRU_STORE, "readwrite");
      dx.objectStore(LRU_STORE).delete(url);
    }
  } catch {
    // best effort
  } finally {
    evictionInFlight = false;
  }
}

// ── Active-trip pre-cache, driven by postMessage from the home page. ─────
self.addEventListener("message", (event) => {
  const data = event.data;
  if (!data || data.type !== "precache-trip") return;
  event.waitUntil(precacheTrip(data));
});

async function precacheTrip({ slug, apiBase, bbox }) {
  if (!slug || !apiBase) return;
  const cache = await caches.open(CACHE_TRIPS);
  await Promise.allSettled([
    fetchAndCache(`${apiBase}/trips/${slug}`, cache),
    fetchAndCache(`${apiBase}/trips/${slug}/budget`, cache),
  ]);
  if (!bbox) return;

  // Fetch the style JSON to extract the tile URL template.
  const styleUrl = "https://tiles.openfreemap.org/styles/positron";
  let style;
  try {
    const r = await fetch(styleUrl);
    if (r.ok) {
      const tilesCache = await caches.open(CACHE_TILES);
      tilesCache.put(styleUrl, r.clone());
      style = await r.json();
    }
  } catch { /* skip */ }
  if (!style || !style.sources) return;

  const tileUrls = [];
  for (const src of Object.values(style.sources)) {
    for (const t of src.tiles || []) tileUrls.push(t);
  }
  if (tileUrls.length === 0) return;

  // Cap pre-fetch tiles per trip.
  const MAX_PREFETCH = 250;
  const targets = [];
  outer: for (const z of [11, 12, 13, 14]) {
    const [x0, y0, x1, y1] = bboxToTileRange(bbox, z);
    for (let x = x0; x <= x1; x++) {
      for (let y = y0; y <= y1; y++) {
        if (targets.length >= MAX_PREFETCH) break outer;
        for (const tmpl of tileUrls) {
          targets.push(
            tmpl.replace("{z}", z).replace("{x}", x).replace("{y}", y),
          );
        }
      }
    }
  }
  const tilesCache = await caches.open(CACHE_TILES);
  await Promise.allSettled(
    targets.map((u) => fetchAndCache(u, tilesCache).then(() => bumpTileLru(u))),
  );
  maybeEvictTiles();
}

async function fetchAndCache(url, cache) {
  try {
    const r = await fetch(url);
    if (r && (r.ok || r.status === 404)) {
      // 404 is fine for /budget on trips with no budget.
      if (r.ok) cache.put(url, r.clone());
    }
  } catch { /* swallow */ }
}

function bboxToTileRange(bbox, z) {
  const [minLng, minLat, maxLng, maxLat] = bbox;
  return [
    lngToTileX(minLng, z),
    latToTileY(maxLat, z),
    lngToTileX(maxLng, z),
    latToTileY(minLat, z),
  ];
}
function lngToTileX(lng, z) {
  return Math.floor(((lng + 180) / 360) * Math.pow(2, z));
}
function latToTileY(lat, z) {
  const r = (lat * Math.PI) / 180;
  return Math.floor(
    ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) *
      Math.pow(2, z),
  );
}
```

- [ ] **Step 3: Build (verify nothing breaks)**

```bash
cd /Users/viggy/travel-planning/web && npm run build
```
Expected: clean. `/offline` route appears.

- [ ] **Step 4: Commit**

```bash
cd /Users/viggy/travel-planning
git add web/public/sw.js web/src/app/offline/page.tsx
git commit -m "$(cat <<'EOF'
Add hand-rolled service worker + offline page

Three versioned cache buckets (shell / trips / tiles). Network-first
for navigations and the Atlas API; stale-while-revalidate for static
assets; cache-first with LRU eviction for OpenFreeMap tiles. POST/
PUT/PATCH/DELETE never cached — synth 503 when offline.

Listens for {type:"precache-trip", slug, apiBase, bbox} messages from
the home page; fetches the trip JSON, budget, MapLibre style, and
trip-area tiles (zoom 11-14, capped at 250 tiles per trip).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: ServiceWorkerRegister + ActiveTripPrecache + layout meta + AGENTS.md gotcha

**Files:**
- Create: `web/src/components/ServiceWorkerRegister.tsx`
- Create: `web/src/components/ActiveTripPrecache.tsx`
- Modify: `web/src/app/layout.tsx`
- Modify: `web/src/app/page.tsx`
- Modify: `web/AGENTS.md`

- [ ] **Step 1: ServiceWorkerRegister**

Create `web/src/components/ServiceWorkerRegister.tsx`:

```tsx
"use client";

import { useEffect } from "react";

export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    if (window.location.hostname === "localhost") {
      // SW caching makes Next dev rebuilds confusing. Opt out on localhost.
      navigator.serviceWorker.getRegistrations().then((regs) => {
        for (const r of regs) r.unregister();
      });
      return;
    }
    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .catch((e) => console.warn("SW register failed", e));
  }, []);
  return null;
}
```

- [ ] **Step 2: ActiveTripPrecache**

Create `web/src/components/ActiveTripPrecache.tsx`:

```tsx
"use client";

import { useEffect, useRef } from "react";

import { getTrip } from "@/lib/api";
import { getBrowserToken } from "@/lib/auth.browser";
import { bboxFromPlaces } from "@/lib/active-trip";

export function ActiveTripPrecache({ slug }: { slug: string }) {
  const sentRef = useRef<string | null>(null);

  useEffect(() => {
    if (typeof navigator === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    if (sentRef.current === slug) return;

    let cancelled = false;
    (async () => {
      // Wait until the SW has a controller (can happen on first load).
      const reg = await navigator.serviceWorker.ready.catch(() => null);
      if (!reg || cancelled) return;
      const controller = navigator.serviceWorker.controller;
      if (!controller) return;

      // We need the trip's places to build a bbox. Fetch the trip
      // (this also warms its cache entry as a side effect).
      const token = await getBrowserToken();
      if (!token || cancelled) return;
      const trip = await getTrip(slug, token).catch(() => null);
      if (!trip || cancelled) return;

      const bbox = bboxFromPlaces(trip.document.places);
      controller.postMessage({
        type: "precache-trip",
        slug,
        apiBase: process.env.NEXT_PUBLIC_API_BASE,
        bbox,
      });
      sentRef.current = slug;
    })();

    return () => { cancelled = true; };
  }, [slug]);

  return null;
}
```

- [ ] **Step 3: Wire into root layout**

Open `web/src/app/layout.tsx`. Replace contents with:

```tsx
import type { Metadata, Viewport } from "next";
import "./globals.css";

import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";

export const metadata: Metadata = {
  title: "Atlas — your travel companion",
  description: "Plan trips with AI. Map first. Offline-ready.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    title: "Atlas",
    statusBarStyle: "default",
  },
  icons: {
    apple: [{ url: "/icon-192.png", sizes: "192x192" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#b45309",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
```

- [ ] **Step 4: Mount ActiveTripPrecache on the home page**

Open `web/src/app/page.tsx`. Add the import:

```tsx
import { ActiveTripPrecache } from "@/components/ActiveTripPrecache";
```

In the JSX, alongside the `TodayBanner` (when `active !== null`), mount the precache component:

```tsx
        {active && (
          <>
            <TodayBanner active={active} />
            <ActiveTripPrecache slug={active.trip.slug} />
          </>
        )}
```

- [ ] **Step 5: AGENTS.md gotchas**

Open `web/AGENTS.md`. Append to the existing `# Web Gotchas` section:

```markdown
- **Service worker is opted out on localhost.** `ServiceWorkerRegister` unregisters any existing SW on `localhost` because SW caching wrecks Next dev rebuilds. Test the SW with a Vercel preview / production build, not `npm run dev`.
- **`navigator.serviceWorker.controller` is null on first load.** A page that wants to send a `postMessage` to the SW (e.g. `ActiveTripPrecache`) must `await navigator.serviceWorker.ready` AND check that `controller` is not null. The pre-cache will run on the next visit instead.
- **Bumping `VERSION` in `sw.js` invalidates all caches on next activation.** Use this when the cache shape changes (e.g. new strategy, schema-incompatible cached payload).
```

- [ ] **Step 6: Build + manual smoke (production build)**

```bash
cd /Users/viggy/travel-planning/web && npm run build && npm run start
```

In another terminal, open `localhost:3000` (note: `npm start` runs the production build — SW WILL register here, but `ServiceWorkerRegister` opts out on localhost specifically. Test SW on the Vercel preview after push.)

Verify the build is clean and shows the `/today`, `/offline`, `/s/[token]`, `/profile`, `/trip/[slug]` routes.

- [ ] **Step 7: Commit**

```bash
cd /Users/viggy/travel-planning
git add web/src/components/ServiceWorkerRegister.tsx web/src/components/ActiveTripPrecache.tsx web/src/app/layout.tsx web/src/app/page.tsx web/AGENTS.md
git commit -m "$(cat <<'EOF'
Register service worker + active-trip pre-cache + PWA layout meta

Root layout exposes the manifest, theme colour, and Apple PWA meta
so iOS Add-to-Home-Screen works. ServiceWorkerRegister installs
/sw.js on production hosts only (skips localhost to avoid dev
caching pain). ActiveTripPrecache fires postMessage to the SW with
the active trip's bbox so the trip data + map tiles are ready for
the airport / plane scenario.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase 5 — Deploy

### Task 9: Deploy backend + verify end-to-end

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

- [ ] **Step 4: Smoke test on https://atlas.viggy.dev (desktop)**

1. Open the site → DevTools → Application → Manifest: confirm Atlas appears.
2. DevTools → Application → Service Workers: confirm `/sw.js` is activated.
3. Open an existing trip → click `+ Add dates` → set today's date → save.
4. Return home → Today banner appears.
5. Click banner → opens trip on Day 1.
6. DevTools → Application → Cache storage: see `atlas-shell-v1`, `atlas-trips-v1`, `atlas-tiles-v1`.
7. DevTools → Network → "Offline" → reload — trip page still loads from cache.

- [ ] **Step 5: Smoke test on mobile**

1. Open `https://atlas.viggy.dev` in Chrome Android or Safari iOS.
2. Add to Home Screen (browser menu).
3. Launch from home screen — opens standalone, no browser chrome.
4. With airplane mode ON, opening Atlas → /today → if active trip set today, it loads with map tiles visible (cached).

- [ ] **Step 6: Done**

No commit — deploy is a side effect.

---

## Self-review

**1. Spec coverage**

| Spec section                             | Implemented in |
| ---                                      | --- |
| TripSummary.start_date                   | Task 1 |
| PATCH /trips/:slug                       | Task 2 |
| Frontend types update + patchTrip        | Task 3 step 1-2 |
| TripDateEdit component                   | Task 3 step 3-4 |
| findActiveTrip + bboxFromPlaces          | Task 4 |
| TodayBanner                              | Task 5 step 1-2 |
| /today route                             | Task 5 step 3 |
| ?day= query param threading              | Task 5 step 4 |
| Manifest + icons + gen script            | Task 6 |
| Hand-rolled service worker               | Task 7 |
| Offline page                             | Task 7 step 1 |
| ServiceWorkerRegister                    | Task 8 step 1 |
| ActiveTripPrecache                       | Task 8 step 2 |
| Layout meta (manifest link, Apple meta)  | Task 8 step 3 |
| Banner + precache wiring on home         | Task 8 step 4 |
| AGENTS.md gotchas                        | Task 8 step 5 |
| Deploy + verify                          | Task 9 |

**2. Placeholder scan** — no TBDs / TODOs. Tasks that touch existing files (Task 5 step 4 in trip page, page.tsx, TripPanel, Itinerary) name the precise insertion site and the prop signature; the implementer needs to read each file once but not guess at structure.

**3. Type consistency**
- `TripSummary.start_date: string | null` (TS) ↔ `start_date: date | None` (Pydantic) ↔ `start_date date` (Postgres column).
- `ActiveTrip` shape consistent across active-trip.ts, TodayBanner, /today page.
- `findActiveTrip` returns 1-indexed `dayNumber`; `?day=` query and `Itinerary.initialDay` are also 1-indexed.
- SW message shape `{type, slug, apiBase, bbox}` consistent between `ActiveTripPrecache.tsx` postMessage and `sw.js` message handler.
- `bboxFromPlaces` returns `[minLng, minLat, maxLng, maxLat]` matching the SW's `bboxToTileRange` signature.

**4. Out-of-scope items deferred** — no background sync, no push notifications, no per-day pre-cache, no install prompt UI, no settings page for cache management, no clear-on-signout. All matched the spec.
