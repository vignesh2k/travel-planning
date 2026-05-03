"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { BrandMark } from "@/components/BrandMark";
import { Map } from "@/components/Map";
import { MobileSheet } from "@/components/MobileSheet";
import { PdfExportMenu } from "@/components/PdfExportMenu";
import { ShareMenu } from "@/components/ShareMenu";
import { TripDateEdit } from "@/components/TripDateEdit";
import { RefineInput } from "@/components/RefineInput";
import { TripPanel } from "@/components/TripPanel";
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
}: {
  trip: TripFull;
  budget: Budget | null;
}) {
  const [trip, setTrip] = useState(initial);
  const isMobile = useIsMobile();
  const [focusPlaces, setFocusPlaces] = useState<Place[] | null>(null);
  const [refinePrefill, setRefinePrefill] = useState<string | undefined>(undefined);
  const [refinePrefillKey, setRefinePrefillKey] = useState(0);

  function pushRefinePrefill(text: string) {
    setRefinePrefill(text);
    setRefinePrefillKey((n) => n + 1);
  }

  return (
    <main className="relative h-dvh w-screen overflow-hidden">
      <div className="absolute inset-0 anim-fade-in">
        <Map places={trip.document.places} focusPlaces={focusPlaces} />
      </div>

      <header className="absolute top-0 inset-x-0 px-6 py-3 flex items-center justify-between backdrop-blur-md bg-cream-50/40 z-10 anim-slide-up">
        <Link href="/" className="contents">
          <BrandMark />
        </Link>
        <div className="text-sm text-ink-700 font-medium flex items-center gap-2">
          <span>{trip.destination} · {trip.days} days</span>
          <span className="text-ink-300">·</span>
          <TripDateEdit slug={trip.slug} initial={trip.start_date} />
        </div>
        <div className="flex gap-2 items-center">
          <ShareMenu slug={trip.slug} initialToken={trip.share_token} />
          <PdfExportMenu slug={trip.slug} destination={trip.destination} days={trip.days} />
        </div>
      </header>

      {isMobile === false && (
        <aside className="absolute left-4 top-16 bottom-4 w-[330px] frosted-strong rounded-[18px] overflow-hidden flex flex-col z-10 anim-slide-left">
          <div className="flex-1 overflow-hidden">
            <TripPanel
              trip={trip}
              budget={budget}
              onFocusPlaces={setFocusPlaces}
              onRefinePrefill={pushRefinePrefill}
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
                trip={trip}
                budget={budget}
                onFocusPlaces={setFocusPlaces}
                onRefinePrefill={pushRefinePrefill}
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
