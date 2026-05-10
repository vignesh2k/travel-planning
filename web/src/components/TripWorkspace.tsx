"use client";

import { useMemo, useState } from "react";

import { selectedPlaceNameForFocus } from "@/lib/map-focus";
import type { Budget, Place, PublicTrip, TripFull } from "@/lib/types";

import { Map } from "./Map";
import { MobileSheet } from "./MobileSheet";
import { TripPanel } from "./TripPanel";

type WorkspaceTrip = TripFull | PublicTrip;

export function TripWorkspace({
  trip,
  budget,
  initialDay,
  readOnly = false,
}: {
  trip: WorkspaceTrip;
  budget: Budget | null;
  initialDay?: number;
  readOnly?: boolean;
}) {
  const places = useMemo(() => trip.document.places ?? [], [trip.document.places]);
  const [focusPlaces, setFocusPlaces] = useState<Place[] | null>(null);
  const [selectedPlaceName, setSelectedPlaceName] = useState<string | null>(null);

  function focus(next: Place[] | null) {
    setFocusPlaces(next);
    setSelectedPlaceName(selectedPlaceNameForFocus(next));
  }

  function selectPlace(place: Place) {
    setFocusPlaces([place]);
    setSelectedPlaceName(place.name);
  }

  const panel = (
    <TripPanel
      trip={trip}
      budget={budget}
      readOnly={readOnly}
      initialDay={initialDay}
      selectedPlaceName={selectedPlaceName}
      onFocusPlaces={focus}
    />
  );

  return (
    <div className="relative h-[calc(100dvh-49px)] min-h-[520px] overflow-hidden bg-[var(--color-paper-cream)]">
      <Map
        places={places}
        focusPlaces={focusPlaces}
        selectedPlaceName={selectedPlaceName}
        onPlaceClick={selectPlace}
      />
      <div
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(255,250,242,0.10),rgba(255,250,242,0.46)_68%,rgba(255,250,242,0.78))]"
        aria-hidden
      />
      <div className="absolute inset-y-4 right-4 z-20 hidden w-[min(440px,calc(100vw-2rem))] overflow-hidden rounded-[18px] border border-amber-700/10 bg-white/80 shadow-2xl backdrop-blur-md md:flex">
        {panel}
      </div>
      <div className="md:hidden">
        <MobileSheet>{panel}</MobileSheet>
      </div>
    </div>
  );
}
