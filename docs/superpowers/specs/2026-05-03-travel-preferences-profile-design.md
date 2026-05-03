# Travel Preferences Profile

**Status:** Design.
**Date:** 2026-05-03.
**Part of:** v2 feature batch (preferences → budget → share → routes → offline).

## Goal

Stop making the user retype "vegetarian, photography focus, mid-budget,
balanced pace" into every chat brief. Capture a per-user preferences
profile once and have it silently augment every LLM call (research,
hotels, PDF augment, refine).

## Why this is the foundation feature

Every other v2 feature gets cheaper or better when this exists:

- **Budget tracking** plugs into the same `budget` field
- **Share links** can show "viewing as a guest, your profile not applied"
- **Routes** care about pace ("packed" days route differently)
- **Offline / Today** keeps profile cached locally
- The brief input on the empty state can shrink to just *where* and *when*

## Data model

New Supabase table `public.user_profiles`:

| column        | type                                                              | notes                                       |
| ---           | ---                                                               | ---                                         |
| `user_id`     | `uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE`    | one row per user                            |
| `diet`        | `text`                                                            | freeform: "vegetarian", "pescatarian", "no shellfish, halal" |
| `budget`      | `text CHECK (budget IN ('cheap','mid','premium'))`                | nullable                                    |
| `pace`        | `text CHECK (pace IN ('relaxed','balanced','packed'))`            | nullable                                    |
| `interests`   | `text[] DEFAULT '{}'`                                             | tags like "photography", "hiking", "food"   |
| `notes`       | `text`                                                            | catch-all: "always travel with parents", "knee injury, light walking", etc. |
| `created_at`  | `timestamptz NOT NULL DEFAULT now()`                              |                                             |
| `updated_at`  | `timestamptz NOT NULL DEFAULT now()`                              | bumped on every write                       |

**RLS:**
- `select` / `insert` / `update` / `delete` only when `auth.uid() = user_id`.
- `is_allowed()` not required — your own profile is always yours.

Migration: `supabase/migrations/2026-05-03_user_profiles.sql`.

## API surface

| method | path           | purpose |
| ---    | ---            | ---     |
| `GET`  | `/me/profile`  | Returns the caller's profile, or `null` if never set. |
| `PUT`  | `/me/profile`  | Upsert the profile. Body matches the model. Returns the saved row. |

Both routes JWT-verified the same way as `/trips/*`.

### Pydantic models

```python
class UserProfileIn(BaseModel):
    diet: str | None = None
    budget: Literal["cheap", "mid", "premium"] | None = None
    pace: Literal["relaxed", "balanced", "packed"] | None = None
    interests: list[str] = []
    notes: str | None = None

class UserProfile(UserProfileIn):
    updated_at: datetime
```

## How the profile reaches the LLMs

A single helper function lives in `api/api/llm/profile.py`:

```python
def profile_addendum(p: UserProfile | None) -> str:
    """Render a profile into a one-paragraph style addendum suitable for
    prepending to any brief.travel_style."""
    if not p: return ""
    parts: list[str] = []
    if p.diet:      parts.append(p.diet)
    if p.budget:    parts.append(f"{p.budget} budget")
    if p.pace:      parts.append(f"{p.pace} pace")
    if p.interests: parts.append("Interests: " + ", ".join(p.interests))
    if p.notes:     parts.append(p.notes)
    return ". ".join(parts)
```

Used in three call sites — wherever we today take `travel_style` as input
to the LLM:

| Call site                                     | Change |
| ---                                           | --- |
| `routes/trips.py` create_trip + stream        | fetch profile, prepend addendum to `parsed.travel_style` |
| `routes/refine.py`                            | nothing — refine instruction already specifies what changes |
| `routes/pdf.py` build_pdf                     | fetch profile, prepend addendum to `travel_style` passed to `stream_pdf_plan` |
| `llm/hotels.py` suggest_hotels                | accept optional profile, factor budget tier into the prompt |

The profile addendum goes BEFORE the brief's stated travel_style so brief-
specific overrides win. Example combined string:

```
vegetarian. mid budget. balanced pace. Interests: photography, food.
Knee injury, light walking only. ALSO: 5-day Kyoto trip, want to see
autumn leaves
```

## Frontend

### Pages
- `web/app/profile/page.tsx` — full settings form
- `UserMenu` already in `web/components/UserMenu.tsx` gets a "Preferences" link above "Log out"

### Form fields
- **Diet** — text input with quick-fill chips (Vegetarian / Vegan / Pescatarian / No restrictions). Free-form so people can write "vegetarian, no mushrooms".
- **Budget** — three-button toggle (Cheap / Mid / Premium) + a "skip" option.
- **Pace** — three-button toggle (Relaxed / Balanced / Packed) + skip.
- **Interests** — multi-select chip list with a custom "+ add" input. Defaults: Food · Photography · Hiking · History · Nightlife · Beach · Museums · Architecture · Nature · Shopping.
- **Notes** — textarea, 500-char max. Placeholder: "Anything else? E.g. travelling with parents, light walker, hate seafood, prefer mornings."

### Empty-state nudge

If the user has no profile and lands on the home page, show a subtle banner above the chat input:

> ✨ Set your travel preferences to make every trip smarter — [Open preferences →]

Dismissable, only shows if `profile === null`. Once they've set anything, the banner disappears.

### State management
- Profile fetched on the home page server component (so the empty-state banner shows immediately)
- Profile page client-fetches its own state and PUTs on save
- After save: `router.refresh()` so the home banner disappears

## Backend file structure

```
api/api/
├── routes/
│   └── profile.py          NEW: GET/PUT /me/profile
├── llm/
│   └── profile.py          NEW: profile_addendum() helper
├── routes/trips.py         MODIFIED: fetch + addendum
├── routes/pdf.py           MODIFIED: fetch + addendum
└── llm/hotels.py           MODIFIED: optional budget input

supabase/migrations/
└── 2026-05-03_user_profiles.sql   NEW: table + RLS
```

```
web/src/
├── app/profile/page.tsx    NEW: server-rendered shell
├── components/
│   ├── ProfileForm.tsx     NEW: client-side form
│   ├── ProfileBanner.tsx   NEW: empty-state nudge for home
│   └── UserMenu.tsx        MODIFIED: add "Preferences" link
└── lib/
    ├── api.ts              MODIFIED: getProfile() + saveProfile()
    └── types.ts            MODIFIED: UserProfile, UserProfileIn
```

## Brief input shrinks naturally

Once profiles exist, the chat input on the home page can change its
placeholder from:

> "7 days in Kyoto, vegetarian, photography focus, mid-October…"

to:

> "Where to next? E.g. 7 days in Kyoto, mid-October"

Diet, budget, pace, interests come from the profile by default. Optional
v2.5 polish: show "Using your preferences" pill under the input with a
toggle to ignore the profile for this brief (e.g. planning a trip for
someone else).

## Migration / backfill

No backfill needed. Existing trips stay intact. Profile is only consumed
on FUTURE trip creates / refines / PDF builds. Trips created before a
user sets their profile are unaffected.

## Privacy

The profile is per-user, never shared. RLS scopes reads to `auth.uid() =
user_id`. Service role bypasses RLS — only used server-side in our
backend, never exposed.

## Out of scope for v1
- Per-trip overrides UI ("ignore my profile this time")
- Multiple profiles per user (solo vs family vs work)
- Profile sharing with travel partners
- Profile import from past trips ("auto-detect: you've been vegetarian in
  every previous brief — set it as your profile?")

## Acceptance criteria
1. User can open `/profile`, fill in any subset of fields, save successfully.
2. After save, `GET /me/profile` returns the saved row.
3. Creating a new trip without typing diet/budget/pace pulls them from the profile.
4. Building a PDF reflects the profile in restaurant + tips choices.
5. RLS verified: a token from user A cannot read or write user B's profile.
6. Empty-state banner shows on home page only when profile is null.
7. Existing trips and refine flow work identically (no regression).
