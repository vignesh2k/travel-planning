"use client";

import type { Place } from "@/lib/types";
import { Map } from "./Map";

/** Asymptotic curve: always moves with new chars, but slows down. Never sticks
 *  at a single value. k controls steepness — k=5000 gives ~63% at 5000 chars,
 *  ~86% at 10000, ~98% at 20000. */
const K = 5000;
function asymptoticPct(chars: number): number {
  return Math.round(100 * (1 - Math.exp(-chars / K)));
}

export function StreamingOverlay({
  status,
  chars,
  places,
}: {
  status: string;
  chars: number;
  places: Place[];
}) {
  const pct = asymptoticPct(chars);
  return (
    <div className="fixed inset-0 z-20 anim-fade-in">
      <Map places={places} />
      <div className="absolute inset-0 flex items-end justify-center pointer-events-none p-8">
        <div className="frosted-strong rounded-[18px] px-5 py-3 flex flex-col gap-2 anim-slide-up min-w-[260px]">
          <div className="flex items-center gap-3">
            <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
            <span className="text-sm text-ink-900 flex-1">{status}</span>
            {chars > 0 && (
              <span className="text-[11px] text-ink-500 tabular-nums">
                {chars.toLocaleString()} chars
              </span>
            )}
          </div>
          {chars > 0 && (
            <div className="h-[3px] w-full rounded-full bg-amber-700/10 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-amber-400 to-amber-600 transition-all duration-300 ease-out"
                style={{ width: `${pct}%` }}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
