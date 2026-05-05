"use client";

import { useState } from "react";

import { fetchHotels } from "@/lib/api";
import { getBrowserToken } from "@/lib/auth.browser";
import type { Budget, Neighborhood, Place, PublicTrip, TripFull } from "@/lib/types";

import { BudgetTab } from "./BudgetTab";
import { HotelCard } from "./HotelCard";
import { Itinerary } from "./Itinerary";
import { TripPanelTabs, type Tab } from "./TripPanelTabs";

const FULL_TABS: readonly Tab[] = ["Itinerary", "Where to stay", "Budget"] as const;
const READONLY_TABS: readonly Tab[] = ["Itinerary", "Where to stay"] as const;

export function TripPanel({
  trip,
  budget,
  readOnly = false,
  initialDay,
  onFocusPlaces,
  onRefinePrefill,
}: {
  trip: TripFull | PublicTrip;
  budget: Budget | null;
  readOnly?: boolean;
  initialDay?: number;
  onFocusPlaces: (places: Place[] | null) => void;
  onRefinePrefill: (text: string) => void;
}) {
  const [tab, setTab] = useState<Tab>("Itinerary");
  const days = trip.document.itinerary;
  const restaurants = trip.document.restaurants;
  const [neighborhoods, setNeighborhoods] = useState<Neighborhood[]>(trip.document.neighborhoods ?? []);
  const [hotelsLoading, setHotelsLoading] = useState(false);

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
      <TripPanelTabs
        active={tab}
        tabs={readOnly ? READONLY_TABS : FULL_TABS}
        onChange={(t) => {
          setTab(t);
          if (t === "Where to stay") loadHotels();
          if (t !== "Itinerary") onFocusPlaces(null);
        }}
      />
      <div className="flex-1 p-3 overflow-auto flex flex-col gap-2">
        {tab === "Itinerary" && (
          <Itinerary
            days={days}
            places={trip.document.places}
            restaurants={restaurants}
            destination={trip.destination}
            budget={budget}
            initialDay={initialDay}
            onFocusPlaces={onFocusPlaces}
            onRefinePrefill={onRefinePrefill}
            onOpenBudgetDay={(n) => {
              setTab("Budget");
              // After tab swap, scroll the matching row into view.
              setTimeout(() => {
                document
                  .getElementById(`budget-day-${n}`)
                  ?.scrollIntoView({ behavior: "smooth", block: "start" });
              }, 50);
            }}
          />
        )}

        {tab === "Budget" && !readOnly && (
          <BudgetTab slug={trip.slug} initial={budget} />
        )}

        {tab === "Where to stay" && (
          <>
            {hotelsLoading && <p className="text-xs text-ink-500">Picking neighbourhoods…</p>}
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
          </>
        )}
      </div>
    </div>
  );
}
