"use client";

import { useState } from "react";

import type { PublicTrip, TripDocument, TripFull } from "@/lib/types";
import {
  decisionQuickActionsForStatus,
  openDecisionItemsForDisplay,
  planningReadinessForDocument,
  setActivityStatus,
  type PlanningReadinessItem,
} from "@/lib/planning-status";
import { dismissHealthCheck, planHealthForTrip } from "@/lib/trip-health";
import { StatusChip } from "./StatusChip";

const SEVERITY_CLASS = {
  good: "bg-emerald-100 text-emerald-700 border-emerald-200",
  watch: "bg-amber-100 text-amber-800 border-amber-200",
  risk: "bg-rose-100 text-rose-700 border-rose-200",
};

const METRIC_CLASS = {
  confirmed: "bg-emerald-50 text-emerald-800 border-emerald-100",
  booking: "bg-rose-50 text-rose-800 border-rose-100",
  maybe: "bg-amber-50 text-amber-900 border-amber-100",
  ideas: "bg-slate-50 text-slate-700 border-slate-200",
};

function ReadinessMetric({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: keyof typeof METRIC_CLASS;
}) {
  return (
    <div className={`rounded-[10px] border px-2 py-2 ${METRIC_CLASS[tone]}`}>
      <div className="text-sm font-semibold leading-none">{value}</div>
      <div className="mt-1 text-[9px] font-semibold uppercase leading-tight">{label}</div>
    </div>
  );
}

export function PlanHealthPanel({
  trip,
  readOnly,
  onDocumentChange,
  onOpenDecision,
}: {
  trip: TripFull | PublicTrip;
  readOnly: boolean;
  onDocumentChange?: (document: TripDocument) => void;
  onOpenDecision?: (item: PlanningReadinessItem) => void;
}) {
  const summary = planHealthForTrip(trip);
  const readiness = planningReadinessForDocument(trip.document);
  const [showAllDecisions, setShowAllDecisions] = useState(false);
  const openItems = openDecisionItemsForDisplay(readiness.openItems, showAllDecisions);

  return (
    <section className="frosted rounded-[14px] p-3 flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-500">
            Plan readiness
          </div>
          <div className="text-sm font-semibold text-ink-900 mt-0.5">
            {summary.severity === "good" ? "Ready to travel" : summary.severity === "watch" ? "Worth a pass" : "Needs attention"}
          </div>
        </div>
        <div className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${SEVERITY_CLASS[summary.severity]}`}>
          {summary.score}%
        </div>
      </div>

      <div className="grid grid-cols-4 gap-1.5">
        <ReadinessMetric label="Confirmed" value={readiness.confirmed} tone="confirmed" />
        <ReadinessMetric label="To book" value={readiness.needsBooking} tone="booking" />
        <ReadinessMetric label="Maybe" value={readiness.maybe} tone="maybe" />
        <ReadinessMetric label="Ideas" value={readiness.ideas} tone="ideas" />
      </div>

      <div className="border-t border-amber-700/10 pt-2">
        <div className="flex items-center justify-between gap-2">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-500">
            Open decisions
          </div>
          <div className="text-[10px] text-ink-400">
            {openItems.items.length} of {readiness.openItems.length}
          </div>
        </div>
        {openItems.items.length > 0 ? (
          <div className="mt-2 flex flex-col gap-1.5">
            {openItems.items.map((item) => {
              const actions = decisionQuickActionsForStatus(item.status);
              const canAct = !readOnly && onDocumentChange && actions.length > 0;

              return (
                <div
                  key={item.id}
                  className="flex w-full items-center gap-2 rounded-[9px] hover:bg-white/70"
                >
                  <button
                    type="button"
                    onClick={() => onOpenDecision?.(item)}
                    className="min-w-0 flex-1 py-1 text-left focus:outline-none focus:ring-2 focus:ring-amber-500/35"
                  >
                    <div className="text-[10px] font-medium text-ink-500">
                      Day {item.dayNumber} - {item.time}
                    </div>
                    <div className="truncate text-[11px] font-medium text-ink-900">
                      {item.text}
                    </div>
                    {item.note && (
                      <div className="truncate text-[10px] text-ink-500">{item.note}</div>
                    )}
                  </button>
                  <div className="flex shrink-0 items-center gap-1">
                    <StatusChip value={item.status} compact />
                    {canAct && (
                      <div className="flex items-center gap-1">
                        {actions.map((action) => (
                          <button
                            key={action.status}
                            type="button"
                            onClick={() => onDocumentChange(setActivityStatus(trip.document, item.id, action.status))}
                            className="rounded-full border border-amber-700/10 bg-white/80 px-2 py-0.5 text-[10px] font-medium text-ink-600 hover:bg-white hover:text-ink-900"
                          >
                            {action.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            {openItems.canExpand && (
              <button
                type="button"
                onClick={() => setShowAllDecisions((value) => !value)}
                className="self-start rounded-full border border-amber-700/10 bg-white/60 px-2.5 py-1 text-[10px] font-medium text-ink-600 hover:bg-white hover:text-ink-900"
              >
                {showAllDecisions ? "Show fewer" : `Show ${openItems.hiddenCount} more`}
              </button>
            )}
          </div>
        ) : (
          <div className="mt-2 text-[11px] leading-4 text-ink-600">
            No bookings or maybes are marked as open.
          </div>
        )}
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
