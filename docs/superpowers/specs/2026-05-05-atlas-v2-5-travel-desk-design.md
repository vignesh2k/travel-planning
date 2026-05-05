# Atlas V2.5 Travel Desk

**Status:** Design.
**Date:** 2026-05-05.
**Theme:** Control and confidence.

## Goal

V2.5 should make Atlas feel less like a one-shot itinerary generator and
more like a polished travel desk: the app generates the trip, then helps the
user inspect, edit, confirm, share, and export it with confidence.

The core promise:

> Atlas drafts the trip. You stay in control.

## Product Principles

1. **Generated is not final.** Every important itinerary element should be
   editable without asking AI to rewrite the whole document.
2. **Confidence should be visible.** Missing bookings, long hops, light food
   coverage, missing map pins, and unconfirmed costs should be obvious.
3. **The map is the canvas, not the whole product.** The side panel should feel
   like a travel command center rather than a small overlay.
4. **AI is a companion.** Refinement remains useful, but direct edits,
   reordering, status tracking, and targeted regeneration should be first-class.
5. **No heavy backend rewrite for V2.5.** Prefer backward-compatible additions
   to the existing trip document JSON and current routes.

## Scope

### 1. Travel Desk Trip Shell

Refresh the trip screen into a clearer command-center layout.

Desktop:

- Keep the full-screen map.
- Expand the left panel from a compact itinerary drawer into a slightly wider
  travel desk panel where space allows.
- Add a compact trip command header inside the panel:
  - destination
  - dates / duration
  - route summary
  - budget total when available
  - plan health status
  - saved/shared/export state
- Keep top-level actions in the global header, but reduce visual competition.

Mobile:

- Keep the bottom sheet model.
- Add the same command header at the top of the sheet.
- Use sticky section controls so Plan / Stay / Money / Export remain reachable.

Design direction:

- Keep the cream, terracotta, ink, cartographic visual language.
- Reduce generic frosted-card repetition.
- Use denser rows, thin rules, compact status tokens, and stronger section
  titles.
- Use cards only for repeated items, modals, and framed tools.

### 2. Itinerary Editor

Users can directly edit the itinerary without prompt-only refinement.

Capabilities:

- Edit day title.
- Edit activity text inline.
- Add activity to Morning / Afternoon / Evening.
- Delete activity.
- Move activity up/down within a day.
- Move activity between Morning / Afternoon / Evening.
- Reorder days when useful, behind an explicit edit mode.

Interaction model:

- Default mode is read/navigation.
- `Edit` toggles the panel into editing mode.
- In edit mode, activity rows reveal:
  - drag handle or move controls
  - edit icon
  - delete icon
  - status control
- Text edits save locally in state first, then persist through a debounced
  document update.
- A visible `Done` exits edit mode.

AI connection:

- Each day keeps a `Refine Day` action.
- Each activity can expose `Improve this`, `Make cheaper`, `Add backup`, and
  `Find nearby food` as targeted AI actions.
- Targeted AI updates only the selected day or activity group.

### 3. Plan Health

Add a small confidence layer that audits the trip and surfaces issues.

Health checks:

- Days with zero mappable places.
- Activities that mention places with no map pin.
- Days with long hops between stops.
- Days with no food coverage.
- Restaurants or activities likely requiring booking.
- Missing hotel/accommodation coverage.
- Budget missing or stale.
- PDF not generated after major edits.

UI:

- Show one compact health pill in the trip command header:
  - `Looks ready`
  - `3 things to check`
  - `Needs attention`
- Clicking opens a checklist panel.
- Each check has:
  - severity: info / warning / important
  - short title
  - one-line explanation
  - action button when the app can take the user directly to the relevant
    surface, such as Money, Stay, Export, or the affected day
  - dismiss option for checks the user accepts

Design language:

- Green: ready / confirmed.
- Amber: needs review.
- Red: important risk.
- Grey: optional / dismissed.

### 4. Confirmation Tracker

Add lightweight statuses for itinerary items, restaurants, hotels, and budget
items.

Statuses:

- `Idea`
- `Maybe`
- `Booked`
- `Paid`
- `Skip`
- `Needs booking`

Usage:

- Activity rows can carry a status chip.
- Restaurants and hotels can carry the same status language.
- Budget rows can show paid/unpaid when user-added items exist.
- The command header summarizes outstanding `Needs booking` items.

Data:

- Store tracker metadata inside the existing trip document JSON.
- Preserve backward compatibility for old trips with no tracker metadata.
- Use stable item ids for new or edited itinerary activities.
- For legacy trips, derive ids from day/group/index and convert to stable ids
  when the user edits or marks an item.

### 5. Targeted Regeneration

Replace broad regeneration with precise controls.

Entry points:

- Regenerate whole day.
- Regenerate only food for a day.
- Add rainy-day backup.
- Make this day slower.
- Make this day cheaper.
- Find nearby vegetarian options.
- Rebuild route order.

Rules:

- A targeted regeneration previews changes before applying.
- User can accept, reject, or copy from the suggestion.
- Accepted changes update the structured itinerary document, not only markdown.
- If a targeted generation fails, the existing itinerary remains untouched.

### 6. Export Studio

Refine the PDF/export flow into a small export workspace.

Features:

- Style choice:
  - `Pretty guide`
  - `Compact print`
  - `Reference style`
- Section toggles:
  - schedule
  - food
  - photo spots
  - tips
  - budget
  - checklist
- Progress shown as staged cards.
- Completion state includes:
  - open PDF
  - regenerate
  - copy share link

Design:

- Keep the export menu compact until opened.
- Use a modal or popover with clear grouped controls.
- Progress should feel like a build pipeline, not a loading spinner.

### 7. Home Screen Product Signal

The current home screen is elegant. V2.5 should add a little more evidence of
what Atlas produces.

Changes:

- Add a subtle sample-output strip below the main input on larger screens:
  - tiny route line
  - miniature itinerary rows
  - budget chip
  - export/PDF hint
- Make the logbook feel more like travel artifacts:
  - route slips
  - passport-stamp details
  - small status markers for saved/shared/upcoming
- Keep the current first impression calm and premium.
- Do not turn the homepage into a marketing page.

## Data Model

Prefer a backward-compatible `TripDocument` extension.

Current document shape remains valid:

```ts
interface TripDocument {
  document_markdown: string;
  places: Place[];
  neighborhoods: Neighborhood[];
  restaurants: string[][];
  itinerary: ItineraryDay[];
}
```

V2.5 may add optional metadata:

```ts
interface TripDocumentV25 extends TripDocument {
  planning?: {
    item_statuses?: Record<string, PlanningStatus>;
    dismissed_health_checks?: string[];
    last_pdf_generated_at?: string;
    last_major_edit_at?: string;
  };
}

interface PlanningStatus {
  status: "idea" | "maybe" | "booked" | "paid" | "skip" | "needs_booking";
  note?: string;
  updated_at: string;
}
```

Itinerary activities remain readable as bare strings for legacy trips. When a
user edits, adds, reorders, or marks an activity, V2.5 creates a stable id for
that activity in metadata without requiring a document-wide migration.

## Component Architecture

Frontend additions:

- `TripDeskHeader`
  - destination, dates, route, budget, health, saved/shared/export states
- `PlanHealthPanel`
  - checklist and actions
- `EditableItinerary`
  - read/edit modes for days and activities
- `ActivityRow`
  - map focus, inline edit, status, move/delete controls
- `StatusChip`
  - shared tracker status component
- `ExportStudio`
  - PDF style/section selection and staged progress
- `SampleOutputStrip`
  - home screen product signal

Shared helpers:

- `trip-health.ts`
  - pure health-check derivation from trip document, places, budget, and pdf
    metadata
- `itinerary-editing.ts`
  - immutable edit/reorder helpers
- `planning-status.ts`
  - status labels, colors, summary counts

Backend additions:

- Reuse existing trip update/refine routes for read-only generation and broad
  refinement.
- Add a narrow document patch route if current update paths cannot persist
  edited structured itinerary safely.
- Targeted regeneration can build on the existing refine infrastructure, but
  the response should be structured enough to preview and apply changes.

## Error Handling

- Inline edit save failure keeps the local edit visible and shows a retry
  state.
- Targeted regeneration never overwrites the existing plan until accepted.
- Health checks should degrade gracefully when budget/hotel/pdf metadata is
  missing.
- Legacy trips without planning metadata render exactly as they do today.
- If stable ids cannot be found for old activity rows, use day/group/index as
  a temporary key and convert on first edit.

## Testing

Unit tests:

- health-check derivation
- itinerary edit/reorder helpers
- planning status summaries
- stable id fallback behavior
- targeted regeneration apply/reject helpers

Component tests or focused interaction tests:

- edit activity text and save
- switch day after hovering map-linked activity
- mark activity as booked
- dismiss health check
- export studio toggles section state

Manual/browser QA:

- desktop trip desk layout
- mobile bottom sheet layout
- edit mode
- map focus and route behavior
- export flow
- legacy trip rendering

## Acceptance Criteria

1. Trip view has a clearer travel-desk header with summary, health, and status
   signals.
2. Users can edit itinerary text without AI refinement.
3. Users can move activities within a day.
4. Users can mark items as booked / maybe / needs booking / skipped.
5. Plan health surfaces at least five useful checks and supports dismissal.
6. Targeted regeneration previews changes before applying.
7. Export flow supports style and section choices.
8. Home screen shows more product signal without becoming a marketing page.
9. Existing trips still render with no migration.
10. Mobile remains first-class and does not lose core editing/status actions.

## Non-Goals

- No collaborative real-time editing.
- No full calendar sync in V2.5.
- No external booking API integration.
- No automatic restaurant reservations.
- No full document version history beyond lightweight undo/preview behavior.
- No mandatory Supabase migration unless the implementation discovers that
  document-level JSON patching is unsafe.

## Rollout Plan

Recommended implementation order:

1. Trip desk header and design system refinements.
2. Pure health-check engine and health panel.
3. Planning status metadata and status chips.
4. Inline itinerary edit mode.
5. Activity move/reorder helpers.
6. Targeted regeneration previews.
7. Export studio polish.
8. Home screen product signal.

This order gives visible design value early, then adds control and confidence
without forcing the riskiest AI/data changes first.
