# Routes on Map

**Status:** Design.
**Date:** 2026-05-03.
**Part of:** v2 feature batch (preferences ✓ → budget ✓ → share ✓ → **routes** → offline).

## Goal

When the user selects a day on the Itinerary tab, draw a dashed amber
line connecting that day's stops in bullet order. Conveys the day's
geography at a glance without turn-by-turn detail.

## Non-goals (v1)

- No real walking/driving routes (OSRM, Mapbox Directions, etc.)
- No pre-computed cached polylines persisted on the trip row
- No numbered waypoint badges
- No distance/duration labels
- No toggle to show all days' routes at once
- No line-draw animation

## Behaviour

| State                              | Map shows |
| ---                                | --- |
| Trip view, no day active           | All dots, no line |
| Itinerary tab, day N active        | All dots + dashed amber line connecting day N's mappable places in order |
| Switch to "Where to stay" / "Budget" | Line cleared, dots only |
| Day has 0 or 1 mappable places     | No line |
| Public viewer (`/s/{token}`)       | Same — inherits via the existing Map component |

## How it hooks in

The current contract:

```ts
// Itinerary.tsx (already exists)
const dayPlaces = placesForDay(active, places);  // ordered, deduped
onFocusPlaces(dayPlaces.length > 0 ? dayPlaces : null);
```

`placesForDay` walks bullets in order (Morning → Afternoon → Evening),
substring-matches each bullet against `places[]`, and returns the
deduped, in-order list. **That's already exactly what we need for the
route.** No new state, no new prop, no Itinerary changes.

`Map.tsx` adds:

1. A `route-source` (GeoJSON LineString) and `route-layer` (line)
   registered after `map.on('load')`, beneath all marker dots.
2. An effect that watches `focusPlaces`, builds a `LineString` from
   `focusPlaces.filter(p => p.lat != null && p.lng != null)`, and sets
   the source data. When `focusPlaces` is null or fewer than 2 valid
   points, set the source to an empty `FeatureCollection` (line
   disappears).

## Visual

- Stroke: `#b45309` (amber-700) at `line-opacity: 0.5`
- Width: `line-width: 3` (constant — not zoom-dependent for v1)
- Dashes: `line-dasharray: [2, 2]`
- Caps + joins: `round` for smoothness
- Z-order: registered as the FIRST custom layer so all dot markers
  (which are HTML markers added via `new Marker()`) sit above it.
  HTML markers are above any GL layer by default so this is
  automatic — but we name the source/layer explicitly so future code
  can place additional GL layers above the route if needed.

## Files

```
web/src/components/Map.tsx     MODIFIED: route source + layer; effect
                                          that updates on focusPlaces
                                          change.
web/AGENTS.md                  MODIFIED: gotcha note — the route layer
                                          must be registered AFTER
                                          map.on("load") and the source
                                          updated only after the style
                                          is loaded.
```

No backend changes. No migration. No new env vars. No new deps.

## Edge cases

| Case | Behaviour |
| --- | --- |
| Day's first valid stop is at one corner of the city, last at the other | Line drawn straight; map already auto-fits to focusPlaces. |
| Trip is multi-city and one day spans both | Line drawn straight across — user reads the bullet text for context. |
| Stop has `lat` or `lng` of `null` (geocode failed) | Skipped silently. Line stitches across the gap. |
| Day has only one mappable place | No line. The dot already shows the location. |
| Day has duplicate place names across bullets | `placesForDay` dedupes; the line visits each location once. |
| Map style not yet loaded when first day activates | Effect waits via `if (!map.isStyleLoaded()) map.once("idle", run)` — same pattern as the existing markers code. |

## Acceptance criteria

1. Selecting a day on the Itinerary tab draws a dashed amber line
   between that day's mappable places, in bullet order (Morning →
   Afternoon → Evening).
2. The line updates instantly on day-switch — no flicker, no leftover
   from the previous day.
3. Switching to "Where to stay" or "Budget" clears the line.
4. A day with 0 or 1 mappable places shows no line.
5. The line is rendered below the marker dots (dots stay clickable).
6. Public `/s/{token}` viewer shows the route for the active day.
7. Re-rendering Map.tsx (e.g. parent state change) does not register
   duplicate sources/layers — single canonical source name.

## Why this is small

The hook point already exists. `Itinerary.tsx::onFocusPlaces` already
passes the ordered place list to `Map.tsx`. The map already knows how
to fit bounds to that list. Adding a single GL `line` layer driven by
the same data is a few dozen lines of code. The design effort goes
into the visual choice (dashed amber, beneath markers) and the edge
cases (style-load timing, empty / single-stop days), not the
architecture.
