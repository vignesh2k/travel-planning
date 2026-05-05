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
  saving,
  onToggleEdit,
}: {
  trip: TripFull | PublicTrip;
  readOnly: boolean;
  editMode: boolean;
  saving: boolean;
  onToggleEdit: () => void;
}) {
  const health = planHealthForTrip(trip);
  const saved = "is_saved" in trip ? trip.is_saved : true;

  return (
    <section className="px-4 py-3 border-b border-amber-700/10 bg-white/30">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-amber-700">
            Travel desk
          </div>
          <h1 className="mt-0.5 text-base font-semibold leading-tight text-ink-900 truncate">
            {trip.destination}
          </h1>
          <div className="mt-1 flex flex-wrap gap-1.5 text-[10px] text-ink-600">
            <span className="rounded-full bg-white/65 border border-amber-700/10 px-2 py-0.5">
              {trip.days} days
            </span>
            <span className="rounded-full bg-white/65 border border-amber-700/10 px-2 py-0.5">
              {dateLabel(trip.start_date)}
            </span>
            <span className="rounded-full bg-white/65 border border-amber-700/10 px-2 py-0.5">
              {health.severity === "good" ? "Healthy" : health.severity === "watch" ? "Review" : "Attention"}
            </span>
            {!saved && !readOnly && (
              <span className="rounded-full bg-amber-100 text-amber-800 px-2 py-0.5">
                Draft
              </span>
            )}
          </div>
        </div>
        {!readOnly && (
          <button
            type="button"
            onClick={onToggleEdit}
            disabled={saving}
            className={
              editMode
                ? "shrink-0 rounded-[10px] bg-ink-900 text-white px-3 py-1.5 text-xs font-semibold hover:bg-ink-800 disabled:opacity-50"
                : "shrink-0 rounded-[10px] bg-white/80 border border-amber-700/10 px-3 py-1.5 text-xs font-semibold text-ink-900 hover:bg-white disabled:opacity-50"
            }
          >
            {saving ? "Saving" : editMode ? "Done" : "Edit"}
          </button>
        )}
      </div>
    </section>
  );
}
