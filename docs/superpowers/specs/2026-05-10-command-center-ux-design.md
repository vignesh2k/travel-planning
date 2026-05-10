# Command Center UX

**Status:** Approved design.
**Date:** 2026-05-10.
**Selected direction:** A. Command Center.

## Goal

Make the trip workspace feel like a premium travel command center: the map
remains the spatial canvas, while the side panel becomes clearer, more
polished, easier to navigate, and better connected to the generated itinerary.

The core promise:

> Atlas lets you inspect the trip like a map, edit it like a plan, and export
> it like a finished guide.

## Product Principles

1. **Preserve the current identity.** Atlas already has a strong map plus
   planning panel model. Improve it rather than replacing it with a new app
   shape.
2. **Navigation should be obvious.** Users should understand where to plan,
   inspect the map, choose stays, review money, and build the guide.
3. **The itinerary and map should feel linked.** Hovering or clicking an
   activity should affect the map. Clicking a map pin should take the user to
   the relevant day and item.
4. **Mobile deserves its own navigation.** Top-bar action crowding should not
   carry the mobile experience.
5. **Polish should become reusable.** Buttons, pills, popovers, tabs, cards,
   and icon badges should use shared primitives instead of repeated ad hoc
   class strings.

## Scope

This design is split into three implementation phases. Each phase should be
shippable on its own and pushed only after its checks pass.

### Phase 1: Core Trip Experience

Refresh the trip workspace while keeping its existing architecture.

#### Design Primitives

Add small shared frontend primitives for common visual patterns:

- buttons
- pills/status tokens
- tabs
- popover panels
- activity cards
- icon badges

These primitives should be lightweight React components or class helpers in the
existing frontend, not a new component library. They should preserve the Atlas
visual language: cream paper, ink text, terracotta primary actions, sage/blue
supporting accents, thin warm borders, and restrained shadows.

#### Trip Navigation

Expand the trip-level navigation to:

- `Plan`
- `Map`
- `Stay`
- `Money`
- `Guide`

Private trips can show every tab. Shared read-only trips should hide private or
account-specific actions, including `Money` and editing actions. `Guide` may be
visible in read-only mode as a preview-only surface when no private budget data
is shown.

Desktop should keep the left panel over the map. The panel may remain near its
current width, but content should feel more organized and less like stacked
miscellaneous widgets.

Mobile should add a bottom navigation bar for the primary workspace views. The
top header should keep brand, trip destination, and essential state only; heavy
actions should move into contextual surfaces.

#### Itinerary Cards

Replace the current loose itinerary rows with structured activity cards:

- consistent icon badge instead of mixed emoji bullets
- clear activity text with a stable line height
- optional status chip aligned consistently
- optional budget/day cue where budget data exists
- visible map affordance when the activity maps to a known place
- focused/selected state that matches the selected map pin

The card should be compact enough for repeated itinerary scanning. It should
not become a large marketing-style card.

#### Map Sync

Map and itinerary interactions should work both ways:

- Selecting a day focuses the map on that day's mappable places.
- Hovering or clicking a mappable activity highlights its map pin.
- Clicking a map pin switches the panel to the relevant day and scrolls the
  matching activity card into view.
- If multiple activities reference the same place, click the first matching
  activity in itinerary order.
- If a pin is not referenced by the itinerary, show the pin selection on the
  map without forcing a day change.

The existing route line should continue to draw for the active day when two or
more places are mappable.

#### Mobile Navigation

Mobile should use a bottom nav for workspace movement:

- `Plan`
- `Map`
- `Stay`
- `Guide`

`Money` should be reachable from budget cues or an overflow/action menu for
private trips. This avoids five cramped mobile nav items while keeping budget
access discoverable.

The mobile sheet should respect the selected tab:

- `Plan`, `Stay`, `Money`, and `Guide` show sheet content.
- `Map` minimizes the sheet and leaves the map as the primary surface.

### Phase 2: Guide And PDF Experience

Add a `Guide` tab as the premium export workspace.

The Guide tab should include:

- guide cover preview with destination and trip length
- included sections summary
- PDF style choice
- section toggles
- privacy note for budget/private data
- primary `Build guide` action
- recent export state when available

The current top-bar `Guide PDF` control should remain as a quick action, but
it should reuse the same export options and language as the Guide tab.

### Phase 3: Visual QA Guardrails

Add pragmatic browser checks for key UI surfaces:

- sign-in
- offline
- profile
- trip workspace desktop
- trip workspace mobile
- PDF/Guide export menu
- share menu
- shared-plan fallback

The goal is not pixel-perfect snapshot maintenance. The tests should catch
route failures, missing key controls, broken responsive navigation, and obvious
layout overflow.

## Architecture

Keep the existing `TripWorkspace` and `TripPanel` ownership:

- `TripWorkspace` owns workspace-level state such as selected places, focus
  places, save/share/export actions, desktop/mobile shell, and map callbacks.
- `TripPanel` owns active workspace tab, plan/stay/money/guide content, and
  day/item scrolling.
- `Itinerary` owns day navigation and activity-card rendering.
- `Map` owns marker rendering, route rendering, and marker click callbacks.

Add small helper modules where they reduce component coupling:

- map-to-itinerary lookup helpers
- UI class/variant helpers
- guide preview option helpers

Avoid changing the backend data model for Phase 1. Phase 2 may use existing
trip, budget, and PDF export APIs.

## Data Flow

1. `TripWorkspace` passes `selectedPlaceName`, `focusPlaces`, and map callback
   handlers into `Map` and `TripPanel`.
2. `Itinerary` derives activity ids and place matches from the existing trip
   document.
3. Activity hover/click calls `onFocusPlaces([place])`.
4. Map marker click calls back to `TripWorkspace`, which stores the selected
   place.
5. `TripPanel` or `Itinerary` reacts to the selected place by selecting the
   matching day and scrolling the matching activity card.
6. `Guide` uses the current trip document, budget, and export settings to show
   preview state and launch PDF generation.

## Error Handling

- If map lookup fails, keep the current day and only highlight the pin.
- If an activity has no mapped place, render it as a normal activity card with
  no map affordance.
- If budget data is unavailable, hide budget cues rather than showing empty
  labels.
- If PDF generation fails, keep the user in the Guide tab and show a concise
  retryable error state.
- If browser visual tests cannot reach an authenticated trip route locally,
  they should still cover public and unauthenticated routes and document the
  auth limitation in the test output.

## Testing

Phase 1 should include unit tests for:

- itinerary lookup from place name to day/activity id
- mobile tab visibility rules
- guide/read-only tab visibility rules

Phase 2 should include unit tests for:

- guide export option defaults
- private budget section availability
- section summary text

Phase 3 should add browser smoke checks for:

- route loads
- primary navigation is visible
- key menus open
- mobile bottom navigation renders at a narrow viewport

Every phase should run:

```bash
cd web
npm run lint
npx tsc --noEmit
node --test src/lib/planning-status.test.ts src/lib/trip-health.test.ts src/lib/map-focus.test.ts
npm run build
```

Additional new tests should be added to the `node --test` command for the
phase that introduces them.

## Out Of Scope

- Replacing MapLibre.
- Rebuilding the trip workspace as a new route.
- Backend schema changes.
- Pixel-perfect visual snapshots for every state.
- Large homepage redesign.
- AI targeted regeneration changes.

## Self-Review

- Placeholder scan: no placeholder requirements remain.
- Scope check: the work is broad but phased into independent shippable slices.
- Consistency check: the selected direction is Command Center throughout, and
  the plan preserves existing `TripWorkspace`, `TripPanel`, `Itinerary`, and
  `Map` ownership.
- Ambiguity check: mobile tab behavior, read-only visibility, and map-click
  fallback behavior are explicitly defined.
