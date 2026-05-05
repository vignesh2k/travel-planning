# Atlas V2.5 Travel Desk Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the V2.5 travel-desk core: visible trip command center, plan health, item statuses, inline itinerary editing/reordering, export-studio polish, and home-screen product signal.

**Architecture:** Keep the existing Supabase schema and extend `trips.document` JSON with optional `planning` metadata. Put business logic in pure frontend helpers (`trip-health.ts`, `itinerary-editing.ts`, `planning-status.ts`) with Node tests, add a narrow authenticated document patch route, then compose focused UI components into `TripPanel` and `Itinerary`.

**Tech Stack:** FastAPI + Pydantic + Supabase service client; Next.js 16 / React 19; TypeScript strict mode; existing Tailwind utility classes; Node built-in test runner for pure TypeScript helper tests; existing pytest suite for API tests.

---

## File Structure

- Create `api/tests/test_routes_trip_document.py`
  - Tests authenticated document patching, owner enforcement, and legacy document compatibility.
- Modify `api/api/models.py`
  - Adds optional `planning` metadata models to `TripDocument`.
- Modify `api/api/routes/trips.py`
  - Adds `PATCH /trips/{slug}/document` for structured itinerary/planning updates.
- Modify `web/src/lib/types.ts`
  - Mirrors optional planning metadata and planning statuses.
- Modify `web/src/lib/api.ts`
  - Adds `patchTripDocument(slug, document, token)`.
- Create `web/src/lib/planning-status.ts`
  - Labels, colours, and summary helpers for item statuses.
- Create `web/src/lib/planning-status.test.ts`
  - Tests labels and outstanding booking summary.
- Create `web/src/lib/trip-health.ts`
  - Pure health-check derivation from trip document + budget.
- Create `web/src/lib/trip-health.test.ts`
  - Tests missing map pins, long hops, missing food, missing budget, and dismissal.
- Create `web/src/lib/itinerary-editing.ts`
  - Immutable day title/activity edit, add, delete, move, and stable row-id helpers.
- Create `web/src/lib/itinerary-editing.test.ts`
  - Tests edit/reorder helpers and row id fallback.
- Create `web/src/components/StatusChip.tsx`
  - Compact status display/control.
- Create `web/src/components/PlanHealthPanel.tsx`
  - Health checklist popover/panel.
- Create `web/src/components/TripDeskHeader.tsx`
  - Command-center header inside trip panel.
- Create `web/src/components/SampleOutputStrip.tsx`
  - Home-screen mini product preview.
- Modify `web/src/components/TripPanel.tsx`
  - Owns editable trip document state, save status, planning metadata updates, and header/panel composition.
- Modify `web/src/components/Itinerary.tsx`
  - Adds read/edit mode, inline title/activity editing, add/delete/move controls, status controls, targeted prompt preview controls.
- Modify `web/src/components/PdfExportMenu.tsx`
  - Adds style choices and staged-card language while preserving the existing PDF build endpoint.
- Modify `web/src/app/trip/[slug]/TripView.tsx`
  - Widen desktop panel, accept updated trip data from `TripPanel`, reduce global header competition.
- Modify `web/src/app/page.tsx`
  - Adds `SampleOutputStrip` below the main input on larger screens.

---

## Task 1: Backend Document Patch Route

**Files:**
- Modify: `api/api/models.py`
- Modify: `api/api/routes/trips.py`
- Test: `api/tests/test_routes_trip_document.py`

- [ ] **Step 1: Write failing tests for document patching**

Create `api/tests/test_routes_trip_document.py`:

```python
from fastapi.testclient import TestClient

from api.main import app


def auth_header() -> dict[str, str]:
    return {"Authorization": "Bearer test-token"}


def test_patch_trip_document_updates_owned_trip(monkeypatch):
    stored = {
        "id": "trip-1",
        "slug": "kyoto-3d-abc123",
        "user_id": "user-1",
        "destination": "Kyoto",
        "days": 3,
        "travel_style": "",
        "start_date": None,
        "airport_entry": None,
        "airport_exit": None,
        "centroid_lat": None,
        "centroid_lng": None,
        "created_at": "2026-05-05T12:00:00Z",
        "share_token": None,
        "is_saved": True,
        "document": {
            "document_markdown": "## Kyoto",
            "places": [],
            "neighborhoods": [],
            "restaurants": [],
            "itinerary": [
                {
                    "number": 1,
                    "title": "Old Town",
                    "bullets": [
                        {"time": "Morning", "items": ["Walk Gion"]}
                    ],
                }
            ],
        },
    }

    class Query:
        def __init__(self):
            self.mode = "select"

        def select(self, *_args):
            self.mode = "select"
            return self

        def update(self, payload):
            self.mode = "update"
            stored.update(payload)
            return self

        def eq(self, *_args):
            return self

        def single(self):
            return self

        def execute(self):
            return type("Result", (), {"data": stored if self.mode == "select" else [stored]})()

    class DB:
        def table(self, _name):
            return Query()

    monkeypatch.setattr("api.routes.trips.service_client", lambda: DB())
    monkeypatch.setattr("api.auth.verify_token", lambda _token: {"sub": "user-1"})

    updated_document = {
        **stored["document"],
        "itinerary": [
            {
                "number": 1,
                "title": "Edited Old Town",
                "bullets": [
                    {"time": "Morning", "items": ["Walk Gion", "Coffee in Higashiyama"]}
                ],
            }
        ],
        "planning": {
            "item_statuses": {
                "day-1-morning-0": {
                    "status": "booked",
                    "updated_at": "2026-05-05T12:01:00Z",
                }
            },
            "dismissed_health_checks": ["budget-missing"],
            "last_major_edit_at": "2026-05-05T12:01:00Z",
        },
    }

    client = TestClient(app)
    res = client.patch(
        "/trips/kyoto-3d-abc123/document",
        json={"document": updated_document},
        headers=auth_header(),
    )

    assert res.status_code == 200
    body = res.json()
    assert body["document"]["itinerary"][0]["title"] == "Edited Old Town"
    assert body["document"]["planning"]["item_statuses"]["day-1-morning-0"]["status"] == "booked"


def test_patch_trip_document_rejects_non_owner(monkeypatch):
    stored = {
        "id": "trip-1",
        "slug": "kyoto-3d-abc123",
        "user_id": "someone-else",
        "destination": "Kyoto",
        "days": 3,
        "travel_style": "",
        "start_date": None,
        "airport_entry": None,
        "airport_exit": None,
        "centroid_lat": None,
        "centroid_lng": None,
        "created_at": "2026-05-05T12:00:00Z",
        "share_token": None,
        "is_saved": True,
        "document": {
            "document_markdown": "## Kyoto",
            "places": [],
            "neighborhoods": [],
            "restaurants": [],
            "itinerary": [],
        },
    }

    class Query:
        def select(self, *_args): return self
        def eq(self, *_args): return self
        def single(self): return self
        def execute(self): return type("Result", (), {"data": stored})()

    class DB:
        def table(self, _name): return Query()

    monkeypatch.setattr("api.routes.trips.service_client", lambda: DB())
    monkeypatch.setattr("api.auth.verify_token", lambda _token: {"sub": "user-1"})

    client = TestClient(app)
    res = client.patch(
        "/trips/kyoto-3d-abc123/document",
        json={"document": stored["document"]},
        headers=auth_header(),
    )

    assert res.status_code == 403
```

- [ ] **Step 2: Run tests to verify failure**

Run: `cd api && .venv/bin/python -m pytest tests/test_routes_trip_document.py -q`

Expected: FAIL with `404 Not Found` because `/trips/{slug}/document` does not exist.

- [ ] **Step 3: Add planning metadata models**

In `api/api/models.py`, add these models near `TripDocument`:

```python
class PlanningStatus(BaseModel):
    status: Literal["idea", "maybe", "booked", "paid", "skip", "needs_booking"]
    note: str | None = None
    updated_at: datetime


class TripPlanning(BaseModel):
    item_statuses: dict[str, PlanningStatus] = Field(default_factory=dict)
    dismissed_health_checks: list[str] = Field(default_factory=list)
    last_pdf_generated_at: datetime | None = None
    last_major_edit_at: datetime | None = None
```

Then add `planning` to `TripDocument`:

```python
class TripDocument(BaseModel):
    document_markdown: str
    places: list[Place]
    neighborhoods: list[Neighborhood] = []
    restaurants: list[list[str]] = []
    itinerary: list[ItineraryDay] = []
    planning: TripPlanning | None = None
```

Also add this request body model near `TripPatch`:

```python
class TripDocumentPatch(BaseModel):
    document: TripDocument
```

- [ ] **Step 4: Add document patch route**

In `api/api/routes/trips.py`, import `TripDocumentPatch`, then add:

```python
@router.patch("/trips/{slug}/document", response_model=TripFull)
def patch_trip_document(slug: str, body: TripDocumentPatch, user: CurrentUser) -> TripFull:
    db = service_client()
    res = db.table("trips").select("*").eq("slug", slug).single().execute()
    if not res or not res.data:
        raise HTTPException(status_code=404, detail="Trip not found")
    if res.data["user_id"] != user["sub"]:
        raise HTTPException(status_code=403, detail="Not your trip")

    update = db.table("trips").update(
        {"document": body.document.model_dump(mode="json")}
    ).eq("slug", slug).execute()
    if not update.data:
        raise HTTPException(status_code=500, detail="update returned no row")

    row = update.data[0]
    inserted_data = {**row}
    doc_dict = inserted_data.pop("document")
    return TripFull(**inserted_data, document=TripDocument(**doc_dict))
```

- [ ] **Step 5: Verify route tests pass**

Run: `cd api && .venv/bin/python -m pytest tests/test_routes_trip_document.py -q`

Expected: PASS.

- [ ] **Step 6: Verify existing API tests**

Run: `cd api && .venv/bin/python -m pytest tests/test_models.py tests/test_routes_trips.py tests/test_routes_public.py -q`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add api/api/models.py api/api/routes/trips.py api/tests/test_routes_trip_document.py
git commit -m "Add trip document patch route"
```

## Task 2: Planning Status Helper

**Files:**
- Create: `web/src/lib/planning-status.ts`
- Test: `web/src/lib/planning-status.test.ts`
- Modify: `web/src/lib/types.ts`

- [ ] **Step 1: Write failing tests**

Create `web/src/lib/planning-status.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";

import {
  PLANNING_STATUS_META,
  countNeedsBooking,
  nextPlanningStatus,
} from "./planning-status.ts";
import type { TripPlanning } from "./types.ts";

test("status metadata exposes user-facing labels", () => {
  assert.equal(PLANNING_STATUS_META.needs_booking.label, "Needs booking");
  assert.equal(PLANNING_STATUS_META.booked.tone, "green");
});

test("countNeedsBooking counts only active needs-booking items", () => {
  const planning: TripPlanning = {
    item_statuses: {
      a: { status: "needs_booking", updated_at: "2026-05-05T12:00:00Z" },
      b: { status: "booked", updated_at: "2026-05-05T12:00:00Z" },
      c: { status: "needs_booking", updated_at: "2026-05-05T12:00:00Z" },
    },
  };

  assert.equal(countNeedsBooking(planning), 2);
});

test("nextPlanningStatus cycles through common planning states", () => {
  assert.equal(nextPlanningStatus(undefined), "needs_booking");
  assert.equal(nextPlanningStatus("needs_booking"), "booked");
  assert.equal(nextPlanningStatus("booked"), "paid");
  assert.equal(nextPlanningStatus("paid"), "skip");
  assert.equal(nextPlanningStatus("skip"), "idea");
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `cd web && node --experimental-strip-types --test src/lib/planning-status.test.ts`

Expected: FAIL with module not found.

- [ ] **Step 3: Add planning types**

In `web/src/lib/types.ts`, add:

```ts
export type PlanningStatusValue = "idea" | "maybe" | "booked" | "paid" | "skip" | "needs_booking";

export interface PlanningStatus {
  status: PlanningStatusValue;
  note?: string | null;
  updated_at: string;
}

export interface TripPlanning {
  item_statuses?: Record<string, PlanningStatus>;
  dismissed_health_checks?: string[];
  last_pdf_generated_at?: string | null;
  last_major_edit_at?: string | null;
}
```

Then add `planning?: TripPlanning | null;` to `TripDocument`.

- [ ] **Step 4: Add status helper**

Create `web/src/lib/planning-status.ts`:

```ts
import type { PlanningStatusValue, TripPlanning } from "./types";

export type StatusTone = "grey" | "amber" | "green" | "red" | "ink";

export const PLANNING_STATUS_META: Record<
  PlanningStatusValue,
  { label: string; tone: StatusTone }
> = {
  idea: { label: "Idea", tone: "grey" },
  maybe: { label: "Maybe", tone: "amber" },
  needs_booking: { label: "Needs booking", tone: "red" },
  booked: { label: "Booked", tone: "green" },
  paid: { label: "Paid", tone: "ink" },
  skip: { label: "Skip", tone: "grey" },
};

const CYCLE: (PlanningStatusValue | undefined)[] = [
  undefined,
  "needs_booking",
  "booked",
  "paid",
  "skip",
  "idea",
  "maybe",
];

export function countNeedsBooking(planning?: TripPlanning | null): number {
  return Object.values(planning?.item_statuses ?? {}).filter(
    (item) => item.status === "needs_booking",
  ).length;
}

export function nextPlanningStatus(
  current: PlanningStatusValue | undefined,
): PlanningStatusValue {
  const idx = CYCLE.indexOf(current);
  return CYCLE[(idx + 1) % CYCLE.length] ?? "needs_booking";
}
```

- [ ] **Step 5: Verify tests pass**

Run: `cd web && node --experimental-strip-types --test src/lib/planning-status.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add web/src/lib/types.ts web/src/lib/planning-status.ts web/src/lib/planning-status.test.ts
git commit -m "Add planning status helper"
```

## Task 3: Trip Health Engine

**Files:**
- Create: `web/src/lib/trip-health.ts`
- Test: `web/src/lib/trip-health.test.ts`

- [ ] **Step 1: Write failing tests**

Create `web/src/lib/trip-health.test.ts` with tests for five checks:

```ts
import assert from "node:assert/strict";
import test from "node:test";

import { deriveTripHealth } from "./trip-health.ts";
import type { Budget, TripDocument } from "./types.ts";

const document: TripDocument = {
  document_markdown: "## Test",
  places: [
    { name: "Airport", category: "logistics", description: "", lat: 51.47, lng: -0.45 },
    { name: "Old Town", category: "neighbourhood", description: "", lat: 41.89, lng: 12.49 },
  ],
  neighborhoods: [],
  restaurants: [],
  itinerary: [
    {
      number: 1,
      title: "Arrival",
      bullets: [
        { time: "Morning", items: ["Land at Airport", "Walk Old Town", "Visit Missing Museum"] },
        { time: "Afternoon", items: [] },
        { time: "Evening", items: [] },
      ],
    },
    {
      number: 2,
      title: "Sparse",
      bullets: [
        { time: "Morning", items: ["Relax"] },
        { time: "Afternoon", items: [] },
        { time: "Evening", items: [] },
      ],
    },
  ],
};

test("deriveTripHealth surfaces useful checks", () => {
  const checks = deriveTripHealth(document, null);
  const ids = checks.map((c) => c.id);

  assert.ok(ids.includes("budget-missing"));
  assert.ok(ids.includes("food-coverage-light"));
  assert.ok(ids.includes("day-2-no-map-pins"));
  assert.ok(ids.includes("possible-missing-pins"));
  assert.ok(ids.includes("day-1-long-hop"));
});

test("deriveTripHealth respects dismissed checks", () => {
  const checks = deriveTripHealth(
    {
      ...document,
      planning: { dismissed_health_checks: ["budget-missing"] },
    },
    null,
  );

  assert.equal(checks.some((c) => c.id === "budget-missing"), false);
});

test("deriveTripHealth omits budget warning when budget exists", () => {
  const budget: Budget = {
    trip_id: "trip-1",
    currency: "EUR",
    gbp_rate: 0.86,
    gbp_rate_date: "2026-05-05",
    days: [],
    updated_at: "2026-05-05T12:00:00Z",
  };

  const checks = deriveTripHealth(document, budget);
  assert.equal(checks.some((c) => c.id === "budget-missing"), false);
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `cd web && node --experimental-strip-types --test src/lib/trip-health.test.ts`

Expected: FAIL with module not found.

- [ ] **Step 3: Implement `deriveTripHealth`**

Create `web/src/lib/trip-health.ts`:

```ts
import { placeForText, placesForDay } from "./trip-insights";
import type { Budget, ItineraryDay, Place, TripDocument } from "./types";

export type HealthSeverity = "info" | "warning" | "important";

export interface TripHealthCheck {
  id: string;
  severity: HealthSeverity;
  title: string;
  detail: string;
  action?: "plan" | "stay" | "money" | "export";
  dayNumber?: number;
}

function distanceKm(a: Place, b: Place): number | null {
  if (a.lat === null || a.lng === null || b.lat === null || b.lng === null) return null;
  const r = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(h));
}

function dayText(day: ItineraryDay): string {
  return `${day.title} ${day.bullets.flatMap((b) => b.items).join(" ")}`.toLowerCase();
}

export function deriveTripHealth(
  document: TripDocument,
  budget: Budget | null,
): TripHealthCheck[] {
  const dismissed = new Set(document.planning?.dismissed_health_checks ?? []);
  const checks: TripHealthCheck[] = [];
  const add = (check: TripHealthCheck) => {
    if (!dismissed.has(check.id)) checks.push(check);
  };

  if (!budget) {
    add({
      id: "budget-missing",
      severity: "warning",
      title: "Budget not generated",
      detail: "Money tracking is empty, so the guide cannot judge cost confidence yet.",
      action: "money",
    });
  }

  if ((document.restaurants ?? []).length < 3) {
    add({
      id: "food-coverage-light",
      severity: "info",
      title: "Food coverage is light",
      detail: "Add a few restaurant anchors so each day has nearby options.",
      action: "plan",
    });
  }

  let possibleMissingPins = 0;
  for (const day of document.itinerary ?? []) {
    const dayPlaces = placesForDay(day, document.places);
    if (dayPlaces.length === 0) {
      add({
        id: `day-${day.number}-no-map-pins`,
        severity: "warning",
        title: `Day ${day.number} has no mapped stops`,
        detail: "The map route cannot draw until at least one activity matches a place pin.",
        action: "plan",
        dayNumber: day.number,
      });
    }

    const text = dayText(day);
    for (const token of ["museum", "station", "airport", "hotel", "restaurant", "beach"]) {
      if (text.includes(token)) {
        const matched = day.bullets.some((group) =>
          group.items.some((item) => placeForText(item, document.places)),
        );
        if (!matched) possibleMissingPins += 1;
      }
    }

    for (let i = 1; i < dayPlaces.length; i += 1) {
      const km = distanceKm(dayPlaces[i - 1], dayPlaces[i]);
      if (km !== null && km > 35) {
        add({
          id: `day-${day.number}-long-hop`,
          severity: "important",
          title: `Day ${day.number} has a long hop`,
          detail: "Two mapped stops are far apart; check transport time before relying on this pacing.",
          action: "plan",
          dayNumber: day.number,
        });
        break;
      }
    }
  }

  if (possibleMissingPins > 0) {
    add({
      id: "possible-missing-pins",
      severity: "info",
      title: "Some named places may need pins",
      detail: "A few activities mention place-like words that are not currently matched to map pins.",
      action: "plan",
    });
  }

  if (!document.neighborhoods || document.neighborhoods.length === 0) {
    add({
      id: "stays-not-loaded",
      severity: "info",
      title: "Stay options not loaded",
      detail: "Open Stay to add neighbourhood and hotel anchors.",
      action: "stay",
    });
  }

  if (document.planning?.last_major_edit_at && !document.planning?.last_pdf_generated_at) {
    add({
      id: "pdf-stale-after-edit",
      severity: "warning",
      title: "PDF not rebuilt after edits",
      detail: "Regenerate the guide so the export matches the latest itinerary.",
      action: "export",
    });
  }

  return checks;
}
```

- [ ] **Step 4: Verify tests pass**

Run: `cd web && node --experimental-strip-types --test src/lib/trip-health.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/trip-health.ts web/src/lib/trip-health.test.ts
git commit -m "Add trip health checks"
```

## Task 4: Itinerary Editing Helpers

**Files:**
- Create: `web/src/lib/itinerary-editing.ts`
- Test: `web/src/lib/itinerary-editing.test.ts`

- [ ] **Step 1: Write failing tests**

Create `web/src/lib/itinerary-editing.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";

import {
  activityKey,
  addActivity,
  deleteActivity,
  editActivity,
  editDayTitle,
  moveActivity,
} from "./itinerary-editing.ts";
import type { ItineraryDay } from "./types.ts";

const days: ItineraryDay[] = [
  {
    number: 1,
    title: "Old title",
    bullets: [
      { time: "Morning", items: ["A", "B"] },
      { time: "Afternoon", items: ["C"] },
      { time: "Evening", items: [] },
    ],
  },
];

test("editDayTitle updates one day immutably", () => {
  const out = editDayTitle(days, 1, "New title");
  assert.equal(out[0].title, "New title");
  assert.equal(days[0].title, "Old title");
});

test("editActivity updates one activity", () => {
  const out = editActivity(days, 1, "Morning", 1, "Edited");
  assert.deepEqual(out[0].bullets[0].items, ["A", "Edited"]);
});

test("addActivity and deleteActivity update group items", () => {
  const added = addActivity(days, 1, "Evening", "Dinner");
  assert.deepEqual(added[0].bullets[2].items, ["Dinner"]);
  const deleted = deleteActivity(added, 1, "Evening", 0);
  assert.deepEqual(deleted[0].bullets[2].items, []);
});

test("moveActivity moves within and across groups", () => {
  const within = moveActivity(days, 1, "Morning", 1, "Morning", 0);
  assert.deepEqual(within[0].bullets[0].items, ["B", "A"]);

  const across = moveActivity(days, 1, "Morning", 0, "Afternoon", 1);
  assert.deepEqual(across[0].bullets[0].items, ["B"]);
  assert.deepEqual(across[0].bullets[1].items, ["C", "A"]);
});

test("activityKey returns stable fallback id", () => {
  assert.equal(activityKey(2, "Morning", 3), "day-2-morning-3");
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `cd web && node --experimental-strip-types --test src/lib/itinerary-editing.test.ts`

Expected: FAIL with module not found.

- [ ] **Step 3: Implement helpers**

Create `web/src/lib/itinerary-editing.ts`:

```ts
import type { ItineraryBulletGroup, ItineraryDay } from "./types";

type TimeOfDay = ItineraryBulletGroup["time"];

function cloneDays(days: ItineraryDay[]): ItineraryDay[] {
  return days.map((day) => ({
    ...day,
    bullets: day.bullets.map((group) => ({ ...group, items: [...group.items] })),
  }));
}

function groupFor(day: ItineraryDay, time: TimeOfDay): ItineraryBulletGroup {
  let group = day.bullets.find((g) => g.time === time);
  if (!group) {
    group = { time, items: [] };
    day.bullets.push(group);
  }
  return group;
}

export function activityKey(dayNumber: number, time: TimeOfDay, index: number): string {
  return `day-${dayNumber}-${time.toLowerCase()}-${index}`;
}

export function editDayTitle(days: ItineraryDay[], dayNumber: number, title: string): ItineraryDay[] {
  return cloneDays(days).map((day) => day.number === dayNumber ? { ...day, title } : day);
}

export function editActivity(
  days: ItineraryDay[],
  dayNumber: number,
  time: TimeOfDay,
  index: number,
  text: string,
): ItineraryDay[] {
  const out = cloneDays(days);
  const day = out.find((d) => d.number === dayNumber);
  if (!day) return out;
  const group = groupFor(day, time);
  if (index < 0 || index >= group.items.length) return out;
  group.items[index] = text;
  return out;
}

export function addActivity(
  days: ItineraryDay[],
  dayNumber: number,
  time: TimeOfDay,
  text: string,
): ItineraryDay[] {
  const out = cloneDays(days);
  const day = out.find((d) => d.number === dayNumber);
  if (!day) return out;
  groupFor(day, time).items.push(text);
  return out;
}

export function deleteActivity(
  days: ItineraryDay[],
  dayNumber: number,
  time: TimeOfDay,
  index: number,
): ItineraryDay[] {
  const out = cloneDays(days);
  const day = out.find((d) => d.number === dayNumber);
  if (!day) return out;
  groupFor(day, time).items.splice(index, 1);
  return out;
}

export function moveActivity(
  days: ItineraryDay[],
  dayNumber: number,
  fromTime: TimeOfDay,
  fromIndex: number,
  toTime: TimeOfDay,
  toIndex: number,
): ItineraryDay[] {
  const out = cloneDays(days);
  const day = out.find((d) => d.number === dayNumber);
  if (!day) return out;
  const from = groupFor(day, fromTime);
  const to = groupFor(day, toTime);
  const [item] = from.items.splice(fromIndex, 1);
  if (!item) return out;
  const bounded = Math.max(0, Math.min(toIndex, to.items.length));
  to.items.splice(bounded, 0, item);
  return out;
}
```

- [ ] **Step 4: Verify tests pass**

Run: `cd web && node --experimental-strip-types --test src/lib/itinerary-editing.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/itinerary-editing.ts web/src/lib/itinerary-editing.test.ts
git commit -m "Add itinerary editing helpers"
```

## Task 5: Trip Desk Header and Health Panel

**Files:**
- Create: `web/src/components/TripDeskHeader.tsx`
- Create: `web/src/components/PlanHealthPanel.tsx`
- Create: `web/src/components/StatusChip.tsx`
- Modify: `web/src/components/TripPanel.tsx`

- [ ] **Step 1: Create `StatusChip`**

Create `web/src/components/StatusChip.tsx`:

```tsx
"use client";

import { PLANNING_STATUS_META } from "@/lib/planning-status";
import type { PlanningStatusValue } from "@/lib/types";

const TONE_CLASS: Record<string, string> = {
  grey: "bg-white/60 text-ink-500 border-amber-700/10",
  amber: "bg-amber-100 text-amber-800 border-amber-200",
  green: "bg-emerald-100 text-emerald-800 border-emerald-200",
  red: "bg-rose-100 text-rose-700 border-rose-200",
  ink: "bg-ink-900 text-white border-ink-900",
};

export function StatusChip({
  status,
  onClick,
}: {
  status?: PlanningStatusValue;
  onClick?: () => void;
}) {
  const meta = status ? PLANNING_STATUS_META[status] : { label: "Set status", tone: "grey" };
  const classes = TONE_CLASS[meta.tone] ?? TONE_CLASS.grey;
  const content = (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${classes}`}>
      {meta.label}
    </span>
  );
  if (!onClick) return content;
  return (
    <button type="button" onClick={onClick} className="shrink-0">
      {content}
    </button>
  );
}
```

- [ ] **Step 2: Create health panel**

Create `web/src/components/PlanHealthPanel.tsx`:

```tsx
"use client";

import type { TripHealthCheck } from "@/lib/trip-health";

const SEVERITY_DOT: Record<TripHealthCheck["severity"], string> = {
  info: "bg-ink-300",
  warning: "bg-amber-500",
  important: "bg-rose-500",
};

export function PlanHealthPanel({
  checks,
  onDismiss,
  onAction,
}: {
  checks: TripHealthCheck[];
  onDismiss: (id: string) => void;
  onAction: (check: TripHealthCheck) => void;
}) {
  return (
    <div className="frosted-strong rounded-[14px] p-3 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <div className="text-xs font-semibold text-ink-900">Plan health</div>
        <div className="text-[10px] text-ink-500">{checks.length} checks</div>
      </div>
      {checks.length === 0 ? (
        <div className="text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-[10px] px-3 py-2">
          Looks ready. No obvious issues found.
        </div>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {checks.slice(0, 5).map((check) => (
            <li key={check.id} className="rounded-[10px] bg-white/65 border border-amber-700/10 px-3 py-2">
              <div className="flex items-start gap-2">
                <span className={`mt-1.5 h-2 w-2 rounded-full ${SEVERITY_DOT[check.severity]}`} aria-hidden />
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] font-semibold text-ink-900">{check.title}</div>
                  <div className="text-[10px] leading-4 text-ink-500">{check.detail}</div>
                  <div className="mt-1 flex gap-2">
                    {check.action && (
                      <button
                        type="button"
                        onClick={() => onAction(check)}
                        className="text-[10px] font-semibold text-amber-700 hover:text-amber-900"
                      >
                        Review
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => onDismiss(check.id)}
                      className="text-[10px] text-ink-400 hover:text-ink-700"
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Create trip desk header**

Create `web/src/components/TripDeskHeader.tsx`:

```tsx
"use client";

import { combined } from "@/lib/currency";
import { countNeedsBooking } from "@/lib/planning-status";
import type { Budget, PublicTrip, TripFull } from "@/lib/types";

export function TripDeskHeader({
  trip,
  budget,
  healthCount,
  onToggleHealth,
}: {
  trip: TripFull | PublicTrip;
  budget: Budget | null;
  healthCount: number;
  onToggleHealth: () => void;
}) {
  const total = budget
    ? budget.days.reduce(
        (sum, day) => sum + (day.override ?? day.estimated) + day.items.reduce((s, it) => s + it.amount, 0),
        0,
      )
    : null;
  const needsBooking = countNeedsBooking(trip.document.planning);
  const route = trip.document.itinerary.slice(0, 3).map((d) => d.title).join(" → ");

  return (
    <div className="border-b border-amber-700/10 px-3 py-3 bg-white/35">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-amber-700">
            Travel desk
          </div>
          <div className="text-sm font-semibold text-ink-900 truncate">{trip.destination}</div>
          <div className="text-[11px] text-ink-500 truncate">
            {trip.days} days{trip.start_date ? ` · starts ${trip.start_date}` : ""}{route ? ` · ${route}` : ""}
          </div>
        </div>
        <button
          type="button"
          onClick={onToggleHealth}
          className={
            healthCount > 0
              ? "shrink-0 rounded-full bg-amber-100 text-amber-800 border border-amber-200 px-2.5 py-1 text-[10px] font-semibold"
              : "shrink-0 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200 px-2.5 py-1 text-[10px] font-semibold"
          }
        >
          {healthCount > 0 ? `${healthCount} checks` : "Looks ready"}
        </button>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {total !== null && budget && (
          <span className="rounded-full bg-white/70 border border-amber-700/10 px-2 py-0.5 text-[10px] text-ink-700">
            {combined(total, budget.currency, budget.gbp_rate)}
          </span>
        )}
        {needsBooking > 0 && (
          <span className="rounded-full bg-rose-100 border border-rose-200 px-2 py-0.5 text-[10px] text-rose-700">
            {needsBooking} need booking
          </span>
        )}
        {"share_token" in trip && trip.share_token && (
          <span className="rounded-full bg-white/70 border border-amber-700/10 px-2 py-0.5 text-[10px] text-ink-500">
            Shared
          </span>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Wire header and panel into TripPanel**

Modify `web/src/components/TripPanel.tsx`:

```tsx
import { deriveTripHealth } from "@/lib/trip-health";
import { PlanHealthPanel } from "./PlanHealthPanel";
import { TripDeskHeader } from "./TripDeskHeader";
```

Add state:

```tsx
const [showHealth, setShowHealth] = useState(false);
const healthChecks = deriveTripHealth(trip.document, budget);
```

Render `TripDeskHeader` above `TripPanelTabs`, and conditionally render
`PlanHealthPanel` just inside the scroll area before `TripSummaryHeader`.

- [ ] **Step 5: Verify**

Run:

```bash
cd web && npm run lint
cd web && npx tsc --noEmit
```

Expected: both PASS.

- [ ] **Step 6: Commit**

```bash
git add web/src/components/StatusChip.tsx web/src/components/PlanHealthPanel.tsx web/src/components/TripDeskHeader.tsx web/src/components/TripPanel.tsx
git commit -m "Add trip desk header and health panel"
```

## Task 6: Inline Itinerary Editing and Status Controls

**Files:**
- Modify: `web/src/components/Itinerary.tsx`
- Modify: `web/src/components/TripPanel.tsx`
- Modify: `web/src/lib/api.ts`

- [ ] **Step 1: Add document patch API client**

In `web/src/lib/api.ts`, add:

```ts
export async function patchTripDocument(
  slug: string,
  document: TripFull["document"],
  token: string,
): Promise<TripFull> {
  const res = await authedFetch(
    `/trips/${slug}/document`,
    { method: "PATCH", body: JSON.stringify({ document }) },
    token,
  );
  if (!res.ok) throw new Error(`patchTripDocument ${res.status}`);
  return res.json();
}
```

- [ ] **Step 2: Add editable props to Itinerary**

Update `Itinerary` props to include:

```ts
planning: TripPlanning | null | undefined;
editing: boolean;
onEditToggle: () => void;
onDaysChange: (days: ItineraryDay[]) => void;
onStatusChange: (key: string, status: PlanningStatusValue) => void;
```

- [ ] **Step 3: Use editing helpers in Itinerary**

Import:

```ts
import {
  activityKey,
  addActivity,
  deleteActivity,
  editActivity,
  editDayTitle,
  moveActivity,
} from "@/lib/itinerary-editing";
import { nextPlanningStatus } from "@/lib/planning-status";
import { StatusChip } from "./StatusChip";
```

In the active day header, add `Edit` / `Done` button. In edit mode:

- day title renders as an `<input>`
- each activity row renders as an `<input>`
- add buttons appear under each time group
- move up/down/delete buttons appear on each row
- status chip cycles through `nextPlanningStatus`

Use `onDaysChange(editDayTitle(...))`, `onDaysChange(editActivity(...))`,
`onDaysChange(addActivity(...))`, `onDaysChange(deleteActivity(...))`, and
`onDaysChange(moveActivity(...))`.

- [ ] **Step 4: Persist document edits from TripPanel**

In `TripPanel`, own a local document state:

```ts
const [document, setDocument] = useState(trip.document);
const [savingDocument, setSavingDocument] = useState(false);
```

Add save helper:

```ts
async function persistDocument(nextDocument: TripFull["document"]) {
  if (readOnly) return;
  setDocument(nextDocument);
  setSavingDocument(true);
  try {
    const token = await getBrowserToken();
    if (!token) return;
    await patchTripDocument(trip.slug, nextDocument, token);
  } finally {
    setSavingDocument(false);
  }
}
```

Use `document` instead of `trip.document` inside `TripPanel`.

For status changes:

```ts
function updateStatus(key: string, status: PlanningStatusValue) {
  const nextDocument = {
    ...document,
    planning: {
      ...(document.planning ?? {}),
      item_statuses: {
        ...(document.planning?.item_statuses ?? {}),
        [key]: { status, updated_at: new Date().toISOString() },
      },
      last_major_edit_at: new Date().toISOString(),
    },
  };
  persistDocument(nextDocument);
}
```

For day changes, update `itinerary` and `planning.last_major_edit_at`.

- [ ] **Step 5: Verify**

Run:

```bash
cd web && node --experimental-strip-types --test src/lib/itinerary-editing.test.ts src/lib/planning-status.test.ts
cd web && npm run lint
cd web && npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add web/src/components/Itinerary.tsx web/src/components/TripPanel.tsx web/src/lib/api.ts
git commit -m "Add inline itinerary editing"
```

## Task 7: Export Studio Polish

**Files:**
- Modify: `web/src/components/PdfExportMenu.tsx`

- [ ] **Step 1: Add style state**

Add:

```ts
type PdfStyle = "pretty" | "compact" | "reference";
const PDF_STYLES: { key: PdfStyle; label: string; description: string }[] = [
  { key: "reference", label: "Reference style", description: "The polished red-and-cream guide layout." },
  { key: "compact", label: "Compact print", description: "Shorter, printer-friendly guide." },
  { key: "pretty", label: "Pretty guide", description: "More breathing room and richer sections." },
];
```

Add state:

```ts
const [style, setStyle] = useState<PdfStyle>("reference");
```

- [ ] **Step 2: Render grouped export controls**

In the menu phase, render style choices above section toggles. Keep sending the
current `picked` body to the backend; style is UI-only in this core pass.

- [ ] **Step 3: Improve progress labels**

Change the build heading to `Export studio` and render each stage as a small
rounded row with status icon, title, and subtext.

- [ ] **Step 4: Verify**

Run:

```bash
cd web && npm run lint
cd web && npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/components/PdfExportMenu.tsx
git commit -m "Polish PDF export studio"
```

## Task 8: Home Screen Product Signal

**Files:**
- Create: `web/src/components/SampleOutputStrip.tsx`
- Modify: `web/src/app/page.tsx`

- [ ] **Step 1: Create sample output strip**

Create `web/src/components/SampleOutputStrip.tsx`:

```tsx
export function SampleOutputStrip() {
  return (
    <div className="hidden lg:grid mt-8 grid-cols-3 gap-3 text-left">
      <div className="rounded-[14px] bg-white/55 border border-amber-700/10 p-3">
        <div className="text-[10px] uppercase tracking-wider text-amber-700 font-semibold">Route</div>
        <div className="mt-2 flex items-center gap-1 text-[11px] text-ink-600">
          <span>Arrive</span><span className="text-amber-700">→</span><span>Old Town</span><span className="text-amber-700">→</span><span>Sunset</span>
        </div>
      </div>
      <div className="rounded-[14px] bg-white/55 border border-amber-700/10 p-3">
        <div className="text-[10px] uppercase tracking-wider text-amber-700 font-semibold">Day plan</div>
        <div className="mt-2 space-y-1 text-[11px] text-ink-600">
          <div>09:00 coffee near the station</div>
          <div>13:00 lunch + neighbourhood walk</div>
        </div>
      </div>
      <div className="rounded-[14px] bg-white/55 border border-amber-700/10 p-3">
        <div className="text-[10px] uppercase tracking-wider text-amber-700 font-semibold">Ready to export</div>
        <div className="mt-2 flex gap-1.5">
          <span className="rounded-full bg-amber-100 text-amber-800 px-2 py-0.5 text-[10px]">Budget</span>
          <span className="rounded-full bg-white/70 text-ink-600 px-2 py-0.5 text-[10px]">PDF</span>
          <span className="rounded-full bg-white/70 text-ink-600 px-2 py-0.5 text-[10px]">Share</span>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Render below PinInput**

In `web/src/app/page.tsx`, import `SampleOutputStrip` and render it directly
below `<PinInput />` inside the centered hero section.

- [ ] **Step 3: Verify**

Run:

```bash
cd web && npm run lint
cd web && npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add web/src/components/SampleOutputStrip.tsx web/src/app/page.tsx
git commit -m "Add home screen product signal"
```

## Task 9: Full Verification

**Files:**
- No new files.

- [ ] **Step 1: Run API tests**

Run:

```bash
cd api && .venv/bin/python -m pytest tests/test_routes_trip_document.py tests/test_models.py tests/test_routes_trips.py tests/test_routes_public.py -q
```

Expected: PASS.

- [ ] **Step 2: Run frontend helper tests**

Run:

```bash
cd web && node --experimental-strip-types --test \
  src/lib/planning-status.test.ts \
  src/lib/trip-health.test.ts \
  src/lib/itinerary-editing.test.ts \
  src/lib/map-focus.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run frontend static checks**

Run:

```bash
cd web && npm run lint
cd web && npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 4: Browser smoke test**

Start dev server:

```bash
cd web && npm run dev
```

Open a trip and verify:

- trip desk header appears
- health panel opens
- Edit mode toggles
- activity text can be edited
- status chip cycles
- day switch after hover still works
- export menu shows style choices
- home screen shows sample output strip on desktop width

- [ ] **Step 5: Commit any final fixes**

```bash
git status --short
git add \
  api/api/models.py \
  api/api/routes/trips.py \
  api/tests/test_routes_trip_document.py \
  web/src/lib/types.ts \
  web/src/lib/api.ts \
  web/src/lib/planning-status.ts \
  web/src/lib/planning-status.test.ts \
  web/src/lib/trip-health.ts \
  web/src/lib/trip-health.test.ts \
  web/src/lib/itinerary-editing.ts \
  web/src/lib/itinerary-editing.test.ts \
  web/src/components/StatusChip.tsx \
  web/src/components/PlanHealthPanel.tsx \
  web/src/components/TripDeskHeader.tsx \
  web/src/components/TripPanel.tsx \
  web/src/components/Itinerary.tsx \
  web/src/components/PdfExportMenu.tsx \
  web/src/components/SampleOutputStrip.tsx \
  web/src/app/page.tsx \
  'web/src/app/trip/[slug]/TripView.tsx'
git commit -m "Complete V2.5 travel desk core"
```

## Spec Coverage

- Travel Desk Trip Shell: Tasks 5 and 8.
- Itinerary Editor: Tasks 4 and 6.
- Plan Health: Tasks 3 and 5.
- Confirmation Tracker: Tasks 2 and 6.
- Targeted Regeneration: Task 6 wires targeted prompt preview controls through existing refine prefill; a full accept/reject structured LLM preview remains a follow-up because it requires new LLM response contracts.
- Export Studio: Task 7.
- Home Screen Product Signal: Task 8.
- Backward-Compatible Data Model: Tasks 1 and 2.
- Tests: Tasks 1-4 and 9.

## Known Follow-Up

The design spec’s full targeted-regeneration preview is intentionally not
completed in this core pass. This plan adds targeted action entry points and
safe prompt previews through the existing refine flow. A second plan should add
structured preview/apply endpoints once the editing/status foundation is in
place.
