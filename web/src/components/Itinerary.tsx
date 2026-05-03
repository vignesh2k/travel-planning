"use client";

import { useEffect, useMemo, useState } from "react";

import { combined } from "@/lib/currency";
import type { Budget, Place } from "@/lib/types";
import type { Day } from "./DayCard";

const TIME_META: Record<Day["bullets"][number]["time"], { icon: string; tint: string }> = {
  Morning:   { icon: "☀️", tint: "text-amber-600" },
  Afternoon: { icon: "🌤️", tint: "text-amber-700" },
  Evening:   { icon: "🌙", tint: "text-ink-700"   },
};

/** Substring-match a bullet to any place. Picks the longest place-name token
 *  that appears in the bullet, ignoring the trailing ", City, Country" suffix. */
function findPlaceForBullet(bullet: string, places: Place[]): Place | null {
  const lower = bullet.toLowerCase();
  let best: { p: Place; len: number } | null = null;
  for (const p of places) {
    const head = p.name.split(",")[0]?.trim();
    if (!head || head.length < 4) continue;
    if (lower.includes(head.toLowerCase())) {
      if (!best || head.length > best.len) best = { p, len: head.length };
    }
  }
  return best?.p ?? null;
}

function placesForDay(day: Day, places: Place[]): Place[] {
  const seen = new Set<string>();
  const out: Place[] = [];
  for (const b of day.bullets) {
    for (const item of b.items) {
      const p = findPlaceForBullet(item, places);
      if (p && !seen.has(p.name) && p.lat !== null && p.lng !== null) {
        seen.add(p.name);
        out.push(p);
      }
    }
  }
  return out;
}

/** Pick restaurants likely to be relevant to a given day, by checking whether
 *  the restaurant name or area appears in the day's title or bullets. */
function restaurantsForDay(
  day: Day,
  restaurants: string[][],
  allDays: Day[],
): string[][] {
  const dayText = (
    day.title + " " + day.bullets.flatMap((b) => b.items).join(" ")
  ).toLowerCase();

  const matched: string[][] = [];
  const unmatchedAnywhere: string[][] = [];

  for (const r of restaurants) {
    const name = (r[0] ?? "").toLowerCase().trim();
    const area = (r[1] ?? "").toLowerCase().trim();

    const matchesThisDay =
      (name.length >= 4 && dayText.includes(name)) ||
      (area.length >= 3 && dayText.includes(area));

    if (matchesThisDay) {
      matched.push(r);
      continue;
    }

    // Determine if this restaurant matches ANY day. If not, it's a "general"
    // recommendation — surface it on every day as a fallback.
    const anyDayText = allDays
      .map((d) => d.title + " " + d.bullets.flatMap((b) => b.items).join(" "))
      .join(" ")
      .toLowerCase();
    const matchesSomeDay =
      (name.length >= 4 && anyDayText.includes(name)) ||
      (area.length >= 3 && anyDayText.includes(area));

    if (!matchesSomeDay) unmatchedAnywhere.push(r);
  }

  return [...matched, ...unmatchedAnywhere];
}

export function Itinerary({
  days,
  places,
  restaurants,
  destination,
  budget,
  initialDay,
  onFocusPlaces,
  onRefinePrefill,
  onOpenBudgetDay,
}: {
  days: Day[];
  places: Place[];
  restaurants: string[][];
  destination: string;
  budget: Budget | null;
  initialDay?: number;
  onFocusPlaces: (places: Place[] | null) => void;
  onRefinePrefill: (text: string) => void;
  onOpenBudgetDay: (dayNumber: number) => void;
}) {
  const fallbackNum = days[0]?.number ?? 1;
  const seed =
    initialDay !== undefined && days.length > 0
      ? Math.min(Math.max(initialDay, 1), days.length)
      : fallbackNum;
  const [activeNum, setActiveNum] = useState<number>(seed);
  const active = useMemo(() => days.find((d) => d.number === activeNum) ?? days[0], [days, activeNum]);

  // When the active day changes, refocus the map.
  useEffect(() => {
    if (!active) return;
    const dayPlaces = placesForDay(active, places);
    onFocusPlaces(dayPlaces.length > 0 ? dayPlaces : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.number]);

  const dayRestaurants = useMemo(
    () => (active ? restaurantsForDay(active, restaurants, days) : []),
    [active, restaurants, days],
  );

  if (!active) {
    return <p className="text-xs text-ink-500 p-2">No itinerary yet.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Day stepper */}
      <div className="flex gap-1.5 overflow-x-auto -mx-1 px-1 pb-1">
        {days.map((d) => {
          const isActive = d.number === activeNum;
          return (
            <button
              key={d.number}
              onClick={() => setActiveNum(d.number)}
              className={
                isActive
                  ? "shrink-0 rounded-full px-3 py-1 text-xs font-semibold bg-amber-600 text-white shadow-sm"
                  : "shrink-0 rounded-full px-3 py-1 text-xs text-ink-700 bg-white/60 border border-amber-700/10 hover:bg-white/85 hover:border-amber-600/30"
              }
            >
              Day {d.number}
            </button>
          );
        })}
      </div>

      {/* Active day header */}
      <div className="flex items-start justify-between gap-2 px-1">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-amber-600">
            Day {active.number}
          </div>
          <div className="text-base font-semibold text-ink-900 leading-tight mt-0.5">
            {active.title}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {(() => {
            const bd = budget?.days.find((d) => d.number === active.number);
            if (!bd || !budget) return null;
            const total = (bd.override ?? bd.estimated)
              + bd.items.reduce((s, it) => s + it.amount, 0);
            return (
              <button
                type="button"
                onClick={() => onOpenBudgetDay(active.number)}
                className="text-[11px] rounded-full bg-amber-100 text-amber-800 px-2 py-0.5 hover:bg-amber-200"
                title="Open in Budget"
              >
                {combined(total, budget.currency, budget.gbp_rate)}
              </button>
            );
          })()}
          <button
            onClick={() => onRefinePrefill(`Refine Day ${active.number}: `)}
            className="text-[10px] text-ink-500 hover:text-amber-600 px-2 py-1 rounded-md"
            title="Open the refine input prefilled for this day"
          >
            ✨ Refine
          </button>
        </div>
      </div>

      {/* Time-of-day sections */}
      <div className="flex flex-col gap-3">
        {active.bullets.map((b) => (
          <section key={b.time} className="flex flex-col gap-1.5 anim-fade-in">
            <div className={`flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider ${TIME_META[b.time].tint}`}>
              <span aria-hidden>{TIME_META[b.time].icon}</span>
              {b.time}
            </div>
            <ul className="flex flex-col gap-1.5">
              {b.items.map((item, i) => {
                const place = findPlaceForBullet(item, places);
                const clickable = place && place.lat !== null && place.lng !== null;
                return (
                  <li key={i}>
                    <button
                      onClick={() => clickable && onFocusPlaces([place])}
                      disabled={!clickable}
                      className={
                        clickable
                          ? "w-full text-left rounded-[12px] bg-white/70 border border-amber-700/10 px-3 py-2 text-[12px] text-ink-900 leading-snug hover:bg-white/95 hover:border-amber-600/30 hover:shadow-sm flex items-start gap-2"
                          : "w-full text-left rounded-[12px] bg-white/40 border border-amber-700/10 px-3 py-2 text-[12px] text-ink-700 leading-snug flex items-start gap-2 cursor-default"
                      }
                    >
                      <span className="text-[14px] leading-none mt-0.5 shrink-0" aria-hidden>
                        {clickable ? CATEGORY_EMOJI[place.category] : "•"}
                      </span>
                      <span className="flex-1">{item}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}

        {/* Per-day restaurants */}
        {dayRestaurants.length > 0 && (
          <section className="flex flex-col gap-1.5 anim-fade-in">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-sage-500">
              <span aria-hidden>🍽️</span>
              Eat near here
            </div>
            <ul className="flex flex-col gap-1.5">
              {dayRestaurants.map((r, i) => {
                const query = [r[0], r[1], destination].filter(Boolean).join(" ");
                const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
                return (
                  <li key={i}>
                    <a
                      href={mapsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-[12px] bg-white/70 border border-amber-700/10 px-3 py-2 text-[12px] leading-snug hover:bg-white/95 hover:border-amber-600/30 hover:shadow-sm flex items-start gap-2"
                    >
                      <span className="text-[14px] leading-none mt-0.5 shrink-0" aria-hidden>🍽️</span>
                      <div className="flex-1 min-w-0">
                        <div>
                          <span className="font-semibold text-ink-900">{r[0]}</span>
                          {r[1] && <span className="text-ink-500"> · {r[1]}</span>}
                        </div>
                        {r[2] && <div className="text-ink-700 mt-0.5">{r[2]}</div>}
                        <div className="text-[10px] text-amber-700 mt-1">Reviews on Google Maps →</div>
                      </div>
                    </a>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}

export const CATEGORY_EMOJI: Record<Place["category"], string> = {
  neighbourhood: "🏛️",
  restaurant: "🍽️",
  photography_spot: "📷",
  logistics: "🧭",
};
