"use client";

import { useMemo, useState } from "react";

import { fetchHotels } from "@/lib/api";
import { getBrowserToken } from "@/lib/auth.browser";
import { ensurePlanningState } from "@/lib/planning-status";
import type { Budget, Neighborhood, Place, PublicTrip, TripDocument, TripFull } from "@/lib/types";

import { BudgetTab } from "./BudgetTab";
import { HotelCard } from "./HotelCard";
import { Itinerary } from "./Itinerary";
import { PlanHealthPanel } from "./PlanHealthPanel";
import { TripDeskHeader } from "./TripDeskHeader";
import { TripPanelTabs, type Tab } from "./TripPanelTabs";
import { TripSummaryHeader } from "./TripSummaryHeader";

const FULL_TABS: readonly Tab[] = ["Plan", "Stay", "Money"] as const;
const READONLY_TABS: readonly Tab[] = ["Plan", "Stay"] as const;

function ignoreFocusPlaces(places: Place[] | null) {
  void places;
}

function ignoreRefinePrefill(text: string) {
  void text;
}

export function TripPanel({
  trip,
  budget,
  readOnly = false,
  initialDay,
  selectedPlaceName,
  onFocusPlaces = ignoreFocusPlaces,
  onRefinePrefill = ignoreRefinePrefill,
  document: panelDocument,
  hasUnsavedChanges = false,
  onDocumentChange,
}: {
  trip: TripFull | PublicTrip;
  budget: Budget | null;
  readOnly?: boolean;
  initialDay?: number;
  selectedPlaceName?: string | null;
  onFocusPlaces?: (places: Place[] | null) => void;
  onRefinePrefill?: (text: string) => void;
  document?: TripDocument;
  hasUnsavedChanges?: boolean;
  onDocumentChange?: (document: TripDocument) => void;
}) {
  const [tab, setTab] = useState<Tab>("Plan");
  const draftDocument = useMemo(
    () => ensurePlanningState(panelDocument ?? trip.document),
    [panelDocument, trip.document],
  );
  const [editMode, setEditMode] = useState(false);
  const [neighborhoods, setNeighborhoods] = useState<Neighborhood[]>(trip.document.neighborhoods ?? []);
  const [hotelsLoading, setHotelsLoading] = useState(false);
  const viewTrip = useMemo(() => ({ ...trip, document: draftDocument }), [trip, draftDocument]);

  async function loadHotels() {
    if (neighborhoods.length || hotelsLoading) return;
    setHotelsLoading(true);
    try {
      const token = await getBrowserToken();
      if (!token) return;
      const out = await fetchHotels(trip.slug, 2, token);
      setNeighborhoods(out);
    } finally {
      setHotelsLoading(false);
    }
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <TripDeskHeader
        trip={viewTrip}
        readOnly={readOnly}
        editMode={editMode}
        hasUnsavedChanges={hasUnsavedChanges}
        onToggleEdit={() => setEditMode((v) => !v)}
      />
      <TripPanelTabs
        active={tab}
        tabs={readOnly ? READONLY_TABS : FULL_TABS}
        onChange={(t) => {
          setTab(t);
          if (t === "Stay") loadHotels();
          if (t !== "Plan") onFocusPlaces(null);
        }}
      />
      <div className="flex-1 p-3 overflow-auto flex flex-col gap-2">
        <TripSummaryHeader
          trip={viewTrip}
          budget={budget}
          readOnly={readOnly}
          onFocusPlaces={onFocusPlaces}
          onOpenMoney={() => {
            if (!readOnly) setTab("Money");
          }}
        />
        {tab === "Plan" && (
          <PlanHealthPanel
            trip={viewTrip}
            readOnly={readOnly}
            onDocumentChange={onDocumentChange}
          />
        )}

        {tab === "Plan" && (
          <Itinerary
            document={draftDocument}
            destination={trip.destination}
            budget={budget}
            readOnly={readOnly}
            editMode={editMode}
            initialDay={initialDay}
            selectedPlaceName={selectedPlaceName}
            onFocusPlaces={onFocusPlaces}
            onRefinePrefill={onRefinePrefill}
            onDocumentChange={onDocumentChange ?? (() => {})}
            onOpenBudgetDay={(n) => {
              setTab("Money");
              // After tab swap, scroll the matching row into view.
              setTimeout(() => {
                document
                  .getElementById(`budget-day-${n}`)
                  ?.scrollIntoView({ behavior: "smooth", block: "start" });
              }, 50);
            }}
          />
        )}

        {tab === "Money" && !readOnly && (
          <BudgetTab slug={trip.slug} initial={budget} />
        )}

        {tab === "Stay" && (
          <>
            {hotelsLoading && <StaySkeleton />}
            {neighborhoods.map((n) => (
              <div key={n.label} className="flex flex-col gap-2">
                <div className="flex items-start gap-2">
                  <span className="text-[14px] leading-none mt-0.5 shrink-0" aria-hidden>🏘️</span>
                  <div>
                    <div className="text-xs font-semibold text-ink-900">{n.label}</div>
                    <div className="text-[11px] text-ink-500">{n.description}</div>
                  </div>
                </div>
                {n.hotels.map((h) => (
                  <HotelCard key={h.name} hotel={h} />
                ))}
              </div>
            ))}
            {!hotelsLoading && neighborhoods.length === 0 && (
              <div className="frosted rounded-[14px] p-4 text-xs text-ink-600 leading-5">
                Open this tab after saving to let Atlas pick neighbourhoods and
                hotel anchors for the trip.
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function StaySkeleton() {
  return (
    <div className="flex flex-col gap-2">
      {[0, 1, 2].map((i) => (
        <div key={i} className="frosted rounded-[14px] p-3 flex flex-col gap-2">
          <div className="h-3 w-28 rounded-full bg-amber-700/10 animate-pulse" />
          <div className="h-2.5 w-full rounded-full bg-amber-700/10 animate-pulse" />
          <div className="h-2.5 w-2/3 rounded-full bg-amber-700/10 animate-pulse" />
        </div>
      ))}
    </div>
  );
}
