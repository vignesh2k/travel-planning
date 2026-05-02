# Atlas

A polished AI travel planner for the author and a small group of friends.
Live at **https://atlas.viggy.dev**.

Tell it about a trip in plain English — destination, days, what you love —
and it streams back a researched itinerary, neighbourhood-grouped hotels
with prefilled Booking links, and a map you can click through.

## Architecture

```
atlas.viggy.dev (Vercel) ──▶ api.atlas.viggy.dev (Cloud Run)
        │                              │
   Next.js + MapLibre               FastAPI
   Supabase Auth                    OpenRouter, Google Maps, fpdf2
        │                              │
        └──────── Supabase Postgres ───┘
                  (trips, messages,
                   allowed_emails)
```

- **`web/`** — Next.js 15+ frontend on Vercel. See [web/README.md](web/README.md).
- **`api/`** — FastAPI backend on Cloud Run. See [api/README.md](api/README.md).
- **`supabase/migrations/`** — initial Postgres schema with row-level security.
- **`docs/superpowers/specs/`** — design specs (D1 visual language, user flow).
- **`docs/superpowers/plans/`** — task-by-task implementation plans.

## Access

Sign-in is gated by an allowlist (`public.allowed_emails`) — Google OAuth
only. To add a new user, insert their email in the Supabase SQL editor:

```sql
insert into public.allowed_emails(email) values ('friend@example.com');
```

## Local dev

Backend:
```bash
cd api
python -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
cp .env.example .env  # fill in keys
uvicorn api.main:app --reload --port 8080
```

Frontend:
```bash
cd web
npm install
cp .env.local.example .env.local  # fill in keys
npm run dev  # http://localhost:3000
```

## Deploy

Backend → Cloud Run: `cd api && ./deploy.sh`
Frontend → Vercel: pushes to `main` auto-deploy.

## History

Originally a Streamlit app at `travel-planning-hrdbmkamc8gul6xjk2cbrp.streamlit.app`
(retired May 2026 — see `git log --diff-filter=D --name-only` for the cutover).
