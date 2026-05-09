import type { ItineraryDay } from "@/lib/types";
import React from "react";

export interface Day {
  number: number;
  title: string;
  area?: string;
  bullets: { time: "Morning" | "Afternoon" | "Evening"; items: string[] }[];
}

export const DayCard = React.memo(function DayCard({
  day,
  isCurrent,
}: {
  day: Day | ItineraryDay;
  isCurrent: boolean;
}) {
  const area = "area" in day ? day.area : undefined;

  return (
    <div
      className={
        isCurrent
          ? "frosted-strong rounded-[14px] p-3"
          : "bg-white/50 border border-amber-700/10 rounded-[14px] p-3"
      }
    >
      <div className="flex items-baseline gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-amber-600">
          DAY {day.number}
        </span>
        {area && <span className="text-[10px] text-ink-500">{area}</span>}
      </div>
      <div className="text-sm font-semibold text-ink-900 mt-1">{day.title}</div>
      <div className="mt-2 flex flex-col gap-1">
        {day.bullets.map((b) => (
          <div key={b.time} className="text-[11px] text-ink-700">
            <span className="font-semibold">{b.time}:</span> {b.items.join(" · ")}
          </div>
        ))}
      </div>
    </div>
  );
});
