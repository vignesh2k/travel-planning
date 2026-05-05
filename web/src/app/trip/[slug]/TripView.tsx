"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

import { BrandMark } from "@/components/BrandMark";
import { Map } from "@/components/Map";
import { MobileSheet } from "@/components/MobileSheet";
import { PdfExportMenu } from "@/components/PdfExportMenu";
import { SaveTripButton } from "@/components/SaveTripButton";
import { ShareMenu } from "@/components/ShareMenu";
import { TripDateEdit } from "@/components/TripDateEdit";
import { RefineInput } from "@/components/RefineInput";
import { TripPanel } from "@/components/TripPanel";
import { selectedPlaceNameForFocus } from "@/lib/map-focus";
import type { Budget, Place, TripFull } from "@/lib/types";

function useIsMobile(): boolean | null {
  const [isMobile, setIsMobile] = useState<boolean | null>(null);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return isMobile;
}

export function TripView({
  trip: initial,
  budget,
  initialDay,
}: {
  trip: TripFull;
  budget: Budget | null;
  initialDay?: number;
}) {
  const [trip, setTrip] = useState(initial);
  const [saved, setSaved] = useState(initial.is_saved);
  const isMobile = useIsMobile();
  const [focusPlaces, setFocusPlaces] = useState<Place[] | null>(null);
  const [selectedPlaceName, setSelectedPlaceName] = useState<string | null>(null);
  const [refinePrefill, setRefinePrefill] = useState<string | undefined>(undefined);
  const [refinePrefillKey, setRefinePrefillKey] = useState(0);
  const tripPanelKey = `${trip.slug}:${trip.document.document_markdown}`;

  function pushRefinePrefill(text: string) {
    setRefinePrefill(text);
    setRefinePrefillKey((n) => n + 1);
  }

  const focusOnMap = useCallback((places: Place[] | null) => {
    setFocusPlaces(places);
    setSelectedPlaceName(selectedPlaceNameForFocus(places));
  }, []);

  const handlePlaceClick = useCallback((place: Place) => {
    setSelectedPlaceName(place.name);
    setFocusPlaces([place]);
  }, []);

  return (
    <main className="relative h-dvh w-screen overflow-hidden">
      <div className="absolute inset-0 anim-fade-in">
        <Map
          places={trip.document.places}
          focusPlaces={focusPlaces}
          selectedPlaceName={selectedPlaceName}
          onPlaceClick={handlePlaceClick}
        />
      </div>

      <header className="absolute top-0 inset-x-0 px-6 py-3 flex items-center justify-between backdrop-blur-md bg-cream-50/40 z-10 anim-slide-up">
        <div className="flex items-center gap-3">
          <Link href="/" className="contents">
            <BrandMark />
          </Link>
          <Link
            href="/"
            title="New trip"
            className="frosted rounded-[10px] px-3 py-1 text-xs hover:bg-white/85 flex items-center gap-1.5 text-ink-900"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
              <circle cx="5" cy="5" r="3.2" stroke="currentColor" strokeWidth="1.4" fill="none" />
              <path d="m7.4 7.4 2.6 2.6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
            <span className="hidden sm:inline">New trip</span>
          </Link>
        </div>
        <div className="text-sm text-ink-700 font-medium flex items-center gap-2">
          <span>{trip.destination} · {trip.days} days</span>
          <span className="text-ink-300">·</span>
          <TripDateEdit
            slug={trip.slug}
            initial={trip.start_date}
            onUpdated={(startDate) => setTrip((current) => ({ ...current, start_date: startDate }))}
          />
        </div>
        <div className="flex gap-2 items-center">
          {!saved && (
            <SaveTripButton
              slug={trip.slug}
              initialSaved={saved}
              onSaved={() => setSaved(true)}
            />
          )}
          <ShareMenu slug={trip.slug} initialToken={trip.share_token} prominent={saved} />
          {saved && <PdfExportMenu slug={trip.slug} destination={trip.destination} days={trip.days} prominent />}
          {!saved && <PdfExportMenu slug={trip.slug} destination={trip.destination} days={trip.days} />}
        </div>
      </header>

      {isMobile === false && (
        <aside className="absolute left-4 top-16 bottom-4 w-[330px] frosted-strong rounded-[18px] overflow-hidden flex flex-col z-10 anim-slide-left">
          <div className="flex-1 overflow-hidden">
            <TripPanel
              key={tripPanelKey}
              trip={trip}
              budget={budget}
              initialDay={initialDay}
              selectedPlaceName={selectedPlaceName}
              onFocusPlaces={focusOnMap}
              onRefinePrefill={pushRefinePrefill}
              onTripUpdated={setTrip}
            />
          </div>
          <div className="border-t border-amber-700/10 p-3">
            <RefineInput
              slug={trip.slug}
              onUpdated={setTrip}
              prefill={refinePrefill}
              prefillKey={refinePrefillKey}
            />
          </div>
        </aside>
      )}

      {isMobile === true && (
        <MobileSheet>
          <div className="h-full flex flex-col">
            <div className="flex-1 overflow-hidden">
              <TripPanel
                key={tripPanelKey}
                trip={trip}
                budget={budget}
                selectedPlaceName={selectedPlaceName}
                onFocusPlaces={focusOnMap}
                onRefinePrefill={pushRefinePrefill}
                onTripUpdated={setTrip}
              />
            </div>
            <div className="border-t border-amber-700/10 p-3">
              <RefineInput
                slug={trip.slug}
                onUpdated={setTrip}
                prefill={refinePrefill}
                prefillKey={refinePrefillKey}
              />
            </div>
          </div>
        </MobileSheet>
      )}
    </main>
  );
}
