"use client";

import Link from "next/link";

import { BrandMark } from "@/components/BrandMark";
import { Map } from "@/components/Map";
import { MobileSheet } from "@/components/MobileSheet";
import { RefineInput } from "@/components/RefineInput";
import { TripPanel } from "@/components/TripPanel";
import type { TripFull } from "@/lib/types";

export function TripView({ trip }: { trip: TripFull }) {
  return (
    <main className="relative h-dvh w-screen overflow-hidden">
      {/* Map full bleed */}
      <div className="absolute inset-0">
        <Map places={trip.document.places} />
      </div>

      {/* Top bar */}
      <header className="absolute top-0 inset-x-0 px-6 py-3 flex items-center justify-between backdrop-blur-md bg-cream-50/40 z-10">
        <Link href="/" className="contents">
          <BrandMark />
        </Link>
        <div className="text-sm text-ink-700 font-medium">
          {trip.destination} · {trip.days} days
        </div>
        <div className="flex gap-2">
          <button className="frosted rounded-[10px] px-3 py-1 text-xs">Share</button>
          <button className="frosted rounded-[10px] px-3 py-1 text-xs">Export PDF</button>
        </div>
      </header>

      {/* Desktop side panel */}
      <aside className="hidden md:flex absolute left-4 top-16 bottom-4 w-[330px] frosted-strong rounded-[18px] overflow-hidden flex-col z-10">
        <div className="flex-1 overflow-hidden">
          <TripPanel trip={trip} />
        </div>
        <div className="border-t border-amber-700/10 p-3">
          <RefineInput slug={trip.slug} />
        </div>
      </aside>

      {/* Mobile bottom sheet */}
      <div className="md:hidden">
        <MobileSheet>
          <div className="h-full flex flex-col">
            <div className="flex-1 overflow-hidden">
              <TripPanel trip={trip} />
            </div>
            <div className="border-t border-amber-700/10 p-3">
              <RefineInput slug={trip.slug} />
            </div>
          </div>
        </MobileSheet>
      </div>
    </main>
  );
}
