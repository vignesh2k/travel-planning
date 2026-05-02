# Atlas — Frontend Cutover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Next.js 15 frontend at `atlas.viggy.dev` that consumes the Atlas FastAPI backend (already live on Cloud Run). Replicate the chat-first → map-canvas user flow with the warm-frosted-glass D1 visual language. Sunset the Streamlit `app.py` once shipped.

**Architecture:** Single Next.js App Router app under `web/`. Supabase JS handles Google OAuth and RLS-respecting reads of trip metadata; mutations go through the FastAPI backend over JWT. Mapbox GL JS renders the map (free tier). The bottom sheet uses `vaul`. State is local React + URL — no Redux. Deployed on Vercel hobby tier with a custom domain CNAME.

**Tech Stack:** Next.js 15 (App Router, RSC + Server Actions where natural), TypeScript, Tailwind CSS v3, `@supabase/ssr`, Mapbox GL JS, `vaul`, `lucide-react` icons, Vercel.

**Spec reference:** [docs/superpowers/specs/2026-05-01-atlas-travel-planner-redesign-design.md](../specs/2026-05-01-atlas-travel-planner-redesign-design.md)

**Backend already live:** `https://atlas-api-598507134096.us-central1.run.app` (will switch to `https://api.atlas.viggy.dev` once cert finishes provisioning).

---

## File structure

```
web/
├── package.json
├── tsconfig.json
├── next.config.ts
├── tailwind.config.ts
├── postcss.config.mjs
├── .env.local.example
├── README.md
├── app/
│   ├── layout.tsx                 root layout, fonts, theme
│   ├── globals.css                Tailwind base + D1 tokens
│   ├── page.tsx                   empty hero / trip list (auth-aware)
│   ├── trip/
│   │   └── [slug]/page.tsx        trip detail (map canvas + panel)
│   ├── auth/
│   │   ├── callback/route.ts      Supabase OAuth callback
│   │   └── signin/page.tsx        sign-in view
│   └── api/
│       └── trips/
│           └── stream/route.ts    SSE proxy (browser → /trips/stream)
├── components/
│   ├── BrandMark.tsx              "Atlas" logo
│   ├── ChatInput.tsx              hero input + smart pills
│   ├── DayCard.tsx                one day in itinerary
│   ├── HotelCard.tsx              hotel with Booking link
│   ├── Map.tsx                    Mapbox wrapper
│   ├── MobileSheet.tsx            vaul-based bottom sheet (3 snap heights)
│   ├── RefineInput.tsx            docked chat input on trip page
│   ├── SignInButton.tsx           Google OAuth trigger
│   ├── SuggestionChips.tsx        cold-start suggestions
│   ├── TripPanel.tsx              frosted glass left panel (desktop)
│   ├── TripPanelTabs.tsx          Itinerary | Restaurants | Where to stay
│   ├── TripsList.tsx              user's saved trips dropdown
│   └── ui/                        small primitives (Button, IconButton)
├── lib/
│   ├── api.ts                     typed fetch client for Atlas API
│   ├── supabase/
│   │   ├── client.ts              browser client
│   │   ├── server.ts              server client + cookie wiring
│   │   └── middleware.ts          session refresh middleware
│   ├── theme.ts                   D1 design tokens (re-used by Tailwind)
│   ├── streamingTrip.ts           parse SSE → state updates
│   └── types.ts                   Trip / Place / Hotel / Neighborhood types
├── middleware.ts                  Supabase session refresh on every request
└── public/
    └── (favicon etc.)
```

The existing `app.py`, `api/`, `supabase/`, `docs/` directories are untouched until the final cutover task.

---

## Phase 1 — Project skeleton

### Task 1: Bootstrap the Next.js app

**Files:**
- Create: `web/` directory via `create-next-app`
- Modify: `web/.gitignore` (add nothing extra; defaults are fine)

- [ ] **Step 1: Create the app**

```bash
cd /Users/viggy/travel-planning
npx --yes create-next-app@latest web \
  --typescript \
  --tailwind \
  --app \
  --eslint \
  --src-dir false \
  --import-alias "@/*" \
  --turbopack \
  --no-install
cd web
npm install
```

- [ ] **Step 2: Smoke run**

```bash
cd /Users/viggy/travel-planning/web
npm run dev > /tmp/atlas-web-dev.log 2>&1 &
sleep 5
curl -sf http://localhost:3000 | head -1
kill %1 2>/dev/null
```
Expected: a `<!DOCTYPE html>` line, no errors in `/tmp/atlas-web-dev.log`.

- [ ] **Step 3: Add `web/` to root `.gitignore` exclusions if needed**

Look at `/Users/viggy/travel-planning/.gitignore` — confirm `node_modules` is covered (Next's local gitignore handles it inside `web/`). No edit needed unless you spot a leak.

- [ ] **Step 4: Commit**

```bash
cd /Users/viggy/travel-planning
git add web/
git status  # confirm no node_modules, no .next/
git commit -m "$(cat <<'EOF'
Bootstrap Next.js 15 app under web/

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: D1 design tokens via Tailwind config

**Files:**
- Modify: `web/tailwind.config.ts`
- Modify: `web/app/globals.css`
- Create: `web/lib/theme.ts`

- [ ] **Step 1: Define tokens in `web/lib/theme.ts`**

```typescript
export const theme = {
  colors: {
    cream: { 50: "#faf6f0", 100: "#f3ebdf", 200: "#ebe1d0" },
    ink: { 900: "#2a1f15", 700: "#6b5840", 500: "#9a7d5a", 300: "#c9b394" },
    amber: { 400: "#e8a85c", 500: "#d8924a", 600: "#c97a3a", 700: "#a85f25" },
    sage: { 500: "#3a8a5a" },
    rose: { 500: "#c44a44" },
    plum: { 500: "#9534e6" },
  },
  radius: { panel: "18px", card: "14px", button: "10px", pill: "9999px" },
  blur: { panel: "28px", chip: "16px" },
} as const;
```

- [ ] **Step 2: Replace `web/tailwind.config.ts`**

```typescript
import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        cream: { 50: "#faf6f0", 100: "#f3ebdf", 200: "#ebe1d0" },
        ink: { 900: "#2a1f15", 700: "#6b5840", 500: "#9a7d5a", 300: "#c9b394" },
        amber: { 400: "#e8a85c", 500: "#d8924a", 600: "#c97a3a", 700: "#a85f25" },
        sage: { 500: "#3a8a5a" },
        rose: { 500: "#c44a44" },
      },
      borderRadius: { panel: "18px", card: "14px", btn: "10px" },
      fontFamily: {
        display: ['"SF Pro Display"', "Inter", "system-ui", "sans-serif"],
        sans: ["Inter", "system-ui", "sans-serif"],
      },
      backgroundImage: {
        "cream-gradient": "linear-gradient(180deg, #faf6f0 0%, #f3ebdf 100%)",
      },
    },
  },
  plugins: [],
};

export default config;
```

- [ ] **Step 3: Replace `web/app/globals.css`**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  color-scheme: light;
}

html, body {
  background: linear-gradient(180deg, #faf6f0 0%, #f3ebdf 100%);
  color: #2a1f15;
  font-family: Inter, "SF Pro Display", system-ui, sans-serif;
  -webkit-font-smoothing: antialiased;
}

@layer components {
  .frosted {
    @apply bg-white/65 border border-amber-700/10 backdrop-blur-2xl;
    box-shadow: 0 6px 20px rgba(140, 80, 30, 0.06);
  }
  .frosted-strong {
    @apply bg-white/85 border border-amber-700/10 backdrop-blur-2xl;
    box-shadow: 0 8px 32px rgba(140, 80, 30, 0.1);
  }
  .pill {
    @apply inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs;
    @apply bg-amber-400/15 text-amber-700 border border-amber-400/20;
  }
}
```

- [ ] **Step 4: Replace `web/app/layout.tsx`**

```tsx
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Atlas — your travel companion",
  description: "Plan trips with AI. Map first.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
```

- [ ] **Step 5: Stub a hero on `web/app/page.tsx`**

```tsx
export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6 gap-6">
      <h1 className="font-display text-4xl font-semibold tracking-tight text-ink-900">
        Where to next?
      </h1>
      <p className="text-ink-500 max-w-md text-center">
        Tell me about your trip in plain English — destination, days, what you love.
      </p>
      <div className="frosted-strong w-full max-w-xl rounded-panel p-4">
        <input
          className="w-full bg-transparent outline-none text-sm text-ink-900 placeholder:text-ink-500"
          placeholder="7 days in Kyoto, vegetarian, photography focus, mid-October…"
        />
      </div>
    </main>
  );
}
```

- [ ] **Step 6: Visual smoke test**

```bash
cd /Users/viggy/travel-planning/web
npm run dev > /tmp/atlas-web-dev.log 2>&1 &
sleep 4
open http://localhost:3000
# Verify: warm cream background, dark amber/brown text, frosted card around the input.
# Press Ctrl-C to stop dev server before continuing.
```

- [ ] **Step 7: Commit**

```bash
cd /Users/viggy/travel-planning
git add web/
git commit -m "Apply D1 visual theme (cream + amber + frosted glass)"
```

---

### Task 3: API client + shared types

**Files:**
- Create: `web/lib/types.ts`
- Create: `web/lib/api.ts`
- Create: `web/.env.local.example`

- [ ] **Step 1: Mirror Pydantic models in `web/lib/types.ts`**

```typescript
export type Category = "neighbourhood" | "restaurant" | "photography_spot" | "logistics";

export interface Place {
  name: string;
  category: Category;
  description: string;
  lat: number | null;
  lng: number | null;
}

export interface Hotel {
  name: string;
  description: string;
  booking_url: string;
}

export interface Neighborhood {
  label: string;
  description: string;
  hotels: Hotel[];
}

export interface TripDocument {
  document_markdown: string;
  places: Place[];
  neighborhoods: Neighborhood[];
}

export interface TripSummary {
  id: string;
  slug: string;
  destination: string;
  days: number;
  created_at: string;
}

export interface TripFull extends TripSummary {
  travel_style: string;
  start_date: string | null;
  airport_entry: string | null;
  airport_exit: string | null;
  document: TripDocument;
}

export interface TripBriefIn {
  text: string;
  start_date?: string;
  airport_entry?: string;
  airport_exit?: string;
}

export type TripStreamEvent =
  | { type: "status"; message: string }
  | { type: "place"; place: Place }
  | { type: "done"; slug: string };
```

- [ ] **Step 2: Write the typed fetch client `web/lib/api.ts`**

```typescript
import type { TripFull, TripSummary, TripBriefIn, Neighborhood } from "./types";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE!;

async function authedFetch(path: string, init: RequestInit, token: string): Promise<Response> {
  return fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      Authorization: `Bearer ${token}`,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
    },
  });
}

export async function listTrips(token: string): Promise<TripSummary[]> {
  const res = await authedFetch("/trips", { method: "GET" }, token);
  if (!res.ok) throw new Error(`listTrips ${res.status}`);
  return res.json();
}

export async function getTrip(slug: string, token: string): Promise<TripFull> {
  const res = await authedFetch(`/trips/${slug}`, { method: "GET" }, token);
  if (!res.ok) throw new Error(`getTrip ${res.status}`);
  return res.json();
}

export async function refineTrip(slug: string, instruction: string, token: string): Promise<TripFull> {
  const res = await authedFetch(
    `/trips/${slug}/refine`,
    { method: "POST", body: JSON.stringify({ instruction }) },
    token,
  );
  if (!res.ok) throw new Error(`refineTrip ${res.status}`);
  return res.json();
}

export async function fetchHotels(slug: string, adults: number, token: string): Promise<Neighborhood[]> {
  const res = await authedFetch(
    `/trips/${slug}/hotels`,
    { method: "POST", body: JSON.stringify({ adults }) },
    token,
  );
  if (!res.ok) throw new Error(`fetchHotels ${res.status}`);
  return res.json();
}

export function pdfUrl(slug: string, token: string): string {
  // Append token in querystring for direct browser download via a regular link.
  // The backend currently reads from Authorization header — see Task 16 for the
  // workaround using fetch + blob URL instead of a static href.
  return `${API_BASE}/trips/${slug}/pdf?token=${encodeURIComponent(token)}`;
}

export async function postBrief(brief: TripBriefIn, token: string): Promise<TripFull> {
  const res = await authedFetch("/trips", { method: "POST", body: JSON.stringify(brief) }, token);
  if (!res.ok) throw new Error(`postBrief ${res.status}`);
  return res.json();
}
```

- [ ] **Step 3: Create `web/.env.local.example`**

```
NEXT_PUBLIC_API_BASE=https://atlas-api-598507134096.us-central1.run.app
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_MAPBOX_TOKEN=
```

- [ ] **Step 4: Compile-check**

```bash
cd /Users/viggy/travel-planning/web
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
cd /Users/viggy/travel-planning
git add web/
git commit -m "Add API client + shared types mirroring backend Pydantic models"
```

---

## Phase 2 — Auth (Supabase + Google OAuth)

### Task 4: Install Supabase SSR helpers + middleware

**Files:**
- Modify: `web/package.json` (via npm install)
- Create: `web/lib/supabase/client.ts`
- Create: `web/lib/supabase/server.ts`
- Create: `web/lib/supabase/middleware.ts`
- Create: `web/middleware.ts`

- [ ] **Step 1: Install dependencies**

```bash
cd /Users/viggy/travel-planning/web
npm install @supabase/supabase-js @supabase/ssr
```

- [ ] **Step 2: Browser client `web/lib/supabase/client.ts`**

```typescript
import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
```

- [ ] **Step 3: Server client `web/lib/supabase/server.ts`**

```typescript
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (toSet) => {
          try {
            for (const { name, value, options } of toSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Read-only context (e.g. during render). Safe to ignore.
          }
        },
      },
    },
  );
}
```

- [ ] **Step 4: Middleware client `web/lib/supabase/middleware.ts`**

```typescript
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (toSet) => {
          for (const { name, value } of toSet) request.cookies.set(name, value);
          response = NextResponse.next({ request });
          for (const { name, value, options } of toSet) response.cookies.set(name, value, options);
        },
      },
    },
  );

  await supabase.auth.getUser(); // refresh
  return response;
}
```

- [ ] **Step 5: Wire `web/middleware.ts`**

```typescript
import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
```

- [ ] **Step 6: Compile-check**

```bash
cd /Users/viggy/travel-planning/web && npx tsc --noEmit
```

- [ ] **Step 7: Commit**

```bash
git add web/
git commit -m "Add Supabase SSR helpers + middleware for session refresh"
```

---

### Task 5: Configure Google OAuth in Supabase + create sign-in flow

This task has setup steps that require **the user**: Supabase Auth → Providers → Google → enable + add OAuth client. Pause and surface that to the user once you reach Step 1.

**Files:**
- Create: `web/app/auth/signin/page.tsx`
- Create: `web/components/SignInButton.tsx`
- Create: `web/app/auth/callback/route.ts`

- [ ] **Step 1: USER ACTION — enable Google in Supabase**

Surface to user: "I need you to enable Google OAuth in Supabase. Steps:
1. https://supabase.com/dashboard → your project → Authentication → Providers → Google → toggle Enabled
2. Follow the dialog to create a Google Cloud OAuth client (or paste an existing client ID + secret).
3. **Authorized redirect URI** to set on Google's side: `https://xbiofbyfhpjpawimtmau.supabase.co/auth/v1/callback`
4. Copy the Client ID and Secret into the Supabase dialog → Save.
Tell me when this is saved."

After confirmation, proceed.

- [ ] **Step 2: Sign-in button `web/components/SignInButton.tsx`**

```tsx
"use client";

import { createClient } from "@/lib/supabase/client";

export function SignInButton() {
  const supabase = createClient();
  return (
    <button
      onClick={async () => {
        await supabase.auth.signInWithOAuth({
          provider: "google",
          options: { redirectTo: `${window.location.origin}/auth/callback` },
        });
      }}
      className="frosted-strong rounded-btn px-4 py-2 text-sm font-medium text-ink-900 hover:bg-white/95"
    >
      Sign in with Google
    </button>
  );
}
```

- [ ] **Step 3: Sign-in page `web/app/auth/signin/page.tsx`**

```tsx
import { SignInButton } from "@/components/SignInButton";

export default function SignInPage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-6 px-6">
      <h1 className="font-display text-3xl font-semibold tracking-tight text-ink-900">
        Welcome to Atlas
      </h1>
      <p className="text-ink-500 max-w-md text-center text-sm">
        Sign in with the Google account on the allowlist to start planning.
      </p>
      <SignInButton />
    </main>
  );
}
```

- [ ] **Step 4: Callback `web/app/auth/callback/route.ts`**

```typescript
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      return NextResponse.redirect(`${origin}/auth/signin?error=exchange`);
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.email) {
      return NextResponse.redirect(`${origin}/auth/signin?error=no_email`);
    }

    // Allowlist check — service role bypass not available in browser, so we hit
    // the DB via the RLS-respecting client. allowed_emails is locked down by
    // RLS, so we instead call the public RPC `is_allowed`.
    const { data: allowed, error: rpcErr } = await supabase.rpc("is_allowed");
    if (rpcErr || !allowed) {
      await supabase.auth.signOut();
      return NextResponse.redirect(`${origin}/auth/signin?error=not_allowed`);
    }
  }

  return NextResponse.redirect(`${origin}${next}`);
}
```

- [ ] **Step 5: Update sign-in page to surface errors**

Modify `web/app/auth/signin/page.tsx`:

```tsx
import { SignInButton } from "@/components/SignInButton";

const ERR_MESSAGES: Record<string, string> = {
  not_allowed: "This email isn't on the allowlist. Ask the admin to add you.",
  exchange: "Sign-in failed. Try again.",
  no_email: "We couldn't read your email from Google. Try again.",
};

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-6 px-6">
      <h1 className="font-display text-3xl font-semibold tracking-tight text-ink-900">
        Welcome to Atlas
      </h1>
      <p className="text-ink-500 max-w-md text-center text-sm">
        Sign in with the Google account on the allowlist to start planning.
      </p>
      <SignInButton />
      {error && ERR_MESSAGES[error] && (
        <p className="text-rose-500 text-sm">{ERR_MESSAGES[error]}</p>
      )}
    </main>
  );
}
```

- [ ] **Step 6: Manual test**

```bash
# Fill web/.env.local with NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
# NEXT_PUBLIC_API_BASE. (NEXT_PUBLIC_MAPBOX_TOKEN can stay blank for now.)
cd /Users/viggy/travel-planning/web
npm run dev
# Open http://localhost:3000/auth/signin in a browser, click sign-in,
# complete the Google flow, verify it redirects back to /.
# Try signing in with a non-allowlisted email — verify the not_allowed error.
```

- [ ] **Step 7: Commit**

```bash
cd /Users/viggy/travel-planning
git add web/
git commit -m "Add Supabase Google OAuth sign-in + allowlist gate"
```

---

### Task 6: Token helper for backend calls

The Supabase JS client gives us the JWT via `supabase.auth.getSession()`. Wrap that.

**Files:**
- Create: `web/lib/auth.ts`

- [ ] **Step 1: Write `web/lib/auth.ts`**

```typescript
import { createClient as createBrowserSupabase } from "@/lib/supabase/client";
import { createClient as createServerSupabase } from "@/lib/supabase/server";

export async function getServerToken(): Promise<string | null> {
  const supabase = await createServerSupabase();
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ?? null;
}

export async function getBrowserToken(): Promise<string | null> {
  const supabase = createBrowserSupabase();
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ?? null;
}
```

- [ ] **Step 2: Compile-check**

```bash
cd /Users/viggy/travel-planning/web && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add web/
git commit -m "Add server + browser token helpers for backend auth"
```

---

## Phase 3 — Map + foundational components

### Task 7: Mapbox setup

This task requires **the user** to create a Mapbox account and grab an access token. Surface and pause.

**Files:**
- Modify: `web/package.json` (npm install)
- Create: `web/components/Map.tsx`

- [ ] **Step 1: USER ACTION — get Mapbox token**

Surface to user: "Sign up at https://account.mapbox.com/ (free), then go to Account → Tokens → copy the **default public token** (`pk.eyJ...`). Paste it into me when done. We'll add it to `web/.env.local` as `NEXT_PUBLIC_MAPBOX_TOKEN`."

- [ ] **Step 2: Install Mapbox**

```bash
cd /Users/viggy/travel-planning/web
npm install mapbox-gl
npm install -D @types/mapbox-gl
```

- [ ] **Step 3: Write `web/components/Map.tsx`**

```tsx
"use client";

import "mapbox-gl/dist/mapbox-gl.css";
import { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";

import type { Place } from "@/lib/types";

const CATEGORY_COLOR: Record<Place["category"], string> = {
  neighbourhood: "#4285f4",
  restaurant: "#34a853",
  photography_spot: "#ea4335",
  logistics: "#9534e6",
};

export function Map({ places }: { places: Place[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN!;

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: "mapbox://styles/mapbox/light-v11",
      center: [0, 30],
      zoom: 1.5,
    });
    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const geocoded = places.filter((p): p is Place & { lat: number; lng: number } =>
      p.lat !== null && p.lng !== null,
    );
    if (geocoded.length === 0) return;

    // Wait for style to be loaded before adding markers (Mapbox requirement)
    const apply = () => {
      // Remove old markers — they're tracked on a custom property for cleanup
      const old = (map as unknown as { _atlasMarkers?: mapboxgl.Marker[] })._atlasMarkers ?? [];
      for (const m of old) m.remove();

      const markers: mapboxgl.Marker[] = geocoded.map((p) => {
        const el = document.createElement("div");
        el.style.width = "14px";
        el.style.height = "14px";
        el.style.borderRadius = "50%";
        el.style.background = CATEGORY_COLOR[p.category];
        el.style.border = "2px solid #fff";
        el.style.boxShadow = "0 2px 4px rgba(0,0,0,0.2)";
        return new mapboxgl.Marker(el).setLngLat([p.lng, p.lat]).addTo(map);
      });
      (map as unknown as { _atlasMarkers?: mapboxgl.Marker[] })._atlasMarkers = markers;

      const bounds = new mapboxgl.LngLatBounds();
      for (const p of geocoded) bounds.extend([p.lng, p.lat]);
      map.fitBounds(bounds, { padding: 80, duration: 800, maxZoom: 13 });
    };

    if (map.isStyleLoaded()) apply();
    else map.once("load", apply);
  }, [places]);

  return <div ref={containerRef} className="w-full h-full" />;
}
```

- [ ] **Step 4: Render the map on a stub trip page**

Create `web/app/map-test/page.tsx`:

```tsx
"use client";

import { Map } from "@/components/Map";

const FIXTURE = [
  { name: "Gion", category: "neighbourhood" as const, description: "x", lat: 35.0036, lng: 135.7748 },
  { name: "Kiyomizu", category: "photography_spot" as const, description: "x", lat: 34.9947, lng: 135.7850 },
];

export default function MapTest() {
  return (
    <main className="h-screen w-screen">
      <Map places={FIXTURE} />
    </main>
  );
}
```

```bash
cd /Users/viggy/travel-planning/web && npm run dev
# Open http://localhost:3000/map-test, verify the map loads with two pins on Kyoto.
```

- [ ] **Step 5: Commit**

```bash
cd /Users/viggy/travel-planning
git add web/
git commit -m "Add Mapbox <Map /> component with category-coloured pins"
```

---

### Task 8: Trip panel (desktop frosted glass) — static rendering

**Files:**
- Create: `web/components/TripPanel.tsx`
- Create: `web/components/TripPanelTabs.tsx`
- Create: `web/components/DayCard.tsx`

The panel is a layout primitive. Streaming and refine come later.

- [ ] **Step 1: `web/components/DayCard.tsx`**

```tsx
import type { Place } from "@/lib/types";

export interface Day {
  number: number;
  title: string;
  area?: string;
  bullets: { time: "Morning" | "Afternoon" | "Evening"; items: string[] }[];
}

export function DayCard({ day, isCurrent }: { day: Day; isCurrent: boolean }) {
  return (
    <div
      className={
        isCurrent
          ? "frosted-strong rounded-card p-3"
          : "bg-white/50 border border-amber-700/8 rounded-card p-3"
      }
    >
      <div className="flex items-baseline gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-amber-600">
          DAY {day.number}
        </span>
        {day.area && <span className="text-[10px] text-ink-500">{day.area}</span>}
      </div>
      <div className="text-sm font-semibold text-ink-900 mt-1">{day.title}</div>
      <div className="mt-2 flex flex-col gap-1">
        {day.bullets.map((b) => (
          <div key={b.time} className="text-[11px] text-ink-700">
            <span className="font-semibold">{b.time}:</span> {b.items.join(" · ")}
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: `web/components/TripPanelTabs.tsx`**

```tsx
"use client";

const TABS = ["Itinerary", "Restaurants", "Where to stay"] as const;
export type Tab = (typeof TABS)[number];

export function TripPanelTabs({
  active,
  onChange,
}: {
  active: Tab;
  onChange: (t: Tab) => void;
}) {
  return (
    <div className="flex gap-4 px-4 pt-3 border-b border-amber-700/8">
      {TABS.map((t) => (
        <button
          key={t}
          onClick={() => onChange(t)}
          className={
            t === active
              ? "pb-2 text-xs font-semibold text-ink-900 border-b-2 border-amber-600"
              : "pb-2 text-xs text-ink-500 hover:text-ink-700"
          }
        >
          {t}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: `web/components/TripPanel.tsx`**

```tsx
"use client";

import { useState } from "react";

import type { TripFull } from "@/lib/types";
import { DayCard, type Day } from "./DayCard";
import { TripPanelTabs, type Tab } from "./TripPanelTabs";

export function TripPanel({ trip }: { trip: TripFull }) {
  const [tab, setTab] = useState<Tab>("Itinerary");
  const days = parseDays(trip.document.document_markdown);

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <TripPanelTabs active={tab} onChange={setTab} />
      <div className="flex-1 p-3 overflow-auto flex flex-col gap-2">
        {tab === "Itinerary" &&
          days.map((d) => <DayCard key={d.number} day={d} isCurrent={d.number === 1} />)}
        {tab === "Restaurants" && (
          <p className="text-xs text-ink-500 p-2">Restaurants list — coming in Task 12.</p>
        )}
        {tab === "Where to stay" && (
          <p className="text-xs text-ink-500 p-2">Hotels — coming in Task 13.</p>
        )}
      </div>
    </div>
  );
}

function parseDays(markdown: string): Day[] {
  // Lightweight parser of the LLM's "### Day N: Title" + Morning/Afternoon/Evening bullets.
  const days: Day[] = [];
  const dayBlocks = markdown.split(/\n(?=### Day \d+:)/g).filter((b) => b.startsWith("### Day "));
  for (const block of dayBlocks) {
    const headerMatch = block.match(/^### Day (\d+):\s*(.+)/);
    if (!headerMatch) continue;
    const number = parseInt(headerMatch[1], 10);
    const title = headerMatch[2].trim();
    const bullets: Day["bullets"] = [];
    for (const time of ["Morning", "Afternoon", "Evening"] as const) {
      const re = new RegExp(`\\*\\*${time}:\\*\\*([\\s\\S]*?)(?=\\*\\*(?:Morning|Afternoon|Evening):\\*\\*|$)`);
      const m = block.match(re);
      if (m) {
        const items = m[1]
          .split("\n")
          .map((l) => l.replace(/^[-*]\s+/, "").trim())
          .filter(Boolean);
        if (items.length) bullets.push({ time, items });
      }
    }
    days.push({ number, title, bullets });
  }
  return days;
}
```

- [ ] **Step 4: Compile-check**

```bash
cd /Users/viggy/travel-planning/web && npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add web/
git commit -m "Add desktop TripPanel with tabs and DayCard parsing"
```

---

### Task 9: Mobile bottom sheet via vaul

**Files:**
- Modify: `web/package.json` (npm install vaul)
- Create: `web/components/MobileSheet.tsx`

- [ ] **Step 1: Install**

```bash
cd /Users/viggy/travel-planning/web && npm install vaul
```

- [ ] **Step 2: `web/components/MobileSheet.tsx`**

```tsx
"use client";

import { Drawer } from "vaul";
import { useState } from "react";

export function MobileSheet({ children }: { children: React.ReactNode }) {
  const [snap, setSnap] = useState<number | string | null>(0.55);
  return (
    <Drawer.Root
      open
      modal={false}
      snapPoints={[0.12, 0.55, 0.95]}
      activeSnapPoint={snap}
      setActiveSnapPoint={setSnap}
      dismissible={false}
    >
      <Drawer.Portal>
        <Drawer.Content className="fixed inset-x-0 bottom-0 z-30 flex h-[95dvh] flex-col rounded-t-[22px] frosted-strong outline-none">
          <Drawer.Title className="sr-only">Trip details</Drawer.Title>
          <div className="mx-auto my-2 h-1 w-9 rounded-full bg-ink-300/40" />
          <div className="flex-1 overflow-hidden">{children}</div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
```

- [ ] **Step 3: Compile-check + commit**

```bash
cd /Users/viggy/travel-planning/web && npx tsc --noEmit
cd /Users/viggy/travel-planning
git add web/
git commit -m "Add vaul-based MobileSheet with three snap points"
```

---

### Task 10: Chat input + suggestion chips

**Files:**
- Create: `web/components/ChatInput.tsx`
- Create: `web/components/SuggestionChips.tsx`

- [ ] **Step 1: `web/components/SuggestionChips.tsx`**

```tsx
"use client";

const SUGGESTIONS = [
  "A long weekend in Lisbon",
  "Hiking week in the Dolomites",
  "10 days through Vietnam, street food focus",
  "Surprise me",
];

export function SuggestionChips({ onPick }: { onPick: (text: string) => void }) {
  return (
    <div className="flex flex-wrap justify-center gap-2 max-w-xl">
      {SUGGESTIONS.map((s) => (
        <button
          key={s}
          onClick={() => onPick(s)}
          className="rounded-full px-3 py-1 text-xs text-ink-700 bg-white/60 border border-amber-700/10 hover:bg-white/85"
        >
          {s}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: `web/components/ChatInput.tsx`**

```tsx
"use client";

import { useState } from "react";

import type { TripBriefIn } from "@/lib/types";

export function ChatInput({
  onSubmit,
  pending,
}: {
  onSubmit: (brief: TripBriefIn) => void;
  pending: boolean;
}) {
  const [text, setText] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!text.trim() || pending) return;
        onSubmit({ text: text.trim() });
      }}
      className="frosted-strong rounded-panel p-4 w-full max-w-xl"
    >
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={2}
        className="w-full bg-transparent outline-none text-sm text-ink-900 placeholder:text-ink-500 resize-none"
        placeholder="7 days in Kyoto, vegetarian, photography focus, mid-October…"
        disabled={pending}
      />
      <div className="flex items-center justify-between mt-2">
        <div className="flex gap-1">
          <span className="pill">📅 Dates</span>
          <span className="pill">✈️ Airports</span>
        </div>
        <button
          type="submit"
          disabled={!text.trim() || pending}
          className="w-8 h-8 rounded-btn bg-gradient-to-br from-amber-400 to-amber-600 text-white shadow-md disabled:opacity-40"
        >
          {pending ? "…" : "↑"}
        </button>
      </div>
    </form>
  );
}
```

- [ ] **Step 3: Compile-check + commit**

```bash
cd /Users/viggy/travel-planning/web && npx tsc --noEmit
cd /Users/viggy/travel-planning
git add web/
git commit -m "Add ChatInput and SuggestionChips for the empty state"
```

---

## Phase 4 — Pages + streaming

### Task 11: Empty hero + signed-in trip list

**Files:**
- Modify: `web/app/page.tsx`
- Create: `web/components/TripsList.tsx`
- Create: `web/components/BrandMark.tsx`

- [ ] **Step 1: `web/components/BrandMark.tsx`**

```tsx
export function BrandMark() {
  return (
    <div className="flex items-center gap-2">
      <div className="w-6 h-6 rounded-md bg-gradient-to-br from-amber-400 to-amber-600 text-white text-xs flex items-center justify-center font-bold">
        ✦
      </div>
      <div className="font-display text-sm font-semibold text-ink-900 tracking-tight">Atlas</div>
    </div>
  );
}
```

- [ ] **Step 2: `web/components/TripsList.tsx`**

```tsx
import Link from "next/link";

import type { TripSummary } from "@/lib/types";

export function TripsList({ trips }: { trips: TripSummary[] }) {
  if (trips.length === 0) return null;
  return (
    <div className="frosted rounded-panel p-3 w-full max-w-xl">
      <div className="text-[11px] uppercase tracking-wider text-ink-500 mb-2">
        Recent trips
      </div>
      <ul className="flex flex-col gap-1">
        {trips.map((t) => (
          <li key={t.id}>
            <Link
              href={`/trip/${t.slug}`}
              className="flex justify-between items-center px-2 py-1.5 rounded-md hover:bg-white/70"
            >
              <span className="text-sm text-ink-900">{t.destination}</span>
              <span className="text-xs text-ink-500">{t.days} days</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 3: Replace `web/app/page.tsx`**

```tsx
import { redirect } from "next/navigation";

import { BrandMark } from "@/components/BrandMark";
import { ChatInputClient } from "@/components/ChatInputClient";
import { SuggestionChipsClient } from "@/components/SuggestionChipsClient";
import { TripsList } from "@/components/TripsList";
import { listTrips } from "@/lib/api";
import { getServerToken } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function Home() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/signin");

  const token = await getServerToken();
  const trips = token ? await listTrips(token).catch(() => []) : [];

  return (
    <main className="min-h-screen flex flex-col">
      <header className="px-6 py-4 flex items-center justify-between">
        <BrandMark />
        <div className="text-xs text-ink-500">
          {user.email}
        </div>
      </header>

      <section className="flex-1 flex flex-col items-center justify-center gap-6 px-6 pb-12">
        <h1 className="font-display text-4xl md:text-5xl font-semibold tracking-tight text-ink-900 text-center">
          Where to next?
        </h1>
        <p className="text-ink-500 max-w-md text-center">
          Tell me about your trip in plain English — destination, days, what you love.
        </p>
        <ChatInputClient />
        <SuggestionChipsClient />
        <TripsList trips={trips} />
      </section>
    </main>
  );
}
```

- [ ] **Step 4: Wire client wrappers**

`web/components/ChatInputClient.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { ChatInput } from "./ChatInput";
import { getBrowserToken } from "@/lib/auth";
import { postBrief } from "@/lib/api";

export function ChatInputClient() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  return (
    <ChatInput
      pending={pending}
      onSubmit={async (brief) => {
        setPending(true);
        try {
          const token = await getBrowserToken();
          if (!token) return router.push("/auth/signin");
          const trip = await postBrief(brief, token);
          router.push(`/trip/${trip.slug}`);
        } finally {
          setPending(false);
        }
      }}
    />
  );
}
```

`web/components/SuggestionChipsClient.tsx`:

```tsx
"use client";

import { SuggestionChips } from "./SuggestionChips";

export function SuggestionChipsClient() {
  return (
    <SuggestionChips
      onPick={(text) => {
        const ev = new CustomEvent("atlas:prefill", { detail: text });
        window.dispatchEvent(ev);
      }}
    />
  );
}
```

(And in `ChatInputClient`, listen for the event to prefill — you may also wire the chip onPick directly to a shared state library if simpler. The CustomEvent approach avoids prop drilling for now; replace with shared state in Task 17 if it gets in the way.)

- [ ] **Step 5: Manual smoke test**

```bash
cd /Users/viggy/travel-planning/web && npm run dev
# Sign in with allowlisted email, verify hero loads, type a brief, click ↑.
# Expect navigation to /trip/<slug> after the (synchronous) backend call.
# Page may 404 since the trip detail page isn't built yet — that's fine, Task 12 fixes it.
```

- [ ] **Step 6: Commit**

```bash
cd /Users/viggy/travel-planning
git add web/
git commit -m "Build empty hero with auth gate, brief submit, and trips list"
```

---

### Task 12: Trip detail page (desktop layout) — non-streaming

**Files:**
- Create: `web/app/trip/[slug]/page.tsx`
- Create: `web/app/trip/[slug]/TripView.tsx`

- [ ] **Step 1: Server component `web/app/trip/[slug]/page.tsx`**

```tsx
import { notFound, redirect } from "next/navigation";

import { getTrip } from "@/lib/api";
import { getServerToken } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

import { TripView } from "./TripView";

export default async function TripPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/signin");

  const token = await getServerToken();
  if (!token) redirect("/auth/signin");

  let trip;
  try {
    trip = await getTrip(slug, token);
  } catch {
    notFound();
  }

  return <TripView trip={trip} />;
}
```

- [ ] **Step 2: Client view `web/app/trip/[slug]/TripView.tsx`**

```tsx
"use client";

import Link from "next/link";

import { BrandMark } from "@/components/BrandMark";
import { Map } from "@/components/Map";
import { MobileSheet } from "@/components/MobileSheet";
import { RefineInput } from "@/components/RefineInput";
import { TripPanel } from "@/components/TripPanel";
import type { TripFull } from "@/lib/types";

export function TripView({ trip }: { trip: TripFull }) {
  return (
    <main className="relative h-dvh w-screen overflow-hidden">
      {/* Map full bleed */}
      <div className="absolute inset-0">
        <Map places={trip.document.places} />
      </div>

      {/* Top bar */}
      <header className="absolute top-0 inset-x-0 px-6 py-3 flex items-center justify-between backdrop-blur-md bg-cream-50/40 z-10">
        <Link href="/" className="contents">
          <BrandMark />
        </Link>
        <div className="text-sm text-ink-700 font-medium">
          {trip.destination} · {trip.days} days
        </div>
        <div className="flex gap-2">
          <button className="frosted rounded-btn px-3 py-1 text-xs">Share</button>
          <button className="frosted rounded-btn px-3 py-1 text-xs">Export PDF</button>
        </div>
      </header>

      {/* Desktop side panel */}
      <aside className="hidden md:flex absolute left-4 top-16 bottom-4 w-[330px] frosted-strong rounded-panel overflow-hidden flex-col z-10">
        <div className="flex-1 overflow-hidden">
          <TripPanel trip={trip} />
        </div>
        <div className="border-t border-amber-700/8 p-3">
          <RefineInput slug={trip.slug} />
        </div>
      </aside>

      {/* Mobile bottom sheet */}
      <div className="md:hidden">
        <MobileSheet>
          <div className="h-full flex flex-col">
            <div className="flex-1 overflow-hidden">
              <TripPanel trip={trip} />
            </div>
            <div className="border-t border-amber-700/8 p-3">
              <RefineInput slug={trip.slug} />
            </div>
          </div>
        </MobileSheet>
      </div>
    </main>
  );
}
```

- [ ] **Step 3: Stub `web/components/RefineInput.tsx`** (real wiring in Task 14)

```tsx
"use client";

export function RefineInput({ slug: _slug }: { slug: string }) {
  return (
    <div className="bg-white/95 border border-amber-700/12 rounded-card flex items-center px-3 py-2 gap-2">
      <input
        className="flex-1 bg-transparent outline-none text-xs text-ink-900 placeholder:text-ink-500"
        placeholder="Refine…"
      />
      <span className="text-amber-600 text-sm">↑</span>
    </div>
  );
}
```

- [ ] **Step 4: Compile-check + manual test**

```bash
cd /Users/viggy/travel-planning/web && npx tsc --noEmit
npm run dev
# After creating a trip via /, navigate to /trip/<slug>. Expect map + panel + top bar.
```

- [ ] **Step 5: Commit**

```bash
cd /Users/viggy/travel-planning
git add web/
git commit -m "Add trip detail page with desktop side panel and mobile sheet"
```

---

### Task 13: SSE streaming generation

This replaces the synchronous `postBrief` flow on the empty state with a real-time stream. The frontend talks to the backend's `POST /trips/stream`.

**Files:**
- Create: `web/lib/streamingTrip.ts`
- Modify: `web/components/ChatInputClient.tsx`
- Create: `web/components/StreamingOverlay.tsx`

- [ ] **Step 1: `web/lib/streamingTrip.ts`**

```typescript
import type { Place, TripStreamEvent } from "./types";

export interface StreamCallbacks {
  onStatus: (msg: string) => void;
  onPlace: (place: Place) => void;
  onDone: (slug: string) => void;
  onError: (err: Error) => void;
}

export async function streamTrip(
  apiBase: string,
  token: string,
  body: { text: string; start_date?: string; airport_entry?: string; airport_exit?: string },
  cb: StreamCallbacks,
) {
  const res = await fetch(`${apiBase}/trips/stream`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok || !res.body) {
    cb.onError(new Error(`stream failed ${res.status}`));
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // Each SSE message is delimited by \n\n. Split out completed messages.
    let sep: number;
    while ((sep = buffer.indexOf("\n\n")) !== -1) {
      const chunk = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      const ev = parseSseChunk(chunk);
      if (!ev) continue;
      if (ev.type === "status") cb.onStatus(ev.message);
      else if (ev.type === "place") cb.onPlace(ev.place);
      else if (ev.type === "done") cb.onDone(ev.slug);
    }
  }
}

function parseSseChunk(chunk: string): TripStreamEvent | null {
  let event = "";
  let data = "";
  for (const line of chunk.split("\n")) {
    if (line.startsWith("event:")) event = line.slice(6).trim();
    else if (line.startsWith("data:")) data += line.slice(5).trim();
  }
  if (!event || !data) return null;
  try {
    const parsed = JSON.parse(data);
    if (event === "status") return { type: "status", message: parsed };
    if (event === "place") return { type: "place", place: parsed };
    if (event === "done") return { type: "done", slug: parsed.slug };
  } catch {
    return null;
  }
  return null;
}
```

- [ ] **Step 2: `web/components/StreamingOverlay.tsx`**

```tsx
"use client";

import type { Place } from "@/lib/types";
import { Map } from "./Map";

export function StreamingOverlay({
  status,
  places,
}: {
  status: string;
  places: Place[];
}) {
  return (
    <div className="absolute inset-0 z-20">
      <Map places={places} />
      <div className="absolute inset-0 flex items-end justify-center pointer-events-none p-8">
        <div className="frosted-strong rounded-panel px-5 py-3 flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
          <span className="text-sm text-ink-900">{status}</span>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Replace `web/components/ChatInputClient.tsx`**

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { ChatInput } from "./ChatInput";
import { StreamingOverlay } from "./StreamingOverlay";
import { getBrowserToken } from "@/lib/auth";
import { streamTrip } from "@/lib/streamingTrip";
import type { Place } from "@/lib/types";

export function ChatInputClient() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState("");
  const [places, setPlaces] = useState<Place[]>([]);

  return (
    <>
      <ChatInput
        pending={pending}
        onSubmit={async (brief) => {
          setPending(true);
          setStatus("Sending your brief…");
          setPlaces([]);
          try {
            const token = await getBrowserToken();
            if (!token) {
              router.push("/auth/signin");
              return;
            }
            await streamTrip(
              process.env.NEXT_PUBLIC_API_BASE!,
              token,
              brief,
              {
                onStatus: setStatus,
                onPlace: (p) => setPlaces((prev) => [...prev, p]),
                onDone: (slug) => router.push(`/trip/${slug}`),
                onError: (e) => {
                  console.error(e);
                  setStatus(`Error: ${e.message}`);
                  setPending(false);
                },
              },
            );
          } catch (e) {
            console.error(e);
            setPending(false);
          }
        }}
      />
      {pending && <StreamingOverlay status={status} places={places} />}
    </>
  );
}
```

- [ ] **Step 4: Manual end-to-end test**

```bash
cd /Users/viggy/travel-planning/web && npm run dev
# Sign in, type "3 days in Lisbon, vegetarian", submit.
# Watch overlay show progress messages, pins drop on the map one by one,
# then auto-navigate to /trip/<slug> when generation finishes.
```

- [ ] **Step 5: Commit**

```bash
cd /Users/viggy/travel-planning
git add web/
git commit -m "Stream trip generation: progress messages + incremental pins"
```

---

### Task 14: Refine flow

**Files:**
- Modify: `web/components/RefineInput.tsx`
- Modify: `web/app/trip/[slug]/TripView.tsx`

- [ ] **Step 1: Replace `web/components/RefineInput.tsx`**

```tsx
"use client";

import { useState } from "react";

import { refineTrip } from "@/lib/api";
import { getBrowserToken } from "@/lib/auth";
import type { TripFull } from "@/lib/types";

export function RefineInput({
  slug,
  onUpdated,
}: {
  slug: string;
  onUpdated: (trip: TripFull) => void;
}) {
  const [text, setText] = useState("");
  const [pending, setPending] = useState(false);
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (!text.trim() || pending) return;
        setPending(true);
        try {
          const token = await getBrowserToken();
          if (!token) return;
          const updated = await refineTrip(slug, text.trim(), token);
          onUpdated(updated);
          setText("");
        } finally {
          setPending(false);
        }
      }}
      className="bg-white/95 border border-amber-700/12 rounded-card flex items-center px-3 py-2 gap-2"
    >
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        disabled={pending}
        className="flex-1 bg-transparent outline-none text-xs text-ink-900 placeholder:text-ink-500"
        placeholder={pending ? "Refining…" : "Refine — e.g. make day 2 less touristy"}
      />
      <button type="submit" className="text-amber-600 text-sm" disabled={pending}>
        ↑
      </button>
    </form>
  );
}
```

- [ ] **Step 2: Wire `onUpdated` in `web/app/trip/[slug]/TripView.tsx`**

Convert TripView to manage `trip` in state so refine updates re-render the panel:

```tsx
"use client";

import { useState } from "react";
import Link from "next/link";

import { BrandMark } from "@/components/BrandMark";
import { Map } from "@/components/Map";
import { MobileSheet } from "@/components/MobileSheet";
import { RefineInput } from "@/components/RefineInput";
import { TripPanel } from "@/components/TripPanel";
import type { TripFull } from "@/lib/types";

export function TripView({ trip: initial }: { trip: TripFull }) {
  const [trip, setTrip] = useState(initial);

  return (
    <main className="relative h-dvh w-screen overflow-hidden">
      <div className="absolute inset-0">
        <Map places={trip.document.places} />
      </div>

      <header className="absolute top-0 inset-x-0 px-6 py-3 flex items-center justify-between backdrop-blur-md bg-cream-50/40 z-10">
        <Link href="/" className="contents"><BrandMark /></Link>
        <div className="text-sm text-ink-700 font-medium">{trip.destination} · {trip.days} days</div>
        <div className="flex gap-2">
          <button className="frosted rounded-btn px-3 py-1 text-xs">Share</button>
          <button className="frosted rounded-btn px-3 py-1 text-xs">Export PDF</button>
        </div>
      </header>

      <aside className="hidden md:flex absolute left-4 top-16 bottom-4 w-[330px] frosted-strong rounded-panel overflow-hidden flex-col z-10">
        <div className="flex-1 overflow-hidden">
          <TripPanel trip={trip} />
        </div>
        <div className="border-t border-amber-700/8 p-3">
          <RefineInput slug={trip.slug} onUpdated={setTrip} />
        </div>
      </aside>

      <div className="md:hidden">
        <MobileSheet>
          <div className="h-full flex flex-col">
            <div className="flex-1 overflow-hidden"><TripPanel trip={trip} /></div>
            <div className="border-t border-amber-700/8 p-3">
              <RefineInput slug={trip.slug} onUpdated={setTrip} />
            </div>
          </div>
        </MobileSheet>
      </div>
    </main>
  );
}
```

- [ ] **Step 3: Manual test + commit**

```bash
cd /Users/viggy/travel-planning/web && npm run dev
# Open a trip, type "make day 2 less touristy" in the refine input, submit.
# Verify the day cards in the panel update.
cd /Users/viggy/travel-planning
git add web/
git commit -m "Wire refine flow into trip view"
```

---

### Task 15: Hotels tab + Restaurants tab

**Files:**
- Create: `web/components/HotelCard.tsx`
- Modify: `web/components/TripPanel.tsx`

- [ ] **Step 1: `web/components/HotelCard.tsx`**

```tsx
import type { Hotel } from "@/lib/types";

export function HotelCard({ hotel }: { hotel: Hotel }) {
  return (
    <a
      href={hotel.booking_url}
      target="_blank"
      rel="noopener noreferrer"
      className="frosted rounded-card p-3 flex flex-col gap-1 hover:bg-white/85"
    >
      <div className="text-sm font-semibold text-ink-900">{hotel.name}</div>
      <div className="text-xs text-ink-700 leading-snug">{hotel.description}</div>
      <div className="text-[11px] text-amber-700 mt-1">View on Booking →</div>
    </a>
  );
}
```

- [ ] **Step 2: Modify `TripPanel.tsx` — wire the two empty tabs**

Replace the placeholder branches in `TripPanel`:

```tsx
"use client";

import { useState } from "react";

import { fetchHotels } from "@/lib/api";
import { getBrowserToken } from "@/lib/auth";
import type { Neighborhood, TripFull } from "@/lib/types";

import { DayCard, type Day } from "./DayCard";
import { HotelCard } from "./HotelCard";
import { TripPanelTabs, type Tab } from "./TripPanelTabs";

export function TripPanel({ trip }: { trip: TripFull }) {
  const [tab, setTab] = useState<Tab>("Itinerary");
  const days = parseDays(trip.document.document_markdown);
  const restaurants = parseTable(trip.document.document_markdown, /## Vegetarian Restaurants/i);
  const [neighborhoods, setNeighborhoods] = useState<Neighborhood[]>(trip.document.neighborhoods ?? []);
  const [hotelsLoading, setHotelsLoading] = useState(false);

  async function loadHotels() {
    if (neighborhoods.length || hotelsLoading) return;
    setHotelsLoading(true);
    try {
      const token = await getBrowserToken();
      if (!token) return;
      const out = await fetchHotels(trip.slug, 2, token);
      setNeighborhoods(out);
    } finally {
      setHotelsLoading(false);
    }
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <TripPanelTabs
        active={tab}
        onChange={(t) => {
          setTab(t);
          if (t === "Where to stay") loadHotels();
        }}
      />
      <div className="flex-1 p-3 overflow-auto flex flex-col gap-2">
        {tab === "Itinerary" &&
          days.map((d) => <DayCard key={d.number} day={d} isCurrent={d.number === 1} />)}

        {tab === "Restaurants" && (
          <ul className="flex flex-col gap-1">
            {restaurants.map((r, i) => (
              <li key={i} className="frosted rounded-card p-2 text-xs">
                <span className="font-semibold text-ink-900">{r[0]}</span>
                {r[1] && <span className="text-ink-500"> · {r[1]}</span>}
                {r[2] && <div className="text-ink-700 mt-1">{r[2]}</div>}
              </li>
            ))}
            {restaurants.length === 0 && (
              <p className="text-xs text-ink-500">No restaurants parsed.</p>
            )}
          </ul>
        )}

        {tab === "Where to stay" && (
          <>
            {hotelsLoading && <p className="text-xs text-ink-500">Picking neighbourhoods…</p>}
            {neighborhoods.map((n) => (
              <div key={n.label} className="flex flex-col gap-2">
                <div>
                  <div className="text-xs font-semibold text-ink-900">{n.label}</div>
                  <div className="text-[11px] text-ink-500">{n.description}</div>
                </div>
                {n.hotels.map((h) => (
                  <HotelCard key={h.name} hotel={h} />
                ))}
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

function parseDays(markdown: string): Day[] {
  const days: Day[] = [];
  const dayBlocks = markdown.split(/\n(?=### Day \d+:)/g).filter((b) => b.startsWith("### Day "));
  for (const block of dayBlocks) {
    const headerMatch = block.match(/^### Day (\d+):\s*(.+)/);
    if (!headerMatch) continue;
    const number = parseInt(headerMatch[1], 10);
    const title = headerMatch[2].trim();
    const bullets: Day["bullets"] = [];
    for (const time of ["Morning", "Afternoon", "Evening"] as const) {
      const re = new RegExp(`\\*\\*${time}:\\*\\*([\\s\\S]*?)(?=\\*\\*(?:Morning|Afternoon|Evening):\\*\\*|$)`);
      const m = block.match(re);
      if (m) {
        const items = m[1]
          .split("\n")
          .map((l) => l.replace(/^[-*]\s+/, "").trim())
          .filter(Boolean);
        if (items.length) bullets.push({ time, items });
      }
    }
    days.push({ number, title, bullets });
  }
  return days;
}

function parseTable(markdown: string, headerRe: RegExp): string[][] {
  const sections = markdown.split(/(?=^## )/m);
  const sec = sections.find((s) => headerRe.test(s));
  if (!sec) return [];
  const rows: string[][] = [];
  for (const line of sec.split("\n")) {
    const t = line.trim();
    if (!t.startsWith("|") || /^\|[-:| ]+\|$/.test(t)) continue;
    const cells = t.replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
    if (cells.length >= 2) rows.push(cells);
  }
  return rows.slice(1); // drop header row
}
```

- [ ] **Step 2: Manual test + commit**

```bash
cd /Users/viggy/travel-planning/web && npm run dev
# Open a trip, click "Restaurants" — table renders.
# Click "Where to stay" — wait for neighborhoods + hotels to load,
# verify each card has a Booking link.
cd /Users/viggy/travel-planning
git add web/
git commit -m "Wire Restaurants tab (markdown table) + Hotels tab (LLM picks)"
```

---

### Task 16: PDF export and Share button

**Files:**
- Modify: `web/app/trip/[slug]/TripView.tsx`

The backend's `GET /trips/:slug/pdf` reads the JWT from the `Authorization` header, so a plain `<a href>` link won't work. We fetch the PDF as a blob, then trigger download.

- [ ] **Step 1: Replace the two top-bar buttons in `TripView.tsx`**

Replace:
```tsx
<div className="flex gap-2">
  <button className="frosted rounded-btn px-3 py-1 text-xs">Share</button>
  <button className="frosted rounded-btn px-3 py-1 text-xs">Export PDF</button>
</div>
```

With:
```tsx
<div className="flex gap-2">
  <button
    onClick={() => {
      navigator.clipboard.writeText(window.location.href);
    }}
    className="frosted rounded-btn px-3 py-1 text-xs"
  >
    Share
  </button>
  <button
    onClick={async () => {
      const token = await getBrowserToken();
      if (!token) return;
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_BASE}/trips/${trip.slug}/pdf`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!res.ok) return;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${trip.destination.replace(/[ ,]+/g, "_")}_travel_guide.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    }}
    className="frosted rounded-btn px-3 py-1 text-xs"
  >
    Export PDF
  </button>
</div>
```

Add the import at top of the file:
```tsx
import { getBrowserToken } from "@/lib/auth";
```

- [ ] **Step 2: Manual test + commit**

```bash
cd /Users/viggy/travel-planning/web && npm run dev
# Click Share — paste from clipboard, confirm it's the trip URL.
# Click Export PDF — file downloads, opens correctly.
cd /Users/viggy/travel-planning
git add web/
git commit -m "Wire Share (clipboard) and Export PDF (auth fetch + blob download)"
```

---

## Phase 5 — Deploy + cleanup

### Task 17: Vercel project setup

This needs **the user**: connect GitHub repo to Vercel, configure env vars, set up the domain mapping. Surface and pause.

- [ ] **Step 1: Push branch to GitHub**

```bash
cd /Users/viggy/travel-planning
git push -u origin feature/atlas-frontend-cutover
```

- [ ] **Step 2: USER ACTION — create Vercel project**

Surface to user:

1. https://vercel.com/new → Import Git Repository → pick `travel-planning`.
2. **Root Directory:** set to `web` (Vercel detects Next.js automatically).
3. **Environment Variables — add these:**
   - `NEXT_PUBLIC_API_BASE` = `https://atlas-api-598507134096.us-central1.run.app` (or `https://api.atlas.viggy.dev` once cert is provisioned)
   - `NEXT_PUBLIC_SUPABASE_URL` = `https://xbiofbyfhpjpawimtmau.supabase.co`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = your anon key
   - `NEXT_PUBLIC_MAPBOX_TOKEN` = your Mapbox public token
4. Click **Deploy**. Wait ~2 minutes.
5. Verify the autogenerated `*.vercel.app` URL works: sign in, create a trip.

Tell me the deploy URL when ready.

- [ ] **Step 3: USER ACTION — map `atlas.viggy.dev` to Vercel**

In Vercel project → Settings → Domains → add `atlas.viggy.dev`. Vercel shows a DNS record to add — typically a CNAME pointing at `cname.vercel-dns.com`. Add it in Cloudflare with **proxy OFF** (gray cloud, same as the api subdomain).

Once it's saved, ping me — I'll smoke-test `https://atlas.viggy.dev`.

- [ ] **Step 4: Update Supabase Auth redirect URLs**

In Supabase → Authentication → URL Configuration:
- **Site URL:** `https://atlas.viggy.dev`
- **Redirect URLs:** add `https://atlas.viggy.dev/auth/callback`, keep `http://localhost:3000/auth/callback` for local dev.

Update the Google OAuth client in Google Cloud Console too — add `https://atlas.viggy.dev` and `https://xbiofbyfhpjpawimtmau.supabase.co/auth/v1/callback` to authorized origins/redirects.

---

### Task 18: Sunset the Streamlit app

After `atlas.viggy.dev` is live and you've verified end-to-end (sign in, generate, refine, hotels, PDF), retire `app.py`.

**Files:**
- Delete: `app.py`
- Delete: `requirements.txt`
- Delete: `packages.txt`
- Delete: `.streamlit/`
- Modify: root `README.md`

- [ ] **Step 1: Verify atlas.viggy.dev works end-to-end**

Manual checklist on https://atlas.viggy.dev :
- Sign in with allowlisted Google account
- Type a brief, watch streaming generation
- Open the generated trip — map renders with pins, panel shows itinerary
- Click Restaurants tab — table renders
- Click Where to stay — neighborhoods + Booking links render
- Type a refine instruction — itinerary updates
- Click Export PDF — file downloads
- Click Share — URL copies
- On a phone (or DevTools mobile mode), bottom sheet snaps to peek/half/full

If any step fails, fix before proceeding.

- [ ] **Step 2: Delete Streamlit files**

```bash
cd /Users/viggy/travel-planning
git rm app.py requirements.txt packages.txt
rm -rf .streamlit  # secrets.toml is gitignored, just nuke locally
```

- [ ] **Step 3: Update root `README.md`**

Replace any Streamlit-related content with a one-paragraph description pointing at the Next.js + FastAPI architecture. Reference the spec.

- [ ] **Step 4: Stop the Streamlit Cloud app (USER)**

Surface: "Go to your Streamlit Community Cloud dashboard and delete (or just stop) the deployed app. Once stopped, the public Streamlit URL will 404 — that's the cutover."

- [ ] **Step 5: Commit + merge to main**

```bash
cd /Users/viggy/travel-planning
git add -A
git commit -m "Sunset Streamlit app — Atlas is live at atlas.viggy.dev"
git checkout main
git merge feature/atlas-frontend-cutover
git push origin main
```

---

## Self-review

**1. Spec coverage**

| Spec section | Implemented in |
|---|---|
| D1 visual language (cream + amber + frosted glass) | Task 2 |
| Empty state hero with chat input + suggestion chips | Tasks 10, 11 |
| Smart pills for Dates/Airports inside chat input | Task 10 (visual stub — wiring in scope only if user asks; chip is illustrative for v1) |
| Trip history per Google account | Task 11 (TripsList) |
| Streaming generation with progress + incremental pins | Task 13 |
| Map-as-canvas with frosted itinerary panel | Task 12 |
| Mobile bottom sheet (peek/half/full) | Tasks 9, 12 |
| Itinerary / Restaurants / Where to stay tabs | Tasks 8, 15 |
| Refine via docked chat | Task 14 |
| Hotels rework: neighborhoods + Booking link-outs | Task 15 |
| PDF export | Task 16 |
| Share button (URL copy) | Task 16 |
| Auth via Google + allowlist | Tasks 4, 5 |
| Vercel deploy at atlas.viggy.dev | Task 17 |
| Sunset Streamlit | Task 18 |

**2. Placeholder scan** — None. Every step has the actual code or command.

**3. Type consistency** — `TripFull`, `TripDocument`, `Place`, `Hotel`, `Neighborhood`, `TripBriefIn` defined in Task 3 and used identically in Tasks 11–16. The `Day` interface is defined once in `DayCard.tsx` (Task 8) and re-imported by `TripPanel.tsx`.

**4. Known gaps and future work**

- **Smart pills are visually present but not parsed.** Task 10's `📅 Dates` and `✈️ Airports` chips are illustrative. The backend's `parse_brief` extracts these from natural language; if the user wants explicit pickers (date input + airport autocomplete) we add them in a follow-up.
- **Refine doesn't stream.** Task 14 uses the synchronous `POST /trips/:slug/refine`. The backend has a non-streaming refine route only; if we add streaming refine, it's a small follow-up.
- **No real-time pin highlight on day click** (clicking Day 2 doesn't fly the map to its pins). Add in v1.1 if useful.
- **No client-side cache.** Every visit to `/trip/[slug]` re-fetches. Fine for v1; consider SWR or React Query if it becomes annoying.
- **The custom Mapbox style** specified in the design (warm cream basemap, terracotta water) is **not** authored. Task 7 ships with `mapbox-gl/styles/light-v11`. If you want the bespoke style, author it in Mapbox Studio and swap the `style:` URL — that's a plan-2.5 task.
