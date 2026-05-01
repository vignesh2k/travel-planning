# Atlas — Travel Planner Redesign

**Status:** Design approved, plan pending.
**Date:** 2026-05-01.
**Replaces:** the existing Streamlit app at `app.py`.

## Goal

Migrate the Streamlit travel planner to a polished, responsive web app hosted at `atlas.viggy.dev`. Keep the Python LLM logic (it works), replace the UI entirely, and rethink the user flow so it feels like a modern AI product rather than a research form.

Tentative product name: **Atlas**.

## Audience and access

Personal tool for the author and a small group of friends. Google sign-in via Supabase Auth, gated by an `allowed_emails` allowlist. Not a public product — no rate limits, no per-user API keys, no monetization.

## Visual direction — "D1"

Frosted-glass / Apple Maps language with a warm palette. Selected during brainstorming over Linear-dark, Anthropic-cream, and Airbnb-bright alternatives.

- **Background:** cream gradient `#faf6f0 → #f3ebdf`
- **Accent:** amber/terracotta `#e8a85c → #c97a3a`
- **Text:** deep brown `#2a1f15`, muted `#9a7d5a`
- **Surfaces:** white at 65–95% opacity with `backdrop-filter: blur(20–28px)` and `0.5px` warm-tinted borders
- **Type:** SF Pro Display / Inter for headings (weight 600, letter-spacing -0.4 to -0.8), Inter for body
- **Radii:** 18px (panels), 14px (cards), 10px (buttons), 99px (pills)

Reference mockups: `.superpowers/brainstorm/26598-1777672278/content/visual-style-v2.html` (D1).

## User flow — "start as chat, end as map canvas"

### State 1 — Empty / chat
Hero with "Where to next?", a single chat input that accepts a free-form brief (`"7 days in Kyoto, vegetarian, photography focus, mid-October"`). Inline pills inside the input prompt for `Dates` and `Airports` if not detected. Three suggestion chips below the input ("Long weekend in Lisbon", "Surprise me", etc.) for cold-start. If the user is signed in and has trips, a `Trips` link in the top-right opens their history.

### State 2 — Generating
The hero collapses. The page transitions to State 3's layout immediately, with the map empty and the panel showing streaming progress messages ("Mapping neighbourhoods…", "Sourcing vegetarian restaurants…"). Pins drop on the map as `places` arrive via SSE. The existing plane SVG animation plays during this.

### State 3 — Generated / map canvas (desktop ≥900px)
Full-bleed warm Mapbox map. Frosted itinerary panel pinned on the left (≈330px wide), containing tabs `Itinerary | Restaurants | Where to stay` with day-by-day cards inside. A refine input docks at the panel bottom — this is the chat input from State 1, recontextualized. A floating top bar holds the trip title, `Share` and `Export PDF`.

### State 3 — Generated / map canvas (mobile <900px)
Same full-bleed map. Panel becomes a swipeable bottom sheet with three snap heights:
- **Peek** (~90px) — current day title + ‹ › arrows to flip days, map fully visible
- **Half** (~55%) — tabbed day list
- **Full** (~95%) — full panel including refine input

Reference mockups: `.superpowers/brainstorm/26598-1777672278/content/desktop-flow.html` and `mobile-flow.html`.

## Feature scope

| Feature | Status |
|---|---|
| Chat-style trip brief on empty state | New, replaces sidebar form |
| Streaming generation with progress + incremental pins | New |
| Map-as-canvas with frosted itinerary panel | New, replaces tabs |
| Refine via chat (docked input) | Kept, repositioned |
| Trip history per Google account | New |
| Suggestion chips for cold-start | Kept |
| Smart pills inside input (Dates, Airports) | New, replaces sidebar fields |
| **Hotels → Where to stay** | **Reworked.** Drop the live Booking.com search MCP. The LLM picks 3 neighbourhoods × 2–3 hotels each at trip-generation time. Each hotel renders as a card with an outbound link to Booking.com pre-filled with `checkin / checkout / group_adults / dest_id`. |
| PDF export | Kept (existing fpdf logic survives the migration) |
| `Share` button | New v1 stub — copies the trip URL. Recipients who are signed in and on `allowed_emails` see the trip; others hit the auth gate. No public links in v1. |

### Out of scope for v1
- Public read-only share links
- Calendar export (.ics)
- Inline editing of days outside chat (drag-to-reorder, manual delete)
- Multi-traveler collaboration / live co-editing

## Architecture

```
┌──────────────────────────────────────────┐
│  atlas.viggy.dev   (Vercel)              │
│  Next.js 15 — UI, auth, routing          │
└──────────────────┬───────────────────────┘
                   │ JWT-authed REST + SSE
                   ▼
┌──────────────────────────────────────────┐
│  api.atlas.viggy.dev   (Cloud Run)       │
│  FastAPI — LLM, geocoding, PDF, hotels   │
└─────┬──────────────────────────┬─────────┘
      │                          │
      ▼                          ▼
  Supabase Postgres        OpenRouter / Google Maps
  (users, trips, messages)
```

Two deployable units. No shared runtime; communication is HTTPS-only.

## Repo structure (monorepo)

```
travel-planning/
├── web/                  Next.js 15 (App Router) — frontend on Vercel
│   ├── app/
│   │   ├── page.tsx              empty/hero, or trip list if signed in
│   │   ├── trip/[slug]/page.tsx  generated trip
│   │   └── auth/callback/route.ts
│   ├── components/
│   │   ├── Map.tsx               Mapbox wrapper
│   │   ├── TripPanel.tsx         frosted left panel + bottom sheet
│   │   ├── RefineInput.tsx       docked chat
│   │   ├── DayCard.tsx
│   │   ├── HotelCard.tsx
│   │   └── ...
│   └── lib/
│       ├── api.ts                typed FastAPI client
│       └── supabase.ts           auth client
├── api/                  FastAPI — backend on Cloud Run
│   ├── main.py
│   ├── routes/
│   │   ├── trips.py
│   │   ├── refine.py
│   │   ├── hotels.py
│   │   └── pdf.py
│   ├── llm/                      prompts + JSON parsers (lifted from app.py)
│   ├── geocode.py                from app.py
│   ├── pdf.py                    fpdf logic from app.py
│   ├── auth.py                   Supabase JWT verification
│   └── Dockerfile
├── docs/superpowers/specs/
└── app.py                        kept until migration verified, then removed
```

## Data model (Supabase Postgres)

| Table | Columns |
|---|---|
| `users` | managed by Supabase Auth (Google OAuth) |
| `allowed_emails` | `email (pk)` — gate for sign-up |
| `trips` | `id (uuid), slug (text unique), user_id (fk), destination, days, travel_style, start_date, airport_entry, airport_exit, document (jsonb), places (jsonb), created_at, updated_at` |
| `messages` | `id, trip_id (fk), role ('user' \| 'assistant'), content, created_at` — refine history per trip |

Row-level security:
- **`trips`** — readable by any authenticated user on `allowed_emails` (so the `Share` button works for friends). Writable only by `auth.uid() = user_id`.
- **`messages`** — readable and writable only by `auth.uid() = user_id` (refine history is private to the trip owner).

## API surface (FastAPI)

All routes verify a Supabase JWT in `Authorization: Bearer <token>`.

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/trips` | Parse brief → stream generation via SSE → persist on completion. Returns `slug` in `done` event. |
| `GET` | `/trips` | List the caller's trips (id, slug, destination, days, created_at). |
| `GET` | `/trips/:slug` | Full trip JSON including `document`, `places`, `messages`. |
| `POST` | `/trips/:slug/refine` | Append user message, regenerate affected sections via LLM, stream a diff via SSE, persist on completion. |
| `POST` | `/trips/:slug/hotels` | Body: `{ neighborhood }`. Returns 2–3 hotel suggestions with prefilled Booking URLs. (May be called eagerly at trip-generation time and cached in `document.hotels` rather than per-request — TBD during plan.) |
| `GET` | `/trips/:slug/pdf` | Streams a generated PDF (existing `fpdf` logic). |

### SSE event shape (`POST /trips`)

```
event: status   data: "Mapping neighbourhoods…"
event: status   data: "Sourcing vegetarian restaurants…"
event: places   data: [{name, lat, lng, category, description}, ...]
event: section  data: {section: "itinerary", markdown: "..."}
event: done     data: {slug: "kyoto-7d"}
```

Streaming dodges Cloud Run's per-response limit because data flows continuously. The existing 30–90s LLM call becomes a 30–90s stream rather than a single late response.

## Maps

**Mapbox GL JS** in the browser. Custom style authored in Mapbox Studio matched to D1: cream basemap, terracotta water, amber roads, low-saturation greens. Pin colors carry over from `CATEGORY_RGB` in `app.py`:

| Category | Color |
|---|---|
| neighbourhood | `#4285f4` (kept) |
| restaurant | `#34a853` (kept) |
| photography_spot | `#ea4335` (kept) |
| logistics | `#9334e6` (kept) |

Free tier (50k loads/mo) covers expected usage by orders of magnitude.

## Auth

Supabase Auth, Google OAuth provider only. Sign-in flow:
1. User clicks `Sign in with Google` on the hero.
2. Supabase redirects to Google, returns to `/auth/callback`.
3. Server checks `allowed_emails` for the returned email; if absent, signs the user out and shows a "request access" message.
4. On success, session cookies are set; subsequent requests carry the JWT.

The FastAPI side verifies the JWT against Supabase's JWKS on every request.

## Hosting and DNS

| Domain | Target | Plan |
|---|---|---|
| `atlas.viggy.dev` | Vercel (CNAME) | Hobby (free) |
| `api.atlas.viggy.dev` | Cloud Run (CNAME via Cloud Run domain mappings) | Free tier — scales to zero |
| Supabase project | Supabase | Free tier (500MB DB, 50k MAU) |

Expected monthly cost at design time: **$0**, plus OpenRouter and Google Maps API spend (unchanged from today).

## Migration plan (sketch — full plan in writing-plans output)

1. Stand up `web/` and `api/` skeletons in the existing repo. Keep `app.py` running.
2. Lift LLM functions, geocoding, and PDF generation from `app.py` into `api/`. Add Pydantic models.
3. Wire Supabase, JWT verification, trips/messages tables.
4. Build the Mapbox style and `Map.tsx` against a hardcoded fixture trip.
5. Build `TripPanel` and `RefineInput` for desktop, then add the bottom-sheet variant for mobile.
6. Wire the empty hero, streaming generation, and refine round-trip.
7. Replace hotel search with the neighbourhood-link-out flow.
8. Hook up PDF export.
9. Deploy `web/` to Vercel and `api/` to Cloud Run, configure DNS.
10. Cut over: stop sharing the Streamlit URL, delete `app.py`.

## Open questions deferred to the plan
- Whether to call hotels lazily per-neighborhood or eagerly during trip generation (cost vs. latency tradeoff).
- Whether refine streams diffs against the existing document or replaces whole sections.
- Mapbox custom-style authoring — accept default style first, refine to D1 later if needed.
