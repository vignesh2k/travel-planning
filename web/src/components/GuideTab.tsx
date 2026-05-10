"use client";

import {
  defaultPdfSections,
  pdfSectionSummary,
  visiblePdfSections,
} from "@/lib/pdf-options";
import type { Budget, PublicTrip, TripFull } from "@/lib/types";

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
  const budgetText =
    budget && !readOnly
      ? `${budget.currency} budget can be included`
      : "Budget stays private";

  return (
    <div className="flex flex-col gap-3">
      <AtlasPanel>
        <div className="rounded-t-[14px] border-b border-amber-700/10 bg-[linear-gradient(135deg,rgba(201,100,66,0.12),rgba(111,142,114,0.10))] px-4 py-5">
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
