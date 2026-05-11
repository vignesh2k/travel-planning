"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { combined } from "@/lib/currency";
import {
  addItineraryItem,
  removeItineraryItem,
  updateItineraryItem,
} from "@/lib/itinerary-editing";
import { PLACE_CATEGORY_EMOJI } from "@/lib/place-category";
import { activityId, PLANNING_STATUSES, setActivityStatus, STATUS_META } from "@/lib/planning-status";
import { placeForText, placesForDay } from "@/lib/trip-insights";
import type {
  Budget,
  ItineraryDay,
  Place,
  PlanningStatusValue,
  TripDocument,
} from "@/lib/types";

import { ActivityCard } from "./ActivityCard";

const TIME_META: Record<ItineraryDay["bullets"][number]["time"], { icon: string; tint: string }> = {
  Morning:   { icon: "☀️", tint: "text-amber-600" },
  Afternoon: { icon: "🌤️", tint: "text-amber-700" },
  Evening:   { icon: "🌙", tint: "text-ink-700"   },
};

/** Pick restaurants likely to be relevant to a given day, by checking whether
 *  the restaurant name or area appears in the day's title or bullets. */
function restaurantsForDay(
  day: ItineraryDay,
  restaurants: string[][],
  allDays: ItineraryDay[],
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
  document: tripDocument,
  destination,
  budget,
  readOnly,
  editMode,
  initialDay,
  activeDay,
  focusedActivityId,
  selectedPlaceName,
  onFocusPlaces,
  onActiveDayChange,
  onRefinePrefill,
  onDocumentChange,
  onOpenBudgetDay,
}: {
  document: TripDocument;
  destination: string;
  budget: Budget | null;
  readOnly: boolean;
  editMode: boolean;
  initialDay?: number;
  activeDay?: number;
  focusedActivityId?: string | null;
  selectedPlaceName?: string | null;
  onFocusPlaces: (places: Place[] | null) => void;
  onActiveDayChange?: (dayNumber: number) => void;
  onRefinePrefill: (text: string) => void;
  onDocumentChange: (document: TripDocument) => void;
  onOpenBudgetDay: (dayNumber: number) => void;
}) {
  const days = useMemo(() => tripDocument.itinerary ?? [], [tripDocument.itinerary]);
  const places = useMemo(() => tripDocument.places ?? [], [tripDocument.places]);
  const restaurants = useMemo(() => tripDocument.restaurants ?? [], [tripDocument.restaurants]);
  const planning = tripDocument.planning;
  const fallbackNum = days[0]?.number ?? 1;
  const seed =
    initialDay !== undefined && days.length > 0
      ? Math.min(Math.max(initialDay, 1), days.length)
      : fallbackNum;
  const [localActiveNum, setLocalActiveNum] = useState<number>(seed);
  const activeNum = activeDay ?? localActiveNum;
  const active = useMemo(() => days.find((d) => d.number === activeNum) ?? days[0], [days, activeNum]);

  const focusActiveDay = useCallback((day: ItineraryDay | undefined) => {
    if (!day) return;
    const dayPlaces = placesForDay(day, places);
    onFocusPlaces(dayPlaces.length > 0 ? dayPlaces : null);
  }, [onFocusPlaces, places]);

  const setActiveNumber = useCallback((dayNumber: number) => {
    setLocalActiveNum(dayNumber);
    onActiveDayChange?.(dayNumber);
  }, [onActiveDayChange]);

  const selectDay = useCallback((day: ItineraryDay) => {
    setActiveNumber(day.number);
    focusActiveDay(day);
  }, [focusActiveDay, setActiveNumber]);

  // When the active day changes, refocus the map.
  useEffect(() => {
    if (!active || selectedPlaceName) return;
    focusActiveDay(active);
  }, [active, focusActiveDay, selectedPlaceName]);

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
              onClick={() => selectDay(d)}
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
                title="Open in Money"
              >
                {combined(total, budget.currency, budget.gbp_rate)}
              </button>
            );
          })()}
          {!readOnly && (
            <button
              onClick={() => onRefinePrefill(`Refine Day ${active.number}: `)}
              className="text-[10px] text-ink-500 hover:text-amber-600 px-2 py-1 rounded-md"
              title="Open the refine input prefilled for this day"
            >
              Refine
            </button>
          )}
        </div>
      </div>

      {!readOnly && (
        <div className="flex gap-1.5 overflow-x-auto -mx-1 px-1 pb-1">
        {[
          ["Slower", `Refine Day ${active.number}: make the day slower with fewer stops and more breathing room.`],
          ["Less touristy", `Refine Day ${active.number}: make this less touristy and more local.`],
          ["Rain backup", `Refine Day ${active.number}: add rainy-day backup options.`],
          ["Cheaper", `Refine Day ${active.number}: lower the cost without making the day feel thin.`],
        ].map(([label, prompt]) => (
          <button
            key={label}
            type="button"
            onClick={() => onRefinePrefill(prompt)}
            className="shrink-0 rounded-full bg-white/60 border border-amber-700/10 px-2.5 py-1 text-[11px] text-ink-700 hover:bg-white/90 hover:border-amber-600/30"
          >
            {label}
          </button>
        ))}
        </div>
      )}

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
                const place = placeForText(item, places);
                const clickable = Boolean(place && place.lat !== null && place.lng !== null);
                const selected = place?.name === selectedPlaceName;
                const id = activityId(active.number, b.time, i);
                const status = planning?.statuses[id];
                const isFocused = focusedActivityId === id;
                return (
                  <li
                    key={`${b.time}-${i}`}
                    id={activityDomId(id)}
                    className="relative scroll-mt-4"
                  >
                    {editMode ? (
                      <div className={isFocused ? "rounded-[14px] ring-2 ring-amber-500/35 ring-offset-2 ring-offset-transparent" : undefined}>
                        <ActivityEditorRow
                          item={item}
                          place={place}
                          status={status}
                          onFocusPlaces={onFocusPlaces}
                          onStatusChange={(nextStatus) => {
                            onDocumentChange(setActivityStatus(tripDocument, id, nextStatus));
                          }}
                          onChange={(value) => {
                            onDocumentChange(updateItineraryItem(tripDocument, active.number, b.time, i, value));
                          }}
                          onCommit={(value) => {
                            const trimmed = value.trim();
                            onDocumentChange(
                              trimmed
                                ? updateItineraryItem(tripDocument, active.number, b.time, i, trimmed)
                                : removeItineraryItem(tripDocument, active.number, b.time, i),
                            );
                          }}
                          onRemove={() => onDocumentChange(removeItineraryItem(tripDocument, active.number, b.time, i))}
                        />
                      </div>
                    ) : (
                      <ActivityCard
                        id={undefined}
                        text={item}
                        place={place}
                        status={status}
                        selected={selected}
                        focused={isFocused}
                        onFocus={() => {
                          if (clickable && place) onFocusPlaces([place]);
                        }}
                        onResetFocus={() => {
                          const dayPlaces = placesForDay(active, places);
                          onFocusPlaces(dayPlaces.length > 0 ? dayPlaces : null);
                        }}
                      />
                    )}
                  </li>
                );
              })}
            </ul>
            {editMode && (
              <button
                type="button"
                onClick={() => onDocumentChange(addItineraryItem(tripDocument, active.number, b.time))}
                className="rounded-[10px] border border-dashed border-amber-700/20 bg-white/45 px-3 py-2 text-left text-[11px] font-medium text-amber-800 hover:bg-white/80"
              >
                Add {b.time.toLowerCase()} item
              </button>
            )}
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

function ActivityEditorRow({
  item,
  place,
  status,
  onFocusPlaces,
  onStatusChange,
  onChange,
  onCommit,
  onRemove,
}: {
  item: string;
  place: Place | null;
  status?: PlanningStatusValue;
  onFocusPlaces: (places: Place[] | null) => void;
  onStatusChange: (status: PlanningStatusValue) => void;
  onChange: (value: string) => void;
  onCommit: (value: string) => void;
  onRemove: () => void;
}) {
  const clickable = place && place.lat !== null && place.lng !== null;

  return (
    <div className="rounded-[12px] bg-white/75 border border-amber-700/10 p-2 flex flex-col gap-2">
      <div className="flex items-start gap-2">
        <button
          type="button"
          onClick={() => clickable && onFocusPlaces([place])}
          disabled={!clickable}
          className="mt-1 text-[14px] leading-none shrink-0 disabled:opacity-50"
          title={clickable ? "Focus map" : undefined}
        >
          {clickable ? PLACE_CATEGORY_EMOJI[place.category] : "•"}
        </button>
        <textarea
          value={item}
          rows={2}
          onChange={(e) => onChange(e.target.value)}
          onBlur={(e) => onCommit(e.currentTarget.value)}
          className="min-w-0 flex-1 resize-none rounded-[9px] border border-amber-700/10 bg-white/80 px-2.5 py-2 text-[12px] leading-snug text-ink-900 outline-none focus:border-amber-600/40 focus:bg-white"
        />
      </div>
      <div className="flex items-center gap-1.5 pl-6">
        <StatusPicker value={status ?? "idea"} onChange={onStatusChange} />
        <button
          type="button"
          onClick={onRemove}
          className="ml-auto rounded-full bg-rose-50 border border-rose-100 px-2 py-0.5 text-[10px] text-rose-600 hover:bg-rose-100"
        >
          Remove
        </button>
      </div>
    </div>
  );
}

function StatusPicker({
  value,
  onChange,
}: {
  value: PlanningStatusValue;
  onChange: (status: PlanningStatusValue) => void;
}) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const current = STATUS_META[value];

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false);
    }
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-6 items-center gap-1.5 rounded-full border border-amber-700/10 bg-white/85 px-2 text-[10px] font-medium text-ink-700 shadow-sm hover:bg-white"
        aria-haspopup="listbox"
        aria-expanded={open}
        title="Set activity status"
      >
        <span className="text-ink-400">Status</span>
        <span className="font-semibold text-ink-900">{current.label}</span>
        <svg
          width="10"
          height="10"
          viewBox="0 0 10 10"
          aria-hidden
          className={open ? "rotate-180 transition-transform duration-150" : "transition-transform duration-150"}
        >
          <path d="M2.2 3.7 5 6.3l2.8-2.6" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      <div
        className={
          open
            ? "absolute left-0 bottom-8 z-30 w-36 origin-bottom-left scale-100 opacity-100 transition-all duration-150 ease-out"
            : "pointer-events-none absolute left-0 bottom-8 z-30 w-36 origin-bottom-left scale-95 opacity-0 transition-all duration-100 ease-in"
        }
      >
        <div className="overflow-hidden rounded-[12px] border border-amber-700/10 bg-white shadow-lg ring-1 ring-ink-900/5">
          <div className="px-2 py-1.5 text-[9px] font-semibold uppercase tracking-wider text-ink-400">
            Status
          </div>
          <div role="listbox" aria-label="Activity status" className="pb-1">
            {PLANNING_STATUSES.map((option) => {
              const meta = STATUS_META[option];
              const selected = option === value;
              return (
                <button
                  key={option}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onClick={() => {
                    onChange(option);
                    setOpen(false);
                  }}
                  className={
                    selected
                      ? "flex w-full items-center justify-between gap-2 bg-amber-50 px-2.5 py-1.5 text-left text-[11px] font-semibold text-ink-900"
                      : "flex w-full items-center justify-between gap-2 px-2.5 py-1.5 text-left text-[11px] text-ink-700 hover:bg-amber-50/70"
                  }
                >
                  <span>{meta.label}</span>
                  {selected && (
                    <svg width="11" height="11" viewBox="0 0 11 11" aria-hidden className="text-amber-700">
                      <path d="m2.2 5.7 2 2 4.6-4.9" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

export function activityDomId(id: string): string {
  return `itinerary-activity-${id}`;
}
