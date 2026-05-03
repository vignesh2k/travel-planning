"use client";

import { useEffect, useState } from "react";

import { Map } from "@/components/Map";
import { MobileSheet } from "@/components/MobileSheet";
import { PublicShell } from "@/components/PublicShell";
import { TripPanel } from "@/components/TripPanel";
import type { Place, PublicTrip } from "@/lib/types";

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

export function PublicView({ trip }: { trip: PublicTrip }) {
  const isMobile = useIsMobile();
  const [focusPlaces, setFocusPlaces] = useState<Place[] | null>(null);

  return (
    <PublicShell title={trip.destination} subtitle={`${trip.days} days`}>
      <div className="absolute inset-0 anim-fade-in">
        <Map places={trip.document.places} focusPlaces={focusPlaces} />
      </div>

      {isMobile === false && (
        <aside className="absolute left-4 top-16 bottom-4 w-[330px] frosted-strong rounded-[18px] overflow-hidden flex flex-col z-10 anim-slide-left">
          <div className="flex-1 overflow-hidden">
            <TripPanel
              trip={trip}
              budget={null}
              readOnly
              onFocusPlaces={setFocusPlaces}
              onRefinePrefill={() => {}}
            />
          </div>
          <div className="border-t border-amber-700/10 px-3 py-2 text-[10px] text-ink-500 text-center">
            Created with Atlas — atlas.viggy.dev
          </div>
        </aside>
      )}

      {isMobile === true && (
        <MobileSheet>
          <div className="h-full flex flex-col">
            <div className="flex-1 overflow-hidden">
              <TripPanel
                trip={trip}
                budget={null}
                readOnly
                onFocusPlaces={setFocusPlaces}
                onRefinePrefill={() => {}}
              />
            </div>
            <div className="border-t border-amber-700/10 px-3 py-2 text-[10px] text-ink-500 text-center">
              Created with Atlas — atlas.viggy.dev
            </div>
          </div>
        </MobileSheet>
      )}
    </PublicShell>
  );
}
