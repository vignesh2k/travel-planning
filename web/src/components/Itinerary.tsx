"use client";

import { useEffect, useMemo, useState } from "react";

import type { Place } from "@/lib/types";
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

export function Itinerary({
  days,
  places,
  onFocusPlaces,
  onRefinePrefill,
}: {
  days: Day[];
  places: Place[];
  onFocusPlaces: (places: Place[] | null) => void;
  onRefinePrefill: (text: string) => void;
}) {
  const [activeNum, setActiveNum] = useState<number>(days[0]?.number ?? 1);
  const active = useMemo(() => days.find((d) => d.number === activeNum) ?? days[0], [days, activeNum]);

  // When the active day changes, refocus the map.
  useEffect(() => {
    if (!active) return;
    const dayPlaces = placesForDay(active, places);
    onFocusPlaces(dayPlaces.length > 0 ? dayPlaces : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.number]);

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
        <button
          onClick={() => onRefinePrefill(`Refine Day ${active.number}: `)}
          className="text-[10px] text-ink-500 hover:text-amber-600 px-2 py-1 rounded-md"
          title="Open the refine input prefilled for this day"
        >
          ✨ Refine
        </button>
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
                      {clickable && (
                        <span
                          className="mt-1 w-2 h-2 rounded-full shrink-0"
                          style={{ background: PIN_COLOR[place.category] }}
                          aria-hidden
                        />
                      )}
                      <span className="flex-1">{item}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}

const PIN_COLOR: Record<Place["category"], string> = {
  neighbourhood: "#4285f4",
  restaurant: "#34a853",
  photography_spot: "#ea4335",
  logistics: "#9534e6",
};
