"use client";

import { useState } from "react";

import type { TripFull } from "@/lib/types";
import { DayCard, type Day } from "./DayCard";
import { TripPanelTabs, type Tab } from "./TripPanelTabs";

export function TripPanel({ trip }: { trip: TripFull }) {
  const [tab, setTab] = useState<Tab>("Itinerary");
  const days = parseDays(trip.document.document_markdown);

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <TripPanelTabs active={tab} onChange={setTab} />
      <div className="flex-1 p-3 overflow-auto flex flex-col gap-2">
        {tab === "Itinerary" &&
          days.map((d) => <DayCard key={d.number} day={d} isCurrent={d.number === 1} />)}
        {tab === "Restaurants" && (
          <p className="text-xs text-ink-500 p-2">Restaurants list — coming in Task 15.</p>
        )}
        {tab === "Where to stay" && (
          <p className="text-xs text-ink-500 p-2">Hotels — coming in Task 15.</p>
        )}
      </div>
    </div>
  );
}

function parseDays(markdown: string): Day[] {
  const days: Day[] = [];
  const dayBlocks = markdown.split(/\n(?=### Day \d+:)/g).filter((b) => b.startsWith("### Day "));
  for (const block of dayBlocks) {
    const headerMatch = block.match(/^### Day (\d+):\s*(.+)/);
    if (!headerMatch) continue;
    const number = parseInt(headerMatch[1], 10);
    const title = headerMatch[2].trim();
    const bullets: Day["bullets"] = [];
    for (const time of ["Morning", "Afternoon", "Evening"] as const) {
      const re = new RegExp(`\\*\\*${time}:\\*\\*([\\s\\S]*?)(?=\\*\\*(?:Morning|Afternoon|Evening):\\*\\*|$)`);
      const m = block.match(re);
      if (m) {
        const items = m[1]
          .split("\n")
          .map((l) => l.replace(/^[-*]\s+/, "").trim())
          .filter(Boolean);
        if (items.length) bullets.push({ time, items });
      }
    }
    days.push({ number, title, bullets });
  }
  return days;
}
