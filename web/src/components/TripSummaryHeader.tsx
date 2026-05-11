"use client";

import { useMemo } from "react";

import { buildTripInsightSummary } from "@/lib/trip-insights";
import type { Budget, Place, PublicTrip, TripFull } from "@/lib/types";

export function TripSummaryHeader({
  trip,
  budget,
  readOnly,
  onFocusPlaces,
  onOpenMoney,
}: {
  trip: TripFull | PublicTrip;
  budget: Budget | null;
  readOnly: boolean;
  onFocusPlaces: (places: Place[] | null) => void;
  onOpenMoney: () => void;
}) {
  const summary = useMemo(
    () => buildTripInsightSummary(trip.document, budget),
    [trip.document, budget],
  );
  const allMapped = trip.document.places.filter((p) => p.lat !== null && p.lng !== null);

  return (
    <section className="frosted rounded-[14px] p-3 flex flex-col gap-2.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-amber-700">
            Trip shape
          </div>
          <div className="mt-1 text-[13px] font-semibold text-ink-900 leading-snug">
            {summary.route}
          </div>
        </div>
        <button
          type="button"
          onClick={() => onFocusPlaces(allMapped.length > 0 ? allMapped : null)}
          className="shrink-0 rounded-full bg-white/80 border border-amber-700/10 px-2.5 py-1 text-[11px] font-semibold text-ink-700 hover:bg-white/95"
        >
          {summary.mappedStops} pins
        </button>
      </div>

      <div className="flex flex-wrap gap-1.5">
        <SummaryPill label={summary.pace} strong />
        {summary.neighbourhoods.map((n) => (
          <SummaryPill key={n} label={n} />
        ))}
        {summary.budgetLabel && (
          <button
            type="button"
            onClick={onOpenMoney}
            disabled={readOnly}
            className="rounded-full border border-amber-300/60 bg-amber-100 px-2.5 py-1 text-[11px] font-semibold text-amber-800 disabled:cursor-default"
            title={readOnly ? undefined : "Open Money"}
          >
            {summary.budgetLabel}
          </button>
        )}
      </div>

      <div className="flex flex-col gap-1">
        {summary.qualityNotes.map((note) => (
          <div key={note} className="flex items-start gap-2 text-[11px] leading-4 text-ink-600">
            <span
              className="mt-[5px] h-1.5 w-1.5 rounded-full bg-amber-600 shrink-0"
              aria-hidden
            />
            <span>{note}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function SummaryPill({ label, strong = false }: { label: string; strong?: boolean }) {
  return (
    <span className={strong
      ? "rounded-full bg-white/85 border border-amber-700/12 px-2.5 py-1 text-[11px] font-semibold text-ink-900"
      : "rounded-full bg-white/55 border border-amber-700/10 px-2.5 py-1 text-[11px] text-ink-600"}
    >
      {label}
    </span>
  );
}
