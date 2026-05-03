import Link from "next/link";

import type { ActiveTrip } from "@/lib/active-trip";

import { BrandIcon } from "./BrandMark";

export function TodayBanner({ active }: { active: ActiveTrip }) {
  return (
    <Link
      href={`/trip/${active.trip.slug}?day=${active.dayNumber}`}
      className="frosted-strong rounded-[18px] px-4 py-3 w-full max-w-xl flex items-center gap-3 hover:shadow-md transition-shadow anim-fade-in"
    >
      <BrandIcon className="w-7 h-7 shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="text-[11px] uppercase tracking-wider text-amber-700">
          Today · Day {active.dayNumber} of {active.totalDays}
        </div>
        <div className="text-sm font-semibold text-ink-900 truncate">
          {active.trip.destination}
        </div>
      </div>
      <span className="text-xs text-ink-500 shrink-0">Open today →</span>
    </Link>
  );
}
