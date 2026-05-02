"use client";

import type { Place } from "@/lib/types";
import { Map } from "./Map";

export function StreamingOverlay({
  status,
  places,
}: {
  status: string;
  places: Place[];
}) {
  return (
    <div className="fixed inset-0 z-20 anim-fade-in">
      <Map places={places} />
      <div className="absolute inset-0 flex items-end justify-center pointer-events-none p-8">
        <div className="frosted-strong rounded-[18px] px-5 py-3 flex items-center gap-3 anim-slide-up">
          <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
          <span className="text-sm text-ink-900">{status}</span>
        </div>
      </div>
    </div>
  );
}
