"use client";

import type { PublicTrip, TripFull } from "@/lib/types";
import { planHealthForTrip } from "@/lib/trip-health";

function dateLabel(iso: string | null): string {
  if (!iso) return "Dates open";
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export function TripDeskHeader({
  trip,
  readOnly,
  editMode,
  onToggleEdit,
}: {
  trip: TripFull | PublicTrip;
  readOnly: boolean;
  editMode: boolean;
  onToggleEdit: () => void;
}) {
  const health = planHealthForTrip(trip);

  return (
    <section className="border-b border-amber-700/10 bg-white/38 px-4 py-2.5">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-amber-700">
            Travel desk
          </div>
          <h1 className="mt-0.5 truncate text-[15px] font-semibold leading-tight text-ink-900">
            {trip.destination}
          </h1>
        </div>
        {!readOnly && (
          <button
            type="button"
            onClick={onToggleEdit}
            className={
              editMode
                ? "shrink-0 rounded-[10px] bg-ink-900 px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
                : "shrink-0 rounded-[10px] border border-amber-700/10 bg-white/80 px-3 py-1.5 text-xs font-semibold text-ink-900 hover:bg-white disabled:opacity-50"
            }
          >
            {editMode ? "Done" : "Edit"}
          </button>
        )}
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] text-ink-600">
        <span className="rounded-full border border-amber-700/10 bg-white/65 px-2 py-0.5">
          {trip.days} days
        </span>
        <span className="rounded-full border border-amber-700/10 bg-white/65 px-2 py-0.5">
          {dateLabel(trip.start_date)}
        </span>
        <span className="rounded-full border border-amber-700/10 bg-white/65 px-2 py-0.5">
          {health.severity === "good" ? "Healthy" : health.severity === "watch" ? "Review" : "Attention"}
        </span>
      </div>
    </section>
  );
}
