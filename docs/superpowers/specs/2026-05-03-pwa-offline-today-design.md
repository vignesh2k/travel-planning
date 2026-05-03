# PWA + Offline + Today View

**Status:** Design.
**Date:** 2026-05-03.
**Part of:** v2 feature batch (preferences ✓ → budget ✓ → share ✓ → routes ✓ → **PWA + offline + today**).

## Goal

Three tightly-coupled changes that together make Atlas useful while
travelling:

1. **PWA install** — installable to iOS / Android home screens.
2. **Offline read** — visited trips stay viewable; the active trip is
   pre-cached aggressively (data + map tiles) for the
   airport / plane / underground scenarios.
3. **Today view** — when a trip is happening NOW, surface today's day
   one tap away. The PWA's `start_url` goes straight to today.

Plus a minor must-have: an inline date editor on the trip header so
existing trips can be put into the Today flow without re-generating.

## Non-goals (v1)

- No background sync for offline-created mutations (offline
  POST/PUT/DELETE fail fast).
- No push notifications.
- No per-day pre-cache (only the active trip as a whole).
- No tile pre-cache for non-active trips (cache-as-you-view).
- No custom install prompt — rely on the browser's native UI.
- No "manage cache size" settings page (invisible LRU).

## Architecture overview

```
                                                  ┌───────────────────┐
                                                  │ tiles.openfreemap │
                                                  └─────────▲─────────┘
                                                            │ cache-first LRU
   ┌─────────────────┐         postMessage                  │
   │ Home page       │   precache-trip(slug, bbox) ─►  ┌────┴────┐
   │ + ActiveTrip-   │                                 │  sw.js  │  cache buckets:
   │   Precache      │                                 │  hand-  │  • atlas-shell-v1
   └─────────────────┘                                 │  rolled │  • atlas-trips-v1
                                                       └────┬────┘  • atlas-tiles-v1
   ┌─────────────────┐         fetch (intercepted)          │
   │ Trip page       ├──────────────────────────────────────┘
   │ Itinerary, etc  │
   └─────────────────┘
```

## Data model changes

### `TripSummary` gains `start_date`

The list endpoint currently returns `id, slug, destination, days,
created_at`. The Today logic needs `start_date` too, otherwise the
home page would fetch each trip individually to know which is active.

Backend: `models.py` adds `start_date: date | None` to `TripSummary`,
and `routes/trips.py::list_trips` widens its SELECT.

Frontend: `lib/types.ts` adds `start_date: string | null` to
`TripSummary`.

No migration — `start_date` already exists on `trips`.

### New `PATCH /trips/{slug}` route

Currently no way to edit a trip's `start_date` after creation. Adding
a small partial-update route.

```python
class TripPatch(BaseModel):
    start_date: date | None = None  # null is allowed (clears the date)

@router.patch("/trips/{slug}", response_model=TripFull)
def patch_trip(slug: str, body: TripPatch, user: CurrentUser) -> TripFull: ...
```

Owner-only (same `user_id == sub` check as the other routes). Updates
`start_date` and returns the full updated trip.

Scope: v1 patches `start_date` only. Future fields can extend the
model — but YAGNI for now.

## PWA install

### `web/public/manifest.json`

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

### Icons

Generated from the existing `BrandMark` SVG, exported to PNG at 192
and 512 px. Amber compass mark on cream background, with safe-zone
padding for `purpose: maskable` (Android adaptive icons crop a circle).
Committed to `web/public/`. One-time generation via a small Node
script committed to the repo (`scripts/gen-icons.mjs`) using `sharp`
for PNG export — runnable on demand if the brand mark changes.

### Root layout meta

`web/src/app/layout.tsx` adds:

- `<link rel="manifest" href="/manifest.json" />`
- `<meta name="theme-color" content="#b45309" />`
- `<link rel="apple-touch-icon" href="/icon-192.png" />`
- `<meta name="apple-mobile-web-app-capable" content="yes" />`
- `<meta name="apple-mobile-web-app-status-bar-style" content="default" />`
- `<meta name="apple-mobile-web-app-title" content="Atlas" />`

Plus mounts `<ServiceWorkerRegister />` (client component) at the end
of `<body>`.

## Service worker — `web/public/sw.js`

Hand-rolled, ~120 lines. Versioned cache names so a SW upgrade cleans
old data on activate.

| Request matches                                          | Strategy                            | Cache              |
| ---                                                      | ---                                 | ---                |
| Same-origin navigation (`/`, `/trip/*`, `/today`, etc.)  | Network-first → cache → `/offline`  | `atlas-shell-v1`   |
| `/_next/static/*`, `/icon-*.png`, `/manifest.json`       | Stale-while-revalidate              | `atlas-shell-v1`   |
| `<API_BASE>/trips`, `…/trips/:slug`, `…/budget`, `…/me/profile` GET | Network-first → cache       | `atlas-trips-v1`   |
| `<API_BASE>/*` POST/PUT/PATCH/DELETE                     | Network only; synth 503 if offline  | —                  |
| `tiles.openfreemap.org/*`                                | Cache-first, LRU-capped at 250 entries per active-trip pre-cache run + accumulated up to 1000 total | `atlas-tiles-v1`   |
| All other origins                                        | Network only, no cache              | —                  |

**Install event** precaches: `/`, `/today`, `/offline`, `/manifest.json`,
the two icons, and a tiny static manifest of essential `_next/static`
chunks (the layout build outputs these into a small JSON we generate
at build time — for v1, hard-code `/_next/static/css/<latest>.css` is
fragile; instead skip static-asset precache and rely on
stale-while-revalidate to lazy-fill on first navigation).

**Activate event:** delete any cache name not in the current version
set. Take control of all clients via `clients.claim()`.

**Message handler:** receives `precache-trip` messages from the home
page (see next section).

**Tile LRU:** keep a `Map<url, lastUsed>` in IndexedDB store
`atlas-tile-meta`. On every tile fetch, update `lastUsed`. When count
exceeds the cap, evict oldest until under cap.

## Active-trip pre-cache

When the home page loads online and the active-trip helper finds an
active trip, a tiny client component sends a message to the SW:

```ts
navigator.serviceWorker?.controller?.postMessage({
  type: "precache-trip",
  slug: active.trip.slug,
  apiBase: process.env.NEXT_PUBLIC_API_BASE,
  bbox: bboxFromPlaces(trip.document.places),  // [minLng, minLat, maxLng, maxLat]
});
```

`bboxFromPlaces` lives in `web/src/lib/active-trip.ts` and computes
the tightest box around all places with non-null coords. If the trip
has fewer than 2 placed places, skip pre-cache (no useful bbox).

The SW handles the message asynchronously:

1. `GET ${apiBase}/trips/${slug}` → into `atlas-trips-v1`
2. `GET ${apiBase}/trips/${slug}/budget` → into `atlas-trips-v1`
   (404 is fine — trip might have no budget yet)
3. Fetch the MapLibre style JSON (`positron`) + sprite + glyphs
   referenced inside it → `atlas-tiles-v1`
4. **Trip-area tiles**: zoom levels 11–14 covering the bbox, capped at
   250 tiles total per trip. Tile URL pattern:
   `https://tiles.openfreemap.org/styles/positron/{z}/{x}/{y}.pbf`
   (or whatever the style references — fetch the style, extract the
   tile-URL template, iterate). Failures silently swallowed — best
   effort.

Calling postMessage on a SW that hasn't taken control yet is a no-op
(`controller` is null on first load). Acceptable: the user will get
the pre-cache on their next visit, by which point the SW has claimed
the page.

If the user has multiple active trips (overlapping dates, rare),
pre-cache only the one with the most recent `created_at`.

## Today view

### `findActiveTrip` helper

`web/src/lib/active-trip.ts`:

```ts
export interface ActiveTrip {
  trip: TripSummary;       // includes start_date
  dayNumber: number;       // 1-indexed
  totalDays: number;
}

export function findActiveTrip(
  trips: TripSummary[],
  today: Date = new Date(),
): ActiveTrip | null;

export function bboxFromPlaces(
  places: { lat: number | null; lng: number | null }[],
): [number, number, number, number] | null;
```

`findActiveTrip`:
- Filter to trips with non-null `start_date`.
- Compute `endDate = startDate + days` (exclusive).
- Keep trips where `startDate <= today < endDate`.
- If multiple, pick the one with the most recent `created_at`.
- Return `{ trip, dayNumber: floor((today - startDate) / 1day) + 1, totalDays: trip.days }`.

Pure function, fully unit-testable.

### `/today` route

`web/src/app/today/page.tsx`. Server component.

- Fetches `listTrips` for the signed-in user.
- Calls `findActiveTrip`.
- If found: `redirect(\`/trip/${active.trip.slug}?day=${active.dayNumber}\`)`.
- If none: renders a "Nothing scheduled today" page with a link to
  the home page and a "Plan a trip →" CTA.
- If signed-out: redirect to `/auth/signin`.

Set as `start_url` in the manifest so installed PWAs land here.

### Home-page banner

`web/src/components/TodayBanner.tsx`. Mounted above the chat input on
`web/src/app/page.tsx` when `findActiveTrip(trips) !== null`.

Visual: amber gradient pill, two lines.
```
✦ Day 3 of 7 · Kyoto                                  Open today →
   Temples & Tea
```

Click → `/trip/{slug}?day={N}`.

### Trip page `?day=` query param

`web/src/app/trip/[slug]/page.tsx` reads `?day=N` from `searchParams`,
passes it down to `TripView` as `initialDay?: number`. `TripView`
forwards to `TripPanel`, which forwards to `Itinerary`. `Itinerary`
seeds its `activeNum` from `initialDay ?? days[0].number`. Clamped to
`[1, totalDays]`.

When `?day=` is absent, behaviour is unchanged (Day 1 default).

## Trip-date edit (must-have for existing trips)

### Inline editor

`web/src/components/TripDateEdit.tsx` — small client component.

- Mounted in the trip header, replacing the static
  `Kyoto · 7 days` line with `Kyoto · 7 days · Sat 15 Mar` (when set)
  or `Kyoto · 7 days · + Add dates` (when null).
- Click → tiny popover with a native `<input type="date">` + Save +
  Clear buttons.
- Save → `PATCH /trips/{slug}` → updates local state and triggers a
  `router.refresh()` so the banner appears/disappears on the home
  page next visit.

Native date input keeps the surface tiny — zero extra deps. Mobile
gets the system date picker; desktop gets the browser's date widget.

### Backend `PATCH` route

```python
class TripPatch(BaseModel):
    start_date: date | None = None

@router.patch("/trips/{slug}", response_model=TripFull)
def patch_trip(slug: str, body: TripPatch, user: CurrentUser) -> TripFull:
    db = service_client()
    res = db.table("trips").select("*").eq("slug", slug).single().execute()
    if not res.data: raise HTTPException(404, "Trip not found")
    if res.data["user_id"] != user["sub"]: raise HTTPException(403, "Not your trip")

    update = {"start_date": body.start_date.isoformat() if body.start_date else None}
    upd = db.table("trips").update(update).eq("slug", slug).execute()
    if not upd.data: raise HTTPException(500, "update returned no row")

    row = upd.data[0]
    inserted_data = {**row}
    doc_dict = inserted_data.pop("document")
    return TripFull(**inserted_data, document=TripDocument(**doc_dict))
```

## File structure

```
web/public/
├── manifest.json                      NEW
├── sw.js                              NEW (~120 lines)
├── icon-192.png                       NEW (amber-on-cream Atlas mark)
└── icon-512.png                       NEW

web/src/
├── app/today/page.tsx                 NEW: server redirect / "no trip today"
├── app/offline/page.tsx               NEW: minimal cached offline page
├── app/layout.tsx                     MODIFIED: manifest, theme meta, Apple
│                                                 PWA meta, mount SWRegister
├── app/page.tsx                       MODIFIED: TodayBanner + ActiveTripPrecache
├── app/trip/[slug]/page.tsx           MODIFIED: read ?day= query, pass through
├── app/trip/[slug]/TripView.tsx       MODIFIED: thread initialDay
├── components/
│   ├── TodayBanner.tsx                NEW
│   ├── ServiceWorkerRegister.tsx      NEW: client-only, registers /sw.js
│   ├── ActiveTripPrecache.tsx         NEW: postMessage on mount
│   ├── TripDateEdit.tsx               NEW: inline date editor
│   ├── TripPanel.tsx                  MODIFIED: accept initialDay
│   └── Itinerary.tsx                  MODIFIED: accept initialDay
├── lib/
│   ├── active-trip.ts                 NEW: findActiveTrip + bboxFromPlaces
│   ├── api.ts                         MODIFIED: patchTrip()
│   └── types.ts                       MODIFIED: TripSummary.start_date
└── ─

api/api/
├── models.py                          MODIFIED: TripSummary.start_date,
│                                                 TripPatch
└── routes/trips.py                    MODIFIED: list_trips select adds
                                                  start_date; new patch_trip

api/tests/
├── test_routes_trips.py               MODIFIED: list_trips returns start_date,
                                                  patch_trip happy + 403 + 404
└── test_active_trip.py                NEW: findActiveTrip cases (frontend
                                              equivalent unit-tested in TS
                                              if we add vitest, otherwise
                                              left to manual QA)

scripts/
└── gen-icons.mjs                      NEW: one-time PNG export from SVG

web/AGENTS.md                          MODIFIED: SW lifecycle gotchas
```

No new backend deps. Frontend may add `sharp` as a `devDependency`
for the icon generation script.

## Edge cases

| Case | Behaviour |
| --- | --- |
| First visit, no SW installed | App works as today; SW installs in background, takes over on next nav. |
| SW upgrades after Vercel deploy | New SW installs on next nav; activates after page close+reopen (or via skipWaiting + clients.claim — we do clients.claim). Old caches deleted. |
| User has multiple active trips | Banner + pre-cache for the most recently created. |
| Trip with no `start_date` | Never "active". Banner won't show; the inline date editor lets the user fix it. |
| `?day=N` out of range | Itinerary clamps to `[1, totalDays]`. |
| Offline + open never-cached trip | Shell loads, trip API hits cache → miss → renders empty-state "Trip not cached. Connect once to view." |
| Offline + try to PATCH a date | Network only; synthesised 503. UI shows "Couldn't save — you're offline." |
| Tile cache fills | LRU eviction by URL `lastUsed`. Cap 1000 total. |
| Trip is being refined while user is offline | Refine is POST → fails offline. User sees the error toast and can retry online. |
| User signs out | Caches kept (would need explicit clear-on-signout — out of scope). Browser's clear-site-data nukes everything. Next sign-in fetches fresh. |
| Today's day number rolls over at midnight while app is open | Static — banner won't auto-refresh. Acceptable. Nav-away-and-back recomputes. |

## Acceptance criteria

1. Chrome desktop / Android shows the install prompt; installed app
   launches in standalone mode.
2. iOS Safari Add-to-Home-Screen produces an icon that opens the app
   standalone.
3. Installed PWA's start URL is `/today`. With an active trip, this
   redirects into the right day; without, shows "Nothing today".
4. With airplane mode ON, opening a previously visited trip URL
   shows the trip from cache.
5. With an active trip and airplane mode ON, opening Atlas shows the
   home banner / opens directly into today (depending on entry point)
   with map tiles for the trip's bbox visible.
6. The home-page banner appears only when an active trip exists; one
   click opens the right day.
7. Trip header shows the trip's date (when set) and offers an
   "+ Add dates" affordance when null. Editing persists via PATCH and
   makes the trip eligible for Today.
8. Coming back online → next interaction fetches fresh data.
9. New Vercel deploys take effect after one nav (no permanent cache
   pinning).
10. RLS verified: a token from user A cannot PATCH user B's trip date.

## Privacy

- All cached data is per-device, never transmitted.
- The PWA's `start_url` is `/today` — opening from the home screen
  redirects to a specific trip URL if active, which is fine (the
  trip URL is owner-only behind auth).
- No analytics or tracking added.
