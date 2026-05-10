"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { fetchHotels } from "@/lib/api";
import { getBrowserToken } from "@/lib/auth.browser";
import { ensurePlanningState } from "@/lib/planning-status";
import { activityIndexForPlace } from "@/lib/trip-activity-index";
import type { Budget, Neighborhood, Place, PublicTrip, TripDocument, TripFull } from "@/lib/types";
import type { WorkspaceTab } from "@/lib/workspace-tabs";
import { tabsForWorkspace } from "@/lib/workspace-tabs";

import { BudgetTab } from "./BudgetTab";
import { GuideTab } from "./GuideTab";
import { HotelCard } from "./HotelCard";
import { activityDomId, Itinerary } from "./Itinerary";
import { PlanHealthPanel } from "./PlanHealthPanel";
import { TripDeskHeader } from "./TripDeskHeader";
import { TripPanelTabs } from "./TripPanelTabs";
import { TripSummaryHeader } from "./TripSummaryHeader";

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
  activeTab,
  isMobile,
  onTabChange,
  initialDay,
  selectedPlaceName,
  onFocusPlaces = ignoreFocusPlaces,
  onRefinePrefill = ignoreRefinePrefill,
  document: panelDocument,
  onDocumentChange,
}: {
  trip: TripFull | PublicTrip;
  budget: Budget | null;
  readOnly?: boolean;
  activeTab?: WorkspaceTab;
  isMobile?: boolean;
  onTabChange?: (tab: WorkspaceTab) => void;
  initialDay?: number;
  selectedPlaceName?: string | null;
  onFocusPlaces?: (places: Place[] | null) => void;
  onRefinePrefill?: (text: string) => void;
  document?: TripDocument;
  onDocumentChange?: (document: TripDocument) => void;
}) {
  const [localTab, setLocalTab] = useState<WorkspaceTab>("Plan");
  const tab = activeTab ?? localTab;
  const visibleTabs = tabsForWorkspace({ readOnly, isMobile: Boolean(isMobile) });
  const panelTabs = visibleTabs.includes(tab) ? visibleTabs : [...visibleTabs, tab];
  const draftDocument = useMemo(
    () => ensurePlanningState(panelDocument ?? trip.document),
    [panelDocument, trip.document],
  );
  const [editMode, setEditMode] = useState(false);
  const [activeDay, setActiveDay] = useState<number | undefined>(initialDay);
  const [focusedActivityId, setFocusedActivityId] = useState<string | null>(null);
  const focusClearRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hotelsRequestRef = useRef(false);
  const [neighborhoods, setNeighborhoods] = useState<Neighborhood[]>(trip.document.neighborhoods ?? []);
  const [hotelsLoading, setHotelsLoading] = useState(false);
  const viewTrip = useMemo(() => ({ ...trip, document: draftDocument }), [trip, draftDocument]);

  const loadHotels = useCallback(async () => {
    if (neighborhoods.length || hotelsRequestRef.current) return;
    hotelsRequestRef.current = true;
    await Promise.resolve();
    setHotelsLoading(true);
    try {
      const token = await getBrowserToken();
      if (!token) return;
      const out = await fetchHotels(trip.slug, 2, token);
      setNeighborhoods(out);
    } finally {
      hotelsRequestRef.current = false;
      setHotelsLoading(false);
    }
  }, [neighborhoods.length, trip.slug]);

  useEffect(() => {
    return () => {
      if (focusClearRef.current) {
        clearTimeout(focusClearRef.current);
        focusClearRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const clearPendingFocusReset = () => {
      if (focusClearRef.current) {
        clearTimeout(focusClearRef.current);
        focusClearRef.current = null;
      }
    };
    const clearFocusFrame = () =>
      requestAnimationFrame(() => {
        setFocusedActivityId(null);
      });

    if (!selectedPlaceName) {
      clearPendingFocusReset();
      const frame = clearFocusFrame();
      return () => cancelAnimationFrame(frame);
    }
    const match = activityIndexForPlace(draftDocument, selectedPlaceName);
    if (!match) {
      clearPendingFocusReset();
      const frame = clearFocusFrame();
      return () => cancelAnimationFrame(frame);
    }
    clearPendingFocusReset();
    let scrollFrame: number | null = null;
    const frame = requestAnimationFrame(() => {
      setActiveDay(match.dayNumber);
      setFocusedActivityId(match.activityId);
      scrollFrame = requestAnimationFrame(() => {
        document
          .getElementById(activityDomId(match.activityId))
          ?.scrollIntoView({ behavior: "smooth", block: "center" });
      });
    });
    const focusClear = setTimeout(() => {
      setFocusedActivityId(null);
    }, 2200);
    focusClearRef.current = focusClear;
    return () => {
      cancelAnimationFrame(frame);
      if (scrollFrame !== null) cancelAnimationFrame(scrollFrame);
      if (focusClearRef.current === focusClear) {
        clearTimeout(focusClear);
        focusClearRef.current = null;
      }
    };
  }, [draftDocument, selectedPlaceName]);

  useEffect(() => {
    if (activeTab === "Stay") void loadHotels();
  }, [activeTab, loadHotels]);

  function changeTab(next: WorkspaceTab) {
    if (activeTab === undefined) setLocalTab(next);
    onTabChange?.(next);
    if (next === "Stay") void loadHotels();
    if (activeTab === undefined && next !== "Plan") onFocusPlaces(null);
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <TripDeskHeader
        trip={viewTrip}
        readOnly={readOnly}
        editMode={editMode}
        onToggleEdit={() => setEditMode((v) => !v)}
      />
      <TripPanelTabs
        active={tab}
        tabs={panelTabs}
        onChange={changeTab}
      />
      <div className="flex-1 p-3 overflow-auto flex flex-col gap-2">
        <TripSummaryHeader
          trip={viewTrip}
          budget={budget}
          readOnly={readOnly}
          onFocusPlaces={onFocusPlaces}
          onOpenMoney={() => {
            if (!readOnly) changeTab("Money");
          }}
        />
        {tab === "Plan" && (
          <PlanHealthPanel
            trip={viewTrip}
            readOnly={readOnly}
            onDocumentChange={onDocumentChange}
            onOpenDecision={(item) => {
              changeTab("Plan");
              setActiveDay(item.dayNumber);
              setFocusedActivityId(item.id);
              if (focusClearRef.current) clearTimeout(focusClearRef.current);
              setTimeout(() => {
                document
                  .getElementById(activityDomId(item.id))
                  ?.scrollIntoView({ behavior: "smooth", block: "center" });
              }, 50);
              focusClearRef.current = setTimeout(() => {
                setFocusedActivityId(null);
              }, 2200);
            }}
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
            activeDay={activeDay}
            focusedActivityId={focusedActivityId}
            selectedPlaceName={selectedPlaceName}
            onFocusPlaces={onFocusPlaces}
            onActiveDayChange={setActiveDay}
            onRefinePrefill={onRefinePrefill}
            onDocumentChange={onDocumentChange ?? (() => {})}
            onOpenBudgetDay={(n) => {
              changeTab("Money");
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

        {tab === "Map" && (
          <EmptyWorkspaceState
            title="Map view"
            copy="The map is active. Use Plan, Stay, or Guide to reopen trip details."
          />
        )}

        {tab === "Guide" && (
          <GuideTab
            trip={viewTrip}
            budget={budget}
            readOnly={readOnly}
          />
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

function EmptyWorkspaceState({
  title,
  copy,
}: {
  title: string;
  copy: string;
}) {
  return (
    <div className="frosted rounded-[14px] p-4 text-xs leading-5 text-ink-600">
      <div className="text-sm font-semibold text-ink-900">{title}</div>
      <div className="mt-1">{copy}</div>
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
