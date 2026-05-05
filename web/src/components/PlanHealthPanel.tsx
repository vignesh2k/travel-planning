"use client";

import type { PublicTrip, TripDocument, TripFull } from "@/lib/types";
import { dismissHealthCheck, planHealthForTrip } from "@/lib/trip-health";

const SEVERITY_CLASS = {
  good: "bg-emerald-100 text-emerald-700 border-emerald-200",
  watch: "bg-amber-100 text-amber-800 border-amber-200",
  risk: "bg-rose-100 text-rose-700 border-rose-200",
};

export function PlanHealthPanel({
  trip,
  readOnly,
  onDocumentChange,
}: {
  trip: TripFull | PublicTrip;
  readOnly: boolean;
  onDocumentChange?: (document: TripDocument) => void;
}) {
  const summary = planHealthForTrip(trip);

  return (
    <section className="frosted rounded-[14px] p-3 flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-500">
            Plan health
          </div>
          <div className="text-sm font-semibold text-ink-900 mt-0.5">
            {summary.severity === "good" ? "Ready to travel" : summary.severity === "watch" ? "Worth a pass" : "Needs attention"}
          </div>
        </div>
        <div className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${SEVERITY_CLASS[summary.severity]}`}>
          {summary.score}%
        </div>
      </div>

      {summary.checks.length === 0 ? (
        <div className="text-[11px] leading-4 text-ink-600">
          Dates, coverage, bookings, and map anchors look balanced.
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {summary.checks.map((check) => (
            <div key={check.id} className="rounded-[10px] bg-white/60 border border-amber-700/10 p-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-[11px] font-semibold text-ink-900">{check.title}</div>
                  <div className="text-[10px] leading-4 text-ink-600 mt-0.5">{check.detail}</div>
                </div>
                {!readOnly && onDocumentChange && (
                  <button
                    type="button"
                    onClick={() => onDocumentChange(dismissHealthCheck(trip.document, check.id))}
                    className="shrink-0 rounded-full bg-white/80 border border-amber-700/10 px-2 py-0.5 text-[10px] text-ink-500 hover:text-ink-900 hover:bg-white"
                  >
                    Hide
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {summary.hiddenCount > 0 && (
        <div className="text-[10px] text-ink-400">{summary.hiddenCount} hidden</div>
      )}
    </section>
  );
}
