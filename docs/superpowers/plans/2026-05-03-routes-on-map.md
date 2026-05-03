# Routes on Map Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a day is selected on the Itinerary tab, draw a dashed amber line connecting that day's mappable places in bullet order.

**Architecture:** Pure frontend. `Map.tsx` adds a single GL `line` layer driven by a GeoJSON source. The same `focusPlaces` array that today drives map fitting also feeds the route geometry. Empty / single-point days clear the source.

**Tech Stack:** MapLibre GL JS (already a dep), TypeScript, Next.js 16. No new deps, no backend changes, no migrations.

**Spec reference:** [docs/superpowers/specs/2026-05-03-routes-on-map-design.md](../specs/2026-05-03-routes-on-map-design.md)

---

## File structure

```
web/src/components/Map.tsx     MODIFIED: route source + layer; effect
                                          to update on focusPlaces change.
web/AGENTS.md                  MODIFIED: gotcha note about style-load
                                          timing for the route source.
```

---

### Task 1: Add the route source, layer, and update effect

**Files:**
- Modify: `web/src/components/Map.tsx`

- [ ] **Step 1: Register the route source + layer in the init effect**

In `web/src/components/Map.tsx`, find the first `useEffect` (the one that creates the map). Inside it, after `popupRef.current = popup;` but before the `return () => {...}` cleanup, add:

```typescript
    map.on("load", () => {
      // Route source (always present; data swapped on focusPlaces change).
      map.addSource("atlas-route", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      // Drawn beneath HTML markers automatically (HTML markers are not GL).
      map.addLayer({
        id: "atlas-route-line",
        type: "line",
        source: "atlas-route",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": "#b45309",      // amber-700
          "line-opacity": 0.5,
          "line-width": 3,
          "line-dasharray": [2, 2],
        },
      });
    });
```

- [ ] **Step 2: Add the route-update effect**

After the existing "Refit when focusPlaces changes" effect (around line 215), add a new effect:

```typescript
  // Update the route line whenever the active focus changes.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const apply = () => {
      const source = map.getSource("atlas-route") as
        | maplibregl.GeoJSONSource
        | undefined;
      if (!source) return;

      const points = (focusPlaces ?? []).filter(
        (p): p is Place & { lat: number; lng: number } =>
          p.lat !== null && p.lng !== null,
      );

      if (points.length < 2) {
        source.setData({ type: "FeatureCollection", features: [] });
        return;
      }

      source.setData({
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            properties: {},
            geometry: {
              type: "LineString",
              coordinates: points.map((p) => [p.lng, p.lat]),
            },
          },
        ],
      });
    };

    if (map.isStyleLoaded() && map.getSource("atlas-route")) apply();
    else map.once("idle", apply);
  }, [focusPlaces]);
```

- [ ] **Step 3: Type-check**

```bash
cd /Users/viggy/travel-planning/web && npx tsc --noEmit
```
Expected: clean.

- [ ] **Step 4: Build**

```bash
cd /Users/viggy/travel-planning/web && npm run build
```
Expected: clean. The `/trip/[slug]` and `/s/[token]` routes still appear.

- [ ] **Step 5: Manual smoke test**

```bash
cd /Users/viggy/travel-planning/web && npm run dev
```
Open `localhost:3000`, sign in, open an existing trip:
1. Itinerary tab → click Day 1 → dashed amber line appears connecting that day's places.
2. Click Day 2 → line redraws.
3. Switch to "Where to stay" tab → line disappears.
4. Switch back to Itinerary, click a different day → line reappears for the new day.
5. Open the same trip's `/s/{token}` (if shared) in incognito → same route behaviour.

- [ ] **Step 6: Commit**

```bash
cd /Users/viggy/travel-planning
git add web/src/components/Map.tsx
git commit -m "$(cat <<'EOF'
Draw active day's route as a dashed amber line on the map

When the user picks a day on the Itinerary tab, Map.tsx now draws a
GeoJSON LineString connecting that day's mappable places in bullet
order. The line clears when no day is active, when fewer than 2
places have valid coordinates, and when the user switches away from
the Itinerary tab.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Document the route-source gotcha in AGENTS.md

**Files:**
- Modify: `web/AGENTS.md`

- [ ] **Step 1: Add a gotcha note**

Open `web/AGENTS.md`. Inside the existing `# Web Gotchas` section, append a new bullet:

```markdown
- **Route source updates need a loaded style.** The `atlas-route` GeoJSON source is registered inside `map.on("load", ...)`. The effect that calls `setData()` on it must guard with `map.isStyleLoaded() && map.getSource("atlas-route")` — without that guard the first day-switch can fire before the source exists and crash with "Source 'atlas-route' is not in the map". Fall back to `map.once("idle", apply)` when the style isn't ready.
```

- [ ] **Step 2: Commit**

```bash
cd /Users/viggy/travel-planning
git add web/AGENTS.md
git commit -m "$(cat <<'EOF'
AGENTS.md: route-source style-load gotcha

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Push (Vercel auto-deploys; no backend deploy needed)

- [ ] **Step 1: Push**

```bash
cd /Users/viggy/travel-planning
git push
```

- [ ] **Step 2: Smoke test on https://atlas.viggy.dev**

Once Vercel finishes the auto-deploy (~1 min):

1. Open an existing trip → Itinerary → click any day → dashed amber line connects the day's places.
2. Switch days → line redraws.
3. Switch to "Where to stay" → line clears; switch back → reappears.
4. Open a public share `/s/{token}` in incognito → same route behaviour.

- [ ] **Step 3: Done**

No commit — push is the deployment.

---

## Self-review

**1. Spec coverage**

| Spec section                                | Implemented in |
| ---                                         | --- |
| Route source + layer registered after load  | Task 1 step 1 |
| Effect updates source on `focusPlaces`      | Task 1 step 2 |
| Empty / single-point days clear the line    | Task 1 step 2 (the `points.length < 2` branch) |
| Style-load timing handled                   | Task 1 step 2 (`isStyleLoaded` + `once("idle")`) |
| Public viewer inherits behaviour            | Same Map.tsx — verified in Task 1 step 5 / Task 3 step 2 |
| Visual: dashed amber 50% opacity, beneath markers | Task 1 step 1 (paint properties; HTML markers float above GL automatically) |
| AGENTS.md gotcha                            | Task 2 |
| Deploy                                      | Task 3 |

**2. Placeholder scan** — no TBDs / TODOs / "add appropriate handling". Each step shows the exact code or command. Task 1 step 1 names the precise insertion point ("after `popupRef.current = popup;` but before the cleanup return") so the implementer doesn't have to guess.

**3. Type consistency** — Source name `"atlas-route"` and layer id `"atlas-route-line"` are referenced consistently across Tasks 1 and 2. The `focusPlaces` filter uses the same `Place & { lat: number; lng: number }` narrowing already used elsewhere in `Map.tsx`. `setData` is the standard `GeoJSONSource` method on MapLibre and matches the source `type: "geojson"` declaration.
