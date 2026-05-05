# Atlas Web

Next.js frontend for Atlas, the map-first AI travel planner at
`atlas.viggy.dev`.

## What It Does

- Authenticates users with Supabase Google OAuth.
- Streams trip generation from the FastAPI backend.
- Renders trip maps with MapLibre and route overlays.
- Shows itineraries, hotel suggestions, budgets, sharing controls, PDFs, and offline today views.
- Uses Supabase only for auth/session handling; trip data goes through the API.

## Getting Started

Install dependencies and copy the local environment template:

```bash
cd web
npm install
cp .env.local.example .env.local
```

Fill in `NEXT_PUBLIC_API_BASE`, `NEXT_PUBLIC_SUPABASE_URL`, and
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, then run:

```bash
npm run dev
```

Open `http://localhost:3000`.

## Checks

```bash
npm run lint
npm run build
```

## Notes

- Service workers are disabled on localhost by `ServiceWorkerRegister`; test offline behaviour with a production or preview build.
- Request session refresh lives in `src/proxy.ts`, the Next 16 replacement for the older `middleware.ts` convention.
- The trip panel consumes structured itinerary fields returned by the API. Keep markdown parsing on the backend model side so existing saved trips still hydrate consistently.

## Deploy

Pushes to `main` deploy through Vercel.
