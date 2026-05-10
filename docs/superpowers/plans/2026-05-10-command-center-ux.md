# Command Center UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the approved Command Center UX in phased, testable slices: clearer trip navigation, polished itinerary cards, bidirectional map sync, a Guide tab, and pragmatic visual QA.

**Architecture:** Keep the current `TripWorkspace` -> `TripPanel` -> `Itinerary` ownership model. Add small helper modules for workspace tabs and itinerary-place lookup, then layer reusable UI primitives into the existing components. The Guide/PDF work reuses the existing export API and keeps private budget data hidden from shared trips.

**Tech Stack:** Next.js 16, React 19, TypeScript, Tailwind CSS classes, Node `node:test`, MapLibre GL JS, optional `@playwright/test` for browser smoke checks.

**Spec reference:** [docs/superpowers/specs/2026-05-10-command-center-ux-design.md](../specs/2026-05-10-command-center-ux-design.md)

---

## File Structure

```
web/src/lib/workspace-tabs.ts              CREATED: tab visibility, labels, and mobile sheet rules.
web/src/lib/workspace-tabs.test.ts         CREATED: unit coverage for private/read-only/mobile tabs.
web/src/lib/trip-activity-index.ts         CREATED: map place -> day/activity lookup helpers.
web/src/lib/trip-activity-index.test.ts    CREATED: first-match and no-match coverage.
web/src/components/ui/AtlasPrimitives.tsx  CREATED: shared button, pill, icon badge, tab, panel classes.
web/src/components/MobileWorkspaceNav.tsx  CREATED: mobile bottom navigation for workspace tabs.
web/src/components/GuideTab.tsx            CREATED: guide preview/export workspace.
web/src/components/ActivityCard.tsx        CREATED: compact itinerary activity card.
web/src/components/TripWorkspace.tsx       MODIFIED: workspace tab state, mobile nav, map selected-place flow.
web/src/components/TripPanel.tsx           MODIFIED: five-tab model, Guide tab, Map tab sheet behavior.
web/src/components/TripPanelTabs.tsx       MODIFIED: shared tab primitive and new tab labels.
web/src/components/Itinerary.tsx           MODIFIED: ActivityCard rendering and place lookup callbacks.
web/src/components/Map.tsx                 MODIFIED: marker click callback remains, selected marker styling reused.
web/src/components/PdfExportMenu.tsx       MODIFIED: export option helpers shared with GuideTab.
web/src/lib/pdf-options.ts                 CREATED: guide/PDF option defaults and summary labels.
web/src/lib/pdf-options.test.ts            CREATED: option default and privacy rules coverage.
web/playwright.config.ts                   CREATED: browser smoke config.
web/tests/visual-smoke.spec.ts             CREATED: route/menu/mobile smoke coverage.
web/package.json                           MODIFIED: add `test:visual` script and Playwright dev dependency.
```

---

### Task 1: Workspace Tab Model

**Files:**
- Create: `web/src/lib/workspace-tabs.ts`
- Create: `web/src/lib/workspace-tabs.test.ts`

- [ ] **Step 1: Write the failing tab-model tests**

Create `web/src/lib/workspace-tabs.test.ts`:

```typescript
import assert from "node:assert/strict";
import test from "node:test";

import {
  isSheetTab,
  tabsForWorkspace,
  WORKSPACE_TAB_LABEL,
} from "./workspace-tabs.ts";

test("private desktop trips show every command center tab", () => {
  assert.deepEqual(tabsForWorkspace({ readOnly: false, isMobile: false }), [
    "Plan",
    "Map",
    "Stay",
    "Money",
    "Guide",
  ]);
});

test("private mobile trips hide Money from the primary bottom nav", () => {
  assert.deepEqual(tabsForWorkspace({ readOnly: false, isMobile: true }), [
    "Plan",
    "Map",
    "Stay",
    "Guide",
  ]);
});

test("read-only trips hide private money surfaces", () => {
  assert.deepEqual(tabsForWorkspace({ readOnly: true, isMobile: false }), [
    "Plan",
    "Map",
    "Stay",
    "Guide",
  ]);
});

test("map is not a sheet tab on mobile", () => {
  assert.equal(isSheetTab("Map"), false);
  assert.equal(isSheetTab("Plan"), true);
  assert.equal(isSheetTab("Guide"), true);
});

test("tab labels are stable", () => {
  assert.equal(WORKSPACE_TAB_LABEL.Plan, "Plan");
  assert.equal(WORKSPACE_TAB_LABEL.Money, "Money");
  assert.equal(WORKSPACE_TAB_LABEL.Guide, "Guide");
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run:

```bash
cd /Users/viggy/Documents/dev/travel-planning/web
node --test src/lib/workspace-tabs.test.ts
```

Expected: fail with `Cannot find module './workspace-tabs.ts'`.

- [ ] **Step 3: Implement the tab model**

Create `web/src/lib/workspace-tabs.ts`:

```typescript
export const WORKSPACE_TABS = ["Plan", "Map", "Stay", "Money", "Guide"] as const;

export type WorkspaceTab = (typeof WORKSPACE_TABS)[number];

export const WORKSPACE_TAB_LABEL: Record<WorkspaceTab, string> = {
  Plan: "Plan",
  Map: "Map",
  Stay: "Stay",
  Money: "Money",
  Guide: "Guide",
};

export function tabsForWorkspace({
  readOnly,
  isMobile,
}: {
  readOnly: boolean;
  isMobile: boolean;
}): WorkspaceTab[] {
  if (readOnly) return ["Plan", "Map", "Stay", "Guide"];
  if (isMobile) return ["Plan", "Map", "Stay", "Guide"];
  return [...WORKSPACE_TABS];
}

export function isSheetTab(tab: WorkspaceTab): boolean {
  return tab !== "Map";
}
```

- [ ] **Step 4: Run the tab-model test and verify it passes**

Run:

```bash
cd /Users/viggy/Documents/dev/travel-planning/web
node --test src/lib/workspace-tabs.test.ts
```

Expected: 5 passing tests.

- [ ] **Step 5: Commit**

```bash
cd /Users/viggy/Documents/dev/travel-planning
git add web/src/lib/workspace-tabs.ts web/src/lib/workspace-tabs.test.ts
git commit -m "Add workspace tab model"
```

---

### Task 2: Itinerary Place Lookup

**Files:**
- Create: `web/src/lib/trip-activity-index.ts`
- Create: `web/src/lib/trip-activity-index.test.ts`

- [ ] **Step 1: Write the failing lookup tests**

Create `web/src/lib/trip-activity-index.test.ts`:

```typescript
import assert from "node:assert/strict";
import test from "node:test";

import {
  activityIndexForPlace,
  activityMatchesPlace,
} from "./trip-activity-index.ts";
import type { TripDocument } from "./types.ts";

const document: TripDocument = {
  document_markdown: "",
  places: [
    {
      name: "Alvor Boardwalk",
      category: "photography_spot",
      description: "Wooden path through marshes",
      lat: 37.129,
      lng: -8.594,
    },
    {
      name: "Green Valley",
      category: "restaurant",
      description: "Plant-based lunch",
      lat: 37.13,
      lng: -8.59,
    },
  ],
  neighborhoods: [],
  restaurants: [],
  itinerary: [
    {
      number: 1,
      title: "Arrival",
      bullets: [
        {
          time: "Morning",
          items: ["Settle in and walk the riverfront."],
        },
      ],
    },
    {
      number: 2,
      title: "Coast",
      bullets: [
        {
          time: "Morning",
          items: ["Alvor Boardwalk, walk this long flat wooden path."],
        },
        {
          time: "Afternoon",
          items: ["Green Valley, plant-based lunch.", "Alvor Boardwalk again for sunset."],
        },
      ],
    },
  ],
};

test("activityMatchesPlace matches by place name in activity text", () => {
  assert.equal(
    activityMatchesPlace(
      "Alvor Boardwalk, walk this long flat wooden path.",
      "Alvor Boardwalk",
    ),
    true,
  );
});

test("activityMatchesPlace ignores case and punctuation differences", () => {
  assert.equal(activityMatchesPlace("green valley lunch", "Green Valley"), true);
});

test("activityIndexForPlace returns the first matching activity in itinerary order", () => {
  assert.deepEqual(activityIndexForPlace(document, "Alvor Boardwalk"), {
    dayNumber: 2,
    time: "Morning",
    itemIndex: 0,
    activityId: "day-2-morning-0",
    text: "Alvor Boardwalk, walk this long flat wooden path.",
  });
});

test("activityIndexForPlace returns null when the place is not referenced", () => {
  assert.equal(activityIndexForPlace(document, "Portimao Museum"), null);
});
```

- [ ] **Step 2: Run the lookup test and verify it fails**

Run:

```bash
cd /Users/viggy/Documents/dev/travel-planning/web
node --test src/lib/trip-activity-index.test.ts
```

Expected: fail with `Cannot find module './trip-activity-index.ts'`.

- [ ] **Step 3: Implement the lookup helper**

Create `web/src/lib/trip-activity-index.ts`:

```typescript
import { activityId } from "./planning-status.ts";
import type { ItineraryDay, TripDocument } from "./types.ts";

export interface ActivityIndexResult {
  dayNumber: number;
  time: ItineraryDay["bullets"][number]["time"];
  itemIndex: number;
  activityId: string;
  text: string;
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function activityMatchesPlace(activityText: string, placeName: string): boolean {
  const normalizedActivity = normalize(activityText);
  const normalizedPlace = normalize(placeName);
  if (!normalizedActivity || !normalizedPlace) return false;
  return normalizedActivity.includes(normalizedPlace);
}

export function activityIndexForPlace(
  document: TripDocument,
  placeName: string,
): ActivityIndexResult | null {
  for (const day of document.itinerary ?? []) {
    for (const group of day.bullets) {
      for (const [itemIndex, text] of group.items.entries()) {
        if (!activityMatchesPlace(text, placeName)) continue;
        return {
          dayNumber: day.number,
          time: group.time,
          itemIndex,
          activityId: activityId(day.number, group.time, itemIndex),
          text,
        };
      }
    }
  }
  return null;
}
```

- [ ] **Step 4: Run the lookup test and verify it passes**

Run:

```bash
cd /Users/viggy/Documents/dev/travel-planning/web
node --test src/lib/trip-activity-index.test.ts
```

Expected: 4 passing tests.

- [ ] **Step 5: Commit**

```bash
cd /Users/viggy/Documents/dev/travel-planning
git add web/src/lib/trip-activity-index.ts web/src/lib/trip-activity-index.test.ts
git commit -m "Add itinerary place lookup helpers"
```

---

### Task 3: Shared UI Primitives

**Files:**
- Create: `web/src/components/ui/AtlasPrimitives.tsx`

- [ ] **Step 1: Create the primitive module**

Create `web/src/components/ui/AtlasPrimitives.tsx`:

```tsx
import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";

export function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

type ButtonTone = "primary" | "secondary" | "ghost" | "danger";

const BUTTON_TONE: Record<ButtonTone, string> = {
  primary:
    "bg-gradient-to-br from-amber-400 to-amber-600 text-white shadow-sm hover:shadow-md disabled:opacity-50",
  secondary:
    "border border-amber-700/12 bg-white/80 text-ink-900 hover:bg-white disabled:opacity-50",
  ghost:
    "text-ink-600 hover:bg-white/70 hover:text-ink-900 disabled:opacity-50",
  danger:
    "border border-rose-100 bg-rose-50 text-rose-600 hover:bg-rose-100 disabled:opacity-50",
};

export function AtlasButton({
  tone = "secondary",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { tone?: ButtonTone }) {
  return (
    <button
      {...props}
      className={cx(
        "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-[10px] px-3 py-1.5 text-xs font-semibold transition-shadow",
        BUTTON_TONE[tone],
        className,
      )}
    />
  );
}

type PillTone = "neutral" | "ready" | "review" | "private";

const PILL_TONE: Record<PillTone, string> = {
  neutral: "border-amber-700/10 bg-white/70 text-ink-600",
  ready: "border-emerald-200 bg-emerald-50 text-emerald-700",
  review: "border-orange-200 bg-orange-50 text-orange-700",
  private: "border-amber-200 bg-amber-50 text-amber-700",
};

export function AtlasPill({
  tone = "neutral",
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: PillTone }) {
  return (
    <span
      {...props}
      className={cx(
        "inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold",
        PILL_TONE[tone],
        className,
      )}
    />
  );
}

type BadgeTone = "amber" | "sage" | "blue" | "ink";

const BADGE_TONE: Record<BadgeTone, string> = {
  amber: "bg-amber-600 text-white",
  sage: "bg-sage-500 text-white",
  blue: "bg-sky-700 text-white",
  ink: "bg-ink-800 text-white",
};

export function AtlasIconBadge({
  tone = "amber",
  children,
  className,
}: {
  tone?: BadgeTone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cx(
        "grid h-6 w-6 shrink-0 place-items-center rounded-[9px] text-[11px] font-bold",
        BADGE_TONE[tone],
        className,
      )}
      aria-hidden
    >
      {children}
    </span>
  );
}

export function AtlasPanel({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...props}
      className={cx(
        "rounded-[14px] border border-amber-700/10 bg-white/75 shadow-sm backdrop-blur-md",
        className,
      )}
    />
  );
}
```

- [ ] **Step 2: Type-check**

Run:

```bash
cd /Users/viggy/Documents/dev/travel-planning/web
npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
cd /Users/viggy/Documents/dev/travel-planning
git add web/src/components/ui/AtlasPrimitives.tsx
git commit -m "Add Atlas UI primitives"
```

---

### Task 4: Trip Shell Navigation

**Files:**
- Create: `web/src/components/MobileWorkspaceNav.tsx`
- Modify: `web/src/components/TripPanelTabs.tsx`
- Modify: `web/src/components/TripPanel.tsx`
- Modify: `web/src/components/TripWorkspace.tsx`

- [ ] **Step 1: Create mobile bottom navigation**

Create `web/src/components/MobileWorkspaceNav.tsx`:

```tsx
"use client";

import type { WorkspaceTab } from "@/lib/workspace-tabs";
import { WORKSPACE_TAB_LABEL } from "@/lib/workspace-tabs";

import { cx } from "./ui/AtlasPrimitives";

const TAB_ICON: Record<WorkspaceTab, string> = {
  Plan: "☰",
  Map: "⌖",
  Stay: "⌂",
  Money: "£",
  Guide: "▤",
};

export function MobileWorkspaceNav({
  tabs,
  active,
  onChange,
}: {
  tabs: readonly WorkspaceTab[];
  active: WorkspaceTab;
  onChange: (tab: WorkspaceTab) => void;
}) {
  return (
    <nav className="absolute inset-x-3 bottom-3 z-30 md:hidden">
      <div className="grid grid-cols-4 rounded-[16px] border border-amber-700/10 bg-white/88 p-1 shadow-2xl backdrop-blur-md">
        {tabs.map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => onChange(tab)}
            className={cx(
              "flex h-11 flex-col items-center justify-center gap-0.5 rounded-[12px] text-[10px] font-semibold",
              active === tab
                ? "bg-ink-900 text-white"
                : "text-ink-500 hover:bg-white hover:text-ink-900",
            )}
          >
            <span className="text-[13px]" aria-hidden>{TAB_ICON[tab]}</span>
            {WORKSPACE_TAB_LABEL[tab]}
          </button>
        ))}
      </div>
    </nav>
  );
}
```

- [ ] **Step 2: Update panel tabs to use `WorkspaceTab`**

Replace `web/src/components/TripPanelTabs.tsx` with:

```tsx
"use client";

import type { WorkspaceTab } from "@/lib/workspace-tabs";
import { WORKSPACE_TAB_LABEL } from "@/lib/workspace-tabs";

import { cx } from "./ui/AtlasPrimitives";

export function TripPanelTabs({
  active,
  onChange,
  tabs,
}: {
  active: WorkspaceTab;
  onChange: (tab: WorkspaceTab) => void;
  tabs: readonly WorkspaceTab[];
}) {
  return (
    <div className="flex gap-4 overflow-x-auto border-b border-amber-700/10 px-4 pt-3">
      {tabs.map((tab) => (
        <button
          key={tab}
          type="button"
          onClick={() => onChange(tab)}
          className={cx(
            "shrink-0 pb-2 text-xs",
            tab === active
              ? "border-b-2 border-amber-600 font-semibold text-ink-900"
              : "text-ink-500 hover:text-ink-700",
          )}
        >
          {WORKSPACE_TAB_LABEL[tab]}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Thread workspace tabs through TripPanel**

In `web/src/components/TripPanel.tsx`:

1. Replace the `Tab` import with:

```typescript
import type { WorkspaceTab } from "@/lib/workspace-tabs";
import { tabsForWorkspace } from "@/lib/workspace-tabs";
```

2. Remove `FULL_TABS` and `READONLY_TABS`.

3. Add props:

```typescript
  activeTab?: WorkspaceTab;
  isMobile?: boolean;
  onTabChange?: (tab: WorkspaceTab) => void;
```

4. Replace local tab state:

```typescript
  const [localTab, setLocalTab] = useState<WorkspaceTab>("Plan");
  const tab = activeTab ?? localTab;
  const visibleTabs = tabsForWorkspace({ readOnly, isMobile: Boolean(isMobile) });

  function changeTab(next: WorkspaceTab) {
    if (activeTab === undefined) setLocalTab(next);
    onTabChange?.(next);
    if (next === "Stay") void loadHotels();
    if (next !== "Plan") onFocusPlaces(null);
  }
```

5. Update `TripPanelTabs`:

```tsx
      <TripPanelTabs
        active={tab}
        tabs={visibleTabs}
        onChange={changeTab}
      />
```

6. Replace existing `setTab("Plan")`, `setTab("Money")`, and `setTab("Stay")` calls with `changeTab("Plan")`, `changeTab("Money")`, and `changeTab("Stay")`.

- [ ] **Step 4: Add workspace tab state in TripWorkspace**

In `web/src/components/TripWorkspace.tsx`:

1. Add imports:

```typescript
import { isSheetTab, tabsForWorkspace, type WorkspaceTab } from "@/lib/workspace-tabs";
import { MobileWorkspaceNav } from "./MobileWorkspaceNav";
```

2. Add state near `isMobile`:

```typescript
  const [workspaceTab, setWorkspaceTab] = useState<WorkspaceTab>("Plan");
  const visibleTabs = tabsForWorkspace({ readOnly, isMobile });
```

3. Pass tab props into `TripPanel`:

```tsx
      activeTab={workspaceTab}
      isMobile={isMobile}
      onTabChange={setWorkspaceTab}
```

4. Replace the mobile sheet condition:

```tsx
        {isMobile && isSheetTab(workspaceTab) && (
          <MobileSheet>{panel}</MobileSheet>
        )}
        {isMobile && (
          <MobileWorkspaceNav
            tabs={visibleTabs}
            active={workspaceTab}
            onChange={setWorkspaceTab}
          />
        )}
```

- [ ] **Step 5: Run checks**

Run:

```bash
cd /Users/viggy/Documents/dev/travel-planning/web
node --test src/lib/workspace-tabs.test.ts
npx tsc --noEmit
npm run lint
```

Expected: tests, TypeScript, and lint pass.

- [ ] **Step 6: Commit**

```bash
cd /Users/viggy/Documents/dev/travel-planning
git add web/src/components/MobileWorkspaceNav.tsx web/src/components/TripPanelTabs.tsx web/src/components/TripPanel.tsx web/src/components/TripWorkspace.tsx
git commit -m "Add command center workspace navigation"
```

---

### Task 5: Itinerary Activity Cards And Map Sync

**Files:**
- Create: `web/src/components/ActivityCard.tsx`
- Modify: `web/src/components/Itinerary.tsx`
- Modify: `web/src/components/TripPanel.tsx`

- [ ] **Step 1: Create the ActivityCard component**

Create `web/src/components/ActivityCard.tsx`:

```tsx
"use client";

import type { Place, PlanningStatusValue } from "@/lib/types";

import { StatusChip } from "./StatusChip";
import { AtlasIconBadge, cx } from "./ui/AtlasPrimitives";

const CATEGORY_BADGE: Record<Place["category"], { label: string; tone: "amber" | "sage" | "blue" | "ink" }> = {
  neighbourhood: { label: "N", tone: "blue" },
  restaurant: { label: "F", tone: "sage" },
  photography_spot: { label: "P", tone: "amber" },
  logistics: { label: "L", tone: "ink" },
};

export function ActivityCard({
  id,
  text,
  place,
  status,
  selected,
  focused,
  onFocus,
  onResetFocus,
}: {
  id: string;
  text: string;
  place: Place | null;
  status?: PlanningStatusValue;
  selected: boolean;
  focused: boolean;
  onFocus: () => void;
  onResetFocus: () => void;
}) {
  const clickable = Boolean(place?.lat !== null && place?.lng !== null);
  const badge = place ? CATEGORY_BADGE[place.category] : null;

  return (
    <div
      className={cx(
        "rounded-[13px] border bg-white/68 shadow-sm transition",
        focused && "border-amber-500/45 bg-amber-50 ring-2 ring-amber-500/25",
        selected && !focused && "border-amber-600/45 bg-[rgba(201,100,66,0.10)]",
        !selected && !focused && "border-amber-700/10 hover:border-amber-600/30 hover:bg-white/92",
      )}
    >
      <button
        id={id}
        type="button"
        onClick={() => {
          if (clickable) onFocus();
        }}
        onMouseEnter={() => {
          if (clickable) onFocus();
        }}
        onMouseLeave={onResetFocus}
        disabled={!clickable}
        className="flex w-full min-w-0 items-start gap-2 px-3 py-2 text-left disabled:cursor-default"
      >
        {badge ? (
          <AtlasIconBadge tone={badge.tone}>{badge.label}</AtlasIconBadge>
        ) : (
          <AtlasIconBadge tone="ink">•</AtlasIconBadge>
        )}
        <span className="min-w-0 flex-1 text-[12px] leading-5 text-ink-900">
          {text}
        </span>
        {status && (
          <span className="shrink-0 pt-0.5">
            <StatusChip value={status} compact />
          </span>
        )}
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Replace read-mode itinerary row rendering**

In `web/src/components/Itinerary.tsx`:

1. Add import:

```typescript
import { ActivityCard } from "./ActivityCard";
```

2. In the read-mode branch, replace the existing non-edit `<div>...</div>` row with:

```tsx
                      <ActivityCard
                        id={place ? placeDomId(place.name) : activityDomId(id)}
                        text={item}
                        place={place}
                        status={status}
                        selected={selected}
                        focused={isFocused}
                        onFocus={() => {
                          if (clickable) onFocusPlaces([place]);
                        }}
                        onResetFocus={() => {
                          const dayPlaces = placesForDay(active, places);
                          onFocusPlaces(dayPlaces.length > 0 ? dayPlaces : null);
                        }}
                      />
```

3. Keep `activityDomId(id)` on the wrapping `<li>` so health-panel scrolling still works.

- [ ] **Step 3: Use activity lookup for map pin clicks**

In `web/src/components/TripPanel.tsx`:

1. Import:

```typescript
import { activityIndexForPlace } from "@/lib/trip-activity-index";
```

2. Add an effect after the cleanup effect:

```typescript
  useEffect(() => {
    if (!selectedPlaceName) return;
    const match = activityIndexForPlace(draftDocument, selectedPlaceName);
    if (!match) return;
    setActiveDay(match.dayNumber);
    setFocusedActivityId(match.activityId);
    if (focusClearRef.current) clearTimeout(focusClearRef.current);
    const frame = requestAnimationFrame(() => {
      document
        .getElementById(activityDomId(match.activityId))
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
    focusClearRef.current = setTimeout(() => {
      setFocusedActivityId(null);
    }, 2200);
    return () => cancelAnimationFrame(frame);
  }, [draftDocument, selectedPlaceName]);
```

- [ ] **Step 4: Run checks**

Run:

```bash
cd /Users/viggy/Documents/dev/travel-planning/web
node --test src/lib/trip-activity-index.test.ts src/lib/map-focus.test.ts
npx tsc --noEmit
npm run lint
```

Expected: tests, TypeScript, and lint pass.

- [ ] **Step 5: Commit**

```bash
cd /Users/viggy/Documents/dev/travel-planning
git add web/src/components/ActivityCard.tsx web/src/components/Itinerary.tsx web/src/components/TripPanel.tsx
git commit -m "Polish itinerary cards and map sync"
```

---

### Task 6: Guide Tab And PDF Option Helpers

**Files:**
- Create: `web/src/lib/pdf-options.ts`
- Create: `web/src/lib/pdf-options.test.ts`
- Create: `web/src/components/GuideTab.tsx`
- Modify: `web/src/components/TripPanel.tsx`
- Modify: `web/src/components/PdfExportMenu.tsx`

- [ ] **Step 1: Write failing PDF option tests**

Create `web/src/lib/pdf-options.test.ts`:

```typescript
import assert from "node:assert/strict";
import test from "node:test";

import {
  defaultPdfSections,
  pdfSectionSummary,
  visiblePdfSections,
} from "./pdf-options.ts";

test("defaultPdfSections includes the core guide sections", () => {
  assert.deepEqual(defaultPdfSections(), [
    "food",
    "photos",
    "tips",
    "costs",
  ]);
});

test("visiblePdfSections hides costs for read-only trips", () => {
  assert.deepEqual(visiblePdfSections({ readOnly: true }), [
    "food",
    "photos",
    "tips",
  ]);
});

test("pdfSectionSummary formats selected sections", () => {
  assert.equal(
    pdfSectionSummary(["food", "photos", "tips"]),
    "Food spots, photo spots, and tips",
  );
});
```

- [ ] **Step 2: Run the PDF option test and verify it fails**

Run:

```bash
cd /Users/viggy/Documents/dev/travel-planning/web
node --test src/lib/pdf-options.test.ts
```

Expected: fail with `Cannot find module './pdf-options.ts'`.

- [ ] **Step 3: Implement PDF option helpers**

Create `web/src/lib/pdf-options.ts`:

```typescript
export const PDF_SECTIONS = [
  "food",
  "photos",
  "tips",
  "costs",
] as const;

export type PdfSectionKey = (typeof PDF_SECTIONS)[number];

export const PDF_SECTION_LABEL: Record<PdfSectionKey, string> = {
  food: "Food spots",
  photos: "Photo spots",
  tips: "Tips",
  costs: "Estimated costs",
};

export const PDF_STYLE_OPTIONS = [
  { key: "pretty", label: "Editorial" },
  { key: "compact", label: "Compact" },
  { key: "reference", label: "Classic" },
] as const;

export type PdfStyleKey = (typeof PDF_STYLE_OPTIONS)[number]["key"];

export function defaultPdfSections(): PdfSectionKey[] {
  return [...PDF_SECTIONS];
}

export function visiblePdfSections({ readOnly }: { readOnly: boolean }): PdfSectionKey[] {
  return readOnly ? PDF_SECTIONS.filter((section) => section !== "costs") : [...PDF_SECTIONS];
}

export function pdfSectionSummary(sections: readonly PdfSectionKey[]): string {
  const labels = sections.map((section) => PDF_SECTION_LABEL[section].toLowerCase());
  if (labels.length === 0) return "No optional sections";
  if (labels.length === 1) return PDF_SECTION_LABEL[sections[0]];
  if (labels.length === 2) return `${labels[0][0].toUpperCase()}${labels[0].slice(1)} and ${labels[1]}`;
  const head = labels.slice(0, -1);
  return `${head[0][0].toUpperCase()}${head[0].slice(1)}${head.slice(1).map((label) => `, ${label}`).join("")}, and ${labels[labels.length - 1]}`;
}
```

- [ ] **Step 4: Create GuideTab**

Create `web/src/components/GuideTab.tsx`:

```tsx
"use client";

import type { Budget, PublicTrip, TripFull } from "@/lib/types";
import {
  defaultPdfSections,
  pdfSectionSummary,
  visiblePdfSections,
} from "@/lib/pdf-options";

import { PdfExportMenu } from "./PdfExportMenu";
import { AtlasPanel, AtlasPill } from "./ui/AtlasPrimitives";

export function GuideTab({
  trip,
  budget,
  readOnly,
}: {
  trip: TripFull | PublicTrip;
  budget: Budget | null;
  readOnly: boolean;
}) {
  const sections = visiblePdfSections({ readOnly });
  const defaults = defaultPdfSections().filter((section) => sections.includes(section));
  const budgetText = budget && !readOnly
    ? `${budget.currency} budget can be included`
    : "Budget stays private";

  return (
    <div className="flex flex-col gap-3">
      <AtlasPanel className="overflow-hidden">
        <div className="border-b border-amber-700/10 bg-[linear-gradient(135deg,rgba(201,100,66,0.12),rgba(111,142,114,0.10))] px-4 py-5">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-amber-700">
            Atlas guide
          </div>
          <h2 className="mt-1 font-display text-2xl font-semibold leading-tight text-ink-900">
            {trip.destination}
          </h2>
          <p className="mt-1 text-xs leading-5 text-ink-600">
            {trip.days} day final guide with map-aware itinerary sections.
          </p>
        </div>
        <div className="flex flex-col gap-3 p-4">
          <div className="flex flex-wrap gap-1.5">
            <AtlasPill tone="private">{budgetText}</AtlasPill>
            <AtlasPill>{pdfSectionSummary(defaults)}</AtlasPill>
          </div>
          <p className="text-xs leading-5 text-ink-600">
            Preview the final artifact before export: cover, day-by-day
            schedule, food spots, practical tips, and private cost controls.
          </p>
          {!readOnly && "slug" in trip && (
            <PdfExportMenu
              slug={trip.slug}
              destination={trip.destination}
              days={trip.days}
              prominent
            />
          )}
        </div>
      </AtlasPanel>
    </div>
  );
}
```

- [ ] **Step 5: Wire GuideTab into TripPanel**

In `web/src/components/TripPanel.tsx`:

1. Import:

```typescript
import { GuideTab } from "./GuideTab";
```

2. After the `Stay` tab rendering block, add:

```tsx
        {tab === "Guide" && (
          <GuideTab
            trip={viewTrip}
            budget={budget}
            readOnly={readOnly}
          />
        )}
```

- [ ] **Step 6: Update PdfExportMenu to import shared options**

In `web/src/components/PdfExportMenu.tsx`:

1. Import:

```typescript
import {
  PDF_SECTION_LABEL,
  PDF_STYLE_OPTIONS,
  type PdfSectionKey,
  type PdfStyleKey,
} from "@/lib/pdf-options";
```

2. Replace the current local `SECTION_OPTIONS`, `SectionKey`, `STYLE_OPTIONS`, and `StyleKey` declarations with:

```typescript
const SECTION_OPTIONS = [
  { key: "food", label: PDF_SECTION_LABEL.food },
  { key: "photos", label: PDF_SECTION_LABEL.photos },
  { key: "tips", label: PDF_SECTION_LABEL.tips },
  { key: "costs", label: PDF_SECTION_LABEL.costs },
] as const satisfies readonly { key: PdfSectionKey; label: string }[];

type SectionKey = PdfSectionKey;

const STYLE_OPTIONS = PDF_STYLE_OPTIONS;

type StyleKey = PdfStyleKey;
```

This keeps the request body keys as `food`, `photos`, `tips`, and `costs`, which match the existing PDF build API.

- [ ] **Step 7: Run checks**

Run:

```bash
cd /Users/viggy/Documents/dev/travel-planning/web
node --test src/lib/pdf-options.test.ts
npx tsc --noEmit
npm run lint
npm run build
```

Expected: tests, TypeScript, lint, and build pass.

- [ ] **Step 8: Commit**

```bash
cd /Users/viggy/Documents/dev/travel-planning
git add web/src/lib/pdf-options.ts web/src/lib/pdf-options.test.ts web/src/components/GuideTab.tsx web/src/components/TripPanel.tsx web/src/components/PdfExportMenu.tsx
git commit -m "Add guide tab preview"
```

---

### Task 7: Visual Smoke Checks

**Files:**
- Create: `web/playwright.config.ts`
- Create: `web/tests/visual-smoke.spec.ts`
- Modify: `web/package.json`

- [ ] **Step 1: Install Playwright test runner**

Run:

```bash
cd /Users/viggy/Documents/dev/travel-planning/web
npm install -D @playwright/test
```

Expected: `package.json` and `package-lock.json` update with `@playwright/test`.

- [ ] **Step 2: Add a visual test script**

In `web/package.json`, add this script after `build`:

```json
"test:visual": "playwright test"
```

The `scripts` object should become:

```json
"scripts": {
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "lint": "eslint",
  "test:visual": "playwright test"
}
```

- [ ] **Step 3: Create Playwright config**

Create `web/playwright.config.ts`:

```typescript
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  timeout: 30_000,
  expect: {
    timeout: 5_000,
  },
  use: {
    baseURL: "http://127.0.0.1:3000",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 900 } },
    },
    {
      name: "mobile",
      use: { ...devices["iPhone 13"] },
    },
  ],
  webServer: {
    command: "npm run dev -- --hostname 127.0.0.1 --port 3000",
    url: "http://127.0.0.1:3000/auth/signin",
    reuseExistingServer: true,
    timeout: 30_000,
  },
});
```

- [ ] **Step 4: Create smoke tests**

Create `web/tests/visual-smoke.spec.ts`:

```typescript
import { expect, test } from "@playwright/test";

test("sign-in route renders branded entry", async ({ page }) => {
  await page.goto("/auth/signin");
  await expect(page.getByRole("heading", { name: "Atlas" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Sign in with Google|Signing in/ })).toBeVisible();
});

test("offline route renders recovery link", async ({ page }) => {
  await page.goto("/offline");
  await expect(page.getByRole("heading", { name: "You're offline" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Home" })).toBeVisible();
});

test("missing shared route renders branded fallback", async ({ page }) => {
  await page.goto("/s/not-a-real-token");
  await expect(page.getByRole("heading", { name: "Shared plan not found" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Back to Atlas" })).toBeVisible();
});
```

- [ ] **Step 5: Run visual smoke checks**

Run:

```bash
cd /Users/viggy/Documents/dev/travel-planning/web
npm run test:visual
```

Expected: all smoke tests pass in desktop and mobile projects.

- [ ] **Step 6: Commit**

```bash
cd /Users/viggy/Documents/dev/travel-planning
git add web/package.json web/package-lock.json web/playwright.config.ts web/tests/visual-smoke.spec.ts
git commit -m "Add visual smoke checks"
```

---

### Task 8: Final Verification And Push

**Files:**
- Verify all changed files.

- [ ] **Step 1: Run full frontend verification**

Run:

```bash
cd /Users/viggy/Documents/dev/travel-planning/web
npm run lint
npx tsc --noEmit
node --test src/lib/planning-status.test.ts src/lib/trip-health.test.ts src/lib/map-focus.test.ts src/lib/workspace-tabs.test.ts src/lib/trip-activity-index.test.ts src/lib/pdf-options.test.ts
npm run build
npm run test:visual
```

Expected: every command exits with code 0. The `node --test` command may print module type warnings only.

- [ ] **Step 2: Check git status**

Run:

```bash
cd /Users/viggy/Documents/dev/travel-planning
git status --short --branch
```

Expected: clean worktree on `main`, ahead of `origin/main` by the command-center commits.

- [ ] **Step 3: Push**

Run:

```bash
cd /Users/viggy/Documents/dev/travel-planning
git push origin main
```

Expected: push succeeds.

---

## Self-Review

**Spec coverage**

| Spec requirement | Implemented in |
| --- | --- |
| Shared primitives | Task 3 |
| Five-tab desktop navigation | Task 1 and Task 4 |
| Mobile bottom nav with no primary Money tab | Task 1 and Task 4 |
| Structured activity cards | Task 5 |
| Map pin click scrolls matching card | Task 2 and Task 5 |
| First itinerary match wins | Task 2 tests |
| Guide preview/export workspace | Task 6 |
| Budget hidden for read-only guide surfaces | Task 6 tests |
| Browser smoke/visual guardrails | Task 7 |
| Final verification and push | Task 8 |

**Placeholder scan**

No task uses `TBD`, `TODO`, `implement later`, `fill in details`, `similar to`, or an unspecified testing instruction. Each code-changing step names exact files and includes concrete code or replacement instructions.

**Type consistency**

`WorkspaceTab` is defined once in `workspace-tabs.ts` and reused by `TripPanelTabs`, `TripPanel`, `TripWorkspace`, and `MobileWorkspaceNav`. `activityIndexForPlace` returns the same `activityId` format produced by `planning-status.ts`, so existing `activityDomId()` scrolling continues to work. `PdfSectionKey` is defined in `pdf-options.ts` and reused by `PdfExportMenu` and `GuideTab`.
