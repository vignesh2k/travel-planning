"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { BrandMark } from "@/components/BrandMark";
import { Map } from "@/components/Map";
import { MobileSheet } from "@/components/MobileSheet";
import { PdfExportMenu } from "@/components/PdfExportMenu";
import { RefineInput } from "@/components/RefineInput";
import { TripPanel } from "@/components/TripPanel";
import type { Place, TripFull } from "@/lib/types";

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

export function TripView({ trip: initial }: { trip: TripFull }) {
  const [trip, setTrip] = useState(initial);
  const isMobile = useIsMobile();
  const [shareCopied, setShareCopied] = useState(false);
  const [focusPlaces, setFocusPlaces] = useState<Place[] | null>(null);
  const [refinePrefill, setRefinePrefill] = useState<string | undefined>(undefined);
  const [refinePrefillKey, setRefinePrefillKey] = useState(0);

  function pushRefinePrefill(text: string) {
    setRefinePrefill(text);
    setRefinePrefillKey((n) => n + 1);
  }

  async function copyShareLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setShareCopied(true);
      window.setTimeout(() => setShareCopied(false), 1500);
    } catch (e) {
      console.error("clipboard write failed", e);
    }
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
        <div className="text-sm text-ink-700 font-medium">
          {trip.destination} · {trip.days} days
        </div>
        <div className="flex gap-2">
          <button
            onClick={copyShareLink}
            className="frosted rounded-[10px] px-3 py-1 text-xs hover:bg-white/85"
          >
            {shareCopied ? "Copied ✓" : "Share"}
          </button>
          <PdfExportMenu slug={trip.slug} destination={trip.destination} />
        </div>
      </header>

      {isMobile === false && (
        <aside className="absolute left-4 top-16 bottom-4 w-[330px] frosted-strong rounded-[18px] overflow-hidden flex flex-col z-10 anim-slide-left">
          <div className="flex-1 overflow-hidden">
            <TripPanel
              trip={trip}
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
