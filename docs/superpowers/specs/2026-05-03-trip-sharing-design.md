# Trip Sharing (Public Read-Only Links)

**Status:** Design.
**Date:** 2026-05-03.
**Part of:** v2 feature batch (preferences ✓ → budget ✓ → **share** → routes → offline).

## Goal

Let an Atlas user share a trip with a friend who doesn't have an
account. A "Share" button on the trip page produces a public URL
anyone can open without signing in. Read-only. Revocable. WhatsApp-
able.

## Non-goals (v1)

- No comments, reactions, or any write surface for visitors.
- No expiry / no analytics / no rich previews.
- No per-share toggles ("include budget"). Single uniform public view.
- No multi-token-per-trip. One token at a time, rotates on demand.

## What's shared

The friend sees the same warm-cream Atlas trip view, minus personal
bits:

| Visible            | Hidden                              |
| ---                | ---                                 |
| Itinerary tab      | Budget tab                          |
| Hotels tab         | Refine input                        |
| Map + day focus    | Delete button                       |
| Trip name + days   | Owner email + UserMenu              |
|                    | PDF export menu (would 401 anyway)  |

Budget is excluded by default — line items can be personal ("Spa: £200"
that you don't want your mate to see). Owner identity is excluded too,
to reduce social pressure to comment.

## Data model

A column on `public.trips`:

```sql
alter table public.trips add column share_token text unique;
create index trips_share_token_idx on public.trips(share_token)
  where share_token is not null;
```

- `null` → not shared (default for all existing trips).
- non-null → publicly viewable at `/s/{token}`.
- Toggling share OFF sets it back to `null`. Toggling ON regenerates
  a fresh token (so old links die when you revoke and re-share).
- Token: `secrets.token_urlsafe(16)` → ~22 chars, ~128 bits of entropy.

### RLS

Add a public-read policy alongside the existing owner-only policy:

```sql
create policy trips_public_read on public.trips
  for select using (share_token is not null);
```

Anonymous (anon-key) selects gain read access **only** to rows where
`share_token is not null`. Owner reads continue to work via the
existing `auth.uid() = user_id` policy.

Migration: `supabase/migrations/2026-05-03_trip_share_token.sql`.

### Why a column, not a separate table

A 1:1 child table would cost a join on every public read with no real
benefit. The column lives on trips, cascades cleanly on delete, and
gives RLS a simple predicate.

## API surface

| method   | path                              | auth | purpose |
| ---      | ---                               | ---  | --- |
| `POST`   | `/trips/{slug}/share`             | JWT  | Generate (or rotate) the token. Returns `{share_url, token}`. |
| `DELETE` | `/trips/{slug}/share`             | JWT  | Clear the token. Returns 204. |
| `GET`    | `/public/trips/{token}`           | none | Public read. Returns `PublicTrip` or 404. |

`POST /share` is **always rotating** — every press generates a fresh
token and invalidates the previous one. Frontend toast confirms.

The public route lives under `/public/*` so it's obviously
unauthenticated by URL inspection. No JWT verification middleware
applied to that prefix.

### Pydantic models

```python
class ShareOut(BaseModel):
    share_url: str
    token: str

class PublicTrip(BaseModel):
    slug: str
    destination: str
    days: int
    start_date: date | None
    document: TripDocument
    created_at: datetime
    # NOTE: no user_id, no airport_entry, no airport_exit, no travel_style.
    # travel_style now contains the profile addendum ("Knee injury, light
    # walking", "Interests: photography, food") — that's personal context
    # the friend doesn't need to see and may not want exposed.
```

`TripFull` (returned to the owner) gains an optional
`share_token: str | None = None` so the owner-side UI knows current
state without an extra round-trip.

### Routes

```python
# api/api/routes/share.py — owner-only routes
@router.post("/trips/{slug}/share", response_model=ShareOut)
def create_share(slug: str, user: CurrentUser) -> ShareOut: ...

@router.delete("/trips/{slug}/share", status_code=204)
def revoke_share(slug: str, user: CurrentUser) -> None: ...

# api/api/routes/public.py — anonymous public read
@router.get("/public/trips/{token}", response_model=PublicTrip)
def public_trip(token: str) -> PublicTrip: ...
```

### Token collision

128 bits is collision-resistant in practice. Belt-and-braces: the
unique constraint surfaces a duplicate at insert; the route catches
the integrity error and retries once with a fresh token. After two
attempts, raises 500.

### Public base URL

Returned `share_url` is built from `APP_BASE_URL` (env var, defaults
to `https://atlas.viggy.dev`). Format: `{APP_BASE_URL}/s/{token}`.

## Frontend

### Owner: Share popover

A "Share" button appears in the trip header next to PDF Export.
Clicking it anchors a small popover.

**State machine:**

- **Not shared** — single line of copy + "Generate share link" button.
  Click → POST → flips to shared state on success.
- **Shared** — read-only `<input>` with the URL pre-selected, "Copy"
  button, two small actions underneath: "Rotate link" and "Stop
  sharing". Footer hint: *"Anyone with the link can view this trip
  (budget hidden)."*
- **Loading / error** — small inline spinner / inline rose-coloured
  error.

**Header pill:** when `share_token != null`, show a tiny "Public" pill
next to the trip name. Click → opens the share popover.

### Public viewer (`/s/{token}`)

A new server-rendered route that fetches `GET /public/trips/{token}`
and renders the trip. No auth headers sent.

```
web/src/app/s/[token]/page.tsx        NEW: server shell
web/src/app/s/[token]/PublicView.tsx  NEW: stripped-down TripView
```

`PublicView` differs from `TripView` only in:
- No `UserMenu`.
- No `RefineInput` slot (hides the bottom row).
- `TripPanel` rendered with a new `readOnly` prop that omits the
  Budget tab and ignores any `onRefinePrefill` calls.
- No `PdfExportMenu`.
- No share button (the visitor IS the share recipient).
- Header shows trip name + days; small footer link "Created with
  Atlas — atlas.viggy.dev" (subtle CTA).

`Map.tsx`, `Itinerary.tsx`, `HotelCard.tsx`, `DayCard.tsx` are reused
unchanged — they're presentational.

### State management

- Owner trip page server-fetches the trip; `share_token` rides along
  on `TripFull`. The `<ShareMenu>` component takes
  `slug` + `initialToken: string | null` and tracks state locally.
- After POST/DELETE the menu updates state and triggers a soft refresh
  (`router.refresh()`) so the header pill stays in sync.

### Files

```
web/src/
├── app/s/[token]/
│   ├── page.tsx                       NEW: server shell
│   └── PublicView.tsx                 NEW: stripped-down TripView
├── components/
│   ├── ShareMenu.tsx                  NEW: owner popover
│   ├── TripPanel.tsx                  MODIFIED: optional readOnly prop
│   └── PublicShell.tsx                NEW: minimal header for /s/
├── app/trip/[slug]/TripView.tsx       MODIFIED: render <ShareMenu/>
├── lib/api.ts                         MODIFIED: createShare, revokeShare,
│                                                 getPublicTrip
└── lib/types.ts                       MODIFIED: TripFull.share_token,
                                                  PublicTrip
```

## Backend file structure

```
api/api/
├── routes/share.py                    NEW: POST/DELETE /trips/:slug/share
├── routes/public.py                   NEW: GET /public/trips/:token
├── models.py                          MODIFIED: PublicTrip, ShareOut,
│                                                 TripFull.share_token
├── routes/trips.py                    MODIFIED: include share_token in
│                                                 returned trip rows
└── main.py                            MODIFIED: include both new routers

api/tests/
├── test_routes_share.py               NEW
└── test_routes_public.py              NEW

supabase/migrations/
└── 2026-05-03_trip_share_token.sql    NEW
```

## Edge cases

| Case                                   | Behaviour |
| ---                                    | --- |
| Owner deletes a shared trip            | Cascade — public route 404s naturally. |
| Owner refines after sharing            | Public view shows latest. (Feature, not bug.) |
| Owner rotates the token                | Old URL 404s; new URL works. |
| Owner regenerates / edits budget       | No effect on the public view (budget hidden). |
| Owner changes their profile            | No effect on the public view (profile drives generation, not display). |
| Token collision on insert              | Catch IntegrityError, retry once with a fresh token. |
| Anonymous hits `/trips/:slug` for shared trip | Still 401. Public access is via `/public/trips/:token` only — the slug-based path stays owner-only. |
| Anonymous hits `/public/trips/garbage` | 404. |

## Acceptance criteria

1. Owner clicks Share → URL appears → incognito open renders the trip.
2. Public view shows itinerary + hotels + map; hides budget tab,
   refine input, delete button, PDF export, owner email.
3. Owner clicks Rotate → previous URL 404s; new URL works.
4. Owner clicks Stop sharing → URL 404s; menu reverts to the
   "Generate" state.
5. `GET /public/trips/{garbage}` → 404.
6. `GET /trips/{slug}` (owner-only path) still 401 for anonymous, even
   when the trip is shared.
7. Deleting a shared trip 404s its public URL.
8. RLS verified: anonymous Supabase queries return only rows where
   `share_token is not null`.
9. Header "Public" pill appears when shared, disappears when revoked.

## Privacy

- Token gives full read of the trip's itinerary, hotels, map, dates,
  destination. NOT budget, NOT owner identity, NOT structured airport
  fields, NOT travel_style (which contains the profile addendum).
- Anyone with the URL can read. Owner can revoke at any time.
- The public viewer surfaces the same Atlas-generated content the
  owner sees. Atlas does not store visitor IPs or analytics for v1.
