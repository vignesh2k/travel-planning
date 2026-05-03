# Budget Tracking

**Status:** Design.
**Date:** 2026-05-03.
**Part of:** v2 feature batch (preferences ✓ → **budget** → share → routes → offline).

## Goal

Tell the user how much their generated trip will cost, in destination
currency with a GBP equivalent. Let them adjust per-day estimates and
add planned line items ("Spa: £80", "Cooking class: £45"). Show a
categorised cost breakdown in the printable PDF.

This is a *planner*, not a tracker. There is no "log actuals during
the trip" mode and no receipt scanner.

## Why now

The travel-preferences profile shipped a `budget` tier (cheap / mid /
premium) which already steers the LLM. Budget tracking is the natural
next step: now that the LLM knows the tier, it can produce a numeric
estimate per day. The other v2 features (share, routes, offline) don't
depend on budget — but a trip page without any cost signal feels
incomplete.

## User-visible surface

### Trip page — Budget tab

Sibling to Itinerary and Hotels in `TripPanelTabs`.

- **Header:** trip total — "**£1,240** — ¥186,000".
- **Per-day rows:**
  - `Day N · {title}` left.
  - Editable estimate cell — shows `¥18,000 (£94)`. Inline-edit on
    click, debounced PUT 800ms after last keystroke.
  - "+ Add item" → name + amount fields. Added items list under each
    day. Hover-X to delete.
  - Day total in the right gutter — `(override or LLM_estimate) +
    sum(items)`.
- **Footer:** small "Refresh estimates" link → POST regenerate. Shows
  FX rate snapshot date.

### Trip page — Itinerary tab

Each `DayCard` header gets a small `£94` pill on the right. Click →
switches to Budget tab and scrolls to that day's row.

### Empty state

If the budget LLM call failed at trip creation, the Budget tab shows a
"Generate budget" button → calls regenerate.

### FX-rate freshness hint

If the snapshot date is older than 30 days, show a yellow line above
the totals: "Rate from {date} — refresh?" with a one-click action.

### PDF — Estimated costs page

A new "Estimated costs" page in the PDF, default ON in the Export menu
(toggleable alongside Food / Photos / Tips):

- 4 category rows: **Lodging · Food · Activities · Transport**.
- Each row: category name, amount in destination currency, GBP
  equivalent, and a thin amber bar visualising relative weight.
- Total at the bottom in both currencies.
- Small disclaimer footer: "Estimates based on the itinerary; actual
  prices vary."

## Data model

### `trip_budgets` table

```sql
create table public.trip_budgets (
  trip_id        uuid primary key references public.trips(id) on delete cascade,
  currency       text not null,            -- ISO 4217: "JPY", "EUR"
  gbp_rate       numeric(12,6) not null,   -- snapshotted at generation
  gbp_rate_date  date not null,
  days           jsonb not null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
```

`days` shape:

```json
[
  {
    "number": 1,
    "title": "Arrival in Kyoto",
    "estimated": 18000,
    "override": null,
    "items": [{"name": "Cooking class", "amount": 4500}]
  }
]
```

### RLS

```sql
alter table public.trip_budgets enable row level security;

create policy trip_budgets_select on public.trip_budgets
  for select using (
    exists (select 1 from public.trips t
            where t.id = trip_id and t.user_id = auth.uid())
  );
-- mirror for insert/update/delete
```

Migration: `supabase/migrations/2026-05-03_trip_budgets.sql`.

## Why a separate table

`trips` is already the busiest table in the schema (slug, destination,
days, travel_style, document JSONB, places JSONB, dates, airports). A
JSONB column on `trips` would work but couples budget reads and writes
to the trip row, and complicates RLS for partial updates. Keeping
`trip_budgets` as a 1:1 child makes the Budget tab independently
fetchable, the PUT-day route a single-row update, and the cascade on
delete free.

## API surface

| method | path                                         | purpose |
| ---    | ---                                          | --- |
| `GET`  | `/trips/{slug}/budget`                       | Returns the budget, or 404 if not generated. |
| `POST` | `/trips/{slug}/budget/regenerate`            | Re-runs LLM + re-fetches FX. **Preserves the user's `override` and `items` per day-number where possible**; new `estimated` values from the LLM. |
| `PUT`  | `/trips/{slug}/budget/days/{n}`              | Update one day's `override` and `items`. |

All routes JWT-verified. The handler verifies the trip belongs to the
caller (`trips.user_id == sub`), 403 on mismatch — RLS is the second
line of defence.

### Pydantic models

```python
class BudgetItem(BaseModel):
    name: str = Field(..., min_length=1, max_length=80)
    amount: int = Field(..., ge=0)

class BudgetDayIn(BaseModel):
    override: int | None = Field(None, ge=0)
    items: list[BudgetItem] = Field(default_factory=list, max_length=20)

class BudgetDay(BudgetDayIn):
    number: int
    title: str
    estimated: int

class Budget(BaseModel):
    trip_id: str
    currency: str            # ISO 4217
    gbp_rate: float
    gbp_rate_date: date
    days: list[BudgetDay]
    updated_at: datetime
```

## LLM call

A new helper at `api/api/llm/budget.py`:

```python
def budget_estimate(
    destination: str,
    days: int,
    travel_style: str,
    day_titles: list[str] | None = None,
) -> BudgetEstimateRaw:
    """Single LLM call. Returns currency code + per-day numbers in that
    currency. Uses gemini-2.5-flash-lite (cheap, fast, structured)."""
```

Prompt asks for:
- ISO currency code for the destination ("JPY" for Kyoto, "EUR" for Lisbon).
- A per-day amount in that currency, sized to the brief's tier (the
  profile addendum is already prepended onto `travel_style`, so the
  cheap/mid/premium signal flows in for free).

Output schema (Pydantic):

```python
class BudgetEstimateRaw(BaseModel):
    currency: str            # ISO 4217
    days: list[BudgetEstimateDay]

class BudgetEstimateDay(BaseModel):
    number: int
    estimated: int           # in destination currency, no decimals
```

`day_titles` is optional and unused at trip-creation time (day titles
don't exist yet). Future: regenerate could pass titles from the
`PdfPlan` if one has been built. v1 always passes `None`.

## FX module

`api/api/fx.py`:

```python
@dataclass(frozen=True)
class FxRate:
    rate: float
    fetched_on: date

def get_gbp_rate(currency: str) -> FxRate:
    """Fetch {currency} → GBP rate from frankfurter.app. Cached
    per-currency for 24h in-process (functools-style memo with TTL)."""
```

Provider: `https://api.frankfurter.app/latest?from=JPY&to=GBP`. Free,
no auth, ECB rates. If GBP is requested as base currency we short-
circuit to `1.0`.

Failure path: if the fetch errors, `regenerate` returns 502 with a
clear message. `GET /budget` returns the existing snapshotted rate
unchanged.

## Trip-creation integration

Today the streaming flow runs `parse_brief` and `stream_travel_research`
in parallel. Adding a third parallel arm:

```
parse_brief         \
stream_research      } parallel
budget_estimate     /
```

Implementation: extend the existing `ThreadPoolExecutor(max_workers=3)`
in `api/api/routes/trips.py::create_trip_stream`. Use the **fast-
extracted** destination/days when available; otherwise wait for
`parse_brief` to finish before kicking off the budget call. The
`travel_style` passed to the budget LLM is the same combined style
(profile addendum + brief style).

After all three resolve:
1. `get_gbp_rate(estimate.currency)` → snapshot.
2. Build `days` from the per-day estimates (override=None, items=[]).
3. Insert into `trip_budgets`.

If the budget call or FX fetch raises, **trip creation still succeeds**
— the missing budget surfaces as the empty state on the Budget tab.

The synchronous `POST /trips` route (rarely used; mostly a fallback)
gets the same treatment with a smaller change: budget runs serially
after research, errors logged + swallowed.

## PDF cost categories

A new helper `api/api/llm/pdf_costs.py`:

```python
def estimate_pdf_costs(
    destination: str,
    travel_style: str,
    pdf_plan: PdfPlan,
    hotels: list[Hotel],
    budget: Budget | None,
) -> PdfCosts:
    """One LLM pass. Reads the day plans + hotel choices + (if the user
    set them) the day overrides as anchors, returns Lodging/Food/
    Activities/Transport totals in destination currency."""
```

Output schema:

```python
class PdfCostCategory(BaseModel):
    name: Literal["Lodging", "Food", "Activities", "Transport"]
    amount: int          # destination currency
    gbp_amount: int

class PdfCosts(BaseModel):
    currency: str
    gbp_rate: float
    categories: list[PdfCostCategory]
    total_local: int
    total_gbp: int
```

`PdfPlan` gains a nullable `costs: PdfCosts | None` field. Renderer
draws the new section as a single page when `sections.costs is True`
AND `plan.costs is not None`.

`PdfSections` gains `costs: bool = True`. The Export menu adds a
Costs checkbox.

The cost-estimate LLM call runs **after** all per-day plans complete
in `stream_pdf_plan`. If it fails, the PDF still renders without the
costs page. Streamed `stage` event: `costs` (Compiling cost estimate).

### Why a separate LLM pass instead of folding into per-day calls

Per-day calls already produce schedule, food, photos, and tips. The
costs section needs a trip-wide view (especially lodging, which spans
nights and depends on hotel picks). Folding it into per-day calls
would require each call to know about hotels and budget anchors, which
they currently don't. A single trip-wide pass is cleaner.

## Frontend file structure

```
web/src/
├── lib/
│   ├── budget.ts                NEW: useBudget(slug) hook + API
│   ├── api.ts                   MODIFIED: getBudget, regenerateBudget,
│   │                                       updateBudgetDay
│   └── types.ts                 MODIFIED: Budget, BudgetDay, BudgetItem,
│                                          PdfCosts, PdfCostCategory
├── components/
│   ├── BudgetTab.tsx            NEW: full breakdown view
│   ├── BudgetDayRow.tsx         NEW: editable estimate + items list
│   ├── BudgetItemRow.tsx        NEW: single line item with delete
│   ├── DayCard.tsx              MODIFIED: budget pill in header
│   ├── TripPanelTabs.tsx        MODIFIED: add Budget tab
│   └── PdfExportMenu.tsx        MODIFIED: add Costs checkbox
└── app/trip/[slug]/page.tsx     MODIFIED: server-fetch budget for
                                            initial render
```

## State management

A single `useBudget(slug)` hook in `lib/budget.ts`:

- Initial server render fetches budget (so the Itinerary pills appear
  on first paint without flash).
- Client-side cache keyed by slug. Mutations (PUT day, regenerate)
  optimistically update the cache, rollback on error, toast on
  failure.
- Edits debounced 800ms.

No SWR / TanStack Query introduced — the hook is small (~80 lines) and
adding a library for a single feature would be premature.

## Currency display

A small helper `lib/currency.ts`:

```ts
export function formatLocal(amount: number, currency: string): string;
export function formatGbp(amount: number): string;
export function combined(local: number, currency: string, gbp: number): string;
// → "¥18,000 (£94)"
```

Backed by `Intl.NumberFormat`. Currency symbol comes from
`Intl.NumberFormat(...).formatToParts()` — no hardcoded symbol map.

## Out of scope for v1

- **Categories in the in-app Budget tab.** Only the PDF gets the
  category breakdown. The tab keeps a simple per-day model so users
  don't have to allocate their items into buckets.
- **Multi-currency display preferences.** GBP is hardcoded as the
  comparison currency. Other users can request alternatives if the
  app gets shared more broadly.
- **Hotel-cost auto-merge.** The Hotels tab is its own flow; the
  Budget tab does not pull from it. Users can add hotel costs as line
  items if they want.
- **Trip-comparison budgets.** "Similar trips averaged £X" — out of
  scope.
- **Mid-trip "log actuals" mode.** This is a planner.
- **Per-item categorisation by the user.** Items in the Budget tab
  are uncategorised; the PDF cost breakdown is LLM-derived from the
  itinerary, not user input.

## Acceptance criteria

1. Creating a new trip results in a `trip_budgets` row with per-day
   estimates in the destination's currency and a snapshotted GBP rate.
2. Budget data is server-fetched alongside the trip, so the Budget
   tab renders instantly on first click (no loading state when budget
   exists). Trip total + per-day rows show in destination currency
   with GBP alongside.
3. Editing a day's override and adding/removing line items persists
   via PUT and updates the day total in the gutter immediately.
4. Itinerary tab DayCards show the budget pill, click jumps to the
   matching Budget tab row.
5. "Refresh estimates" updates the budget row with new LLM-derived
   `estimated` values and a fresh FX rate, **preserving any per-day
   `override` and `items` the user had set**.
6. Building a PDF with the Costs section enabled produces a page with
   four category bars, GBP equivalents, and a total.
7. Disabling the Costs section in the Export menu omits the page.
8. RLS verified: a token from user A cannot read or write user B's
   budget.
9. Trip creation still succeeds when the budget LLM call or FX fetch
   fails — empty-state surfaces correctly.
10. Existing trips (created before this feature shipped) show the
    empty state on the Budget tab and offer "Generate budget".

## Privacy

`trip_budgets` is per-trip and inherits the trip's owner via RLS. No
data leaves Atlas except the ECB FX request to frankfurter.app
(currency code only — no trip data).
