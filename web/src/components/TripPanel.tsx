"use client";

import { useState } from "react";

import { fetchHotels } from "@/lib/api";
import { getBrowserToken } from "@/lib/auth.browser";
import type { Neighborhood, TripFull } from "@/lib/types";

import { DayCard, type Day } from "./DayCard";
import { HotelCard } from "./HotelCard";
import { TripPanelTabs, type Tab } from "./TripPanelTabs";

export function TripPanel({ trip }: { trip: TripFull }) {
  const [tab, setTab] = useState<Tab>("Itinerary");
  const days = parseDays(trip.document.document_markdown);
  const restaurants = parseTable(trip.document.document_markdown, /## Vegetarian Restaurants/i);
  const [neighborhoods, setNeighborhoods] = useState<Neighborhood[]>(trip.document.neighborhoods ?? []);
  const [hotelsLoading, setHotelsLoading] = useState(false);

  async function loadHotels() {
    if (neighborhoods.length || hotelsLoading) return;
    setHotelsLoading(true);
    try {
      const token = await getBrowserToken();
      if (!token) return;
      const out = await fetchHotels(trip.slug, 2, token);
      setNeighborhoods(out);
    } finally {
      setHotelsLoading(false);
    }
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <TripPanelTabs
        active={tab}
        onChange={(t) => {
          setTab(t);
          if (t === "Where to stay") loadHotels();
        }}
      />
      <div className="flex-1 p-3 overflow-auto flex flex-col gap-2">
        {tab === "Itinerary" &&
          days.map((d) => <DayCard key={d.number} day={d} isCurrent={d.number === 1} />)}

        {tab === "Restaurants" && (
          <ul className="flex flex-col gap-1">
            {restaurants.map((r, i) => (
              <li key={i} className="frosted rounded-[14px] p-2 text-xs">
                <span className="font-semibold text-ink-900">{r[0]}</span>
                {r[1] && <span className="text-ink-500"> · {r[1]}</span>}
                {r[2] && <div className="text-ink-700 mt-1">{r[2]}</div>}
              </li>
            ))}
            {restaurants.length === 0 && (
              <p className="text-xs text-ink-500">No restaurants parsed.</p>
            )}
          </ul>
        )}

        {tab === "Where to stay" && (
          <>
            {hotelsLoading && <p className="text-xs text-ink-500">Picking neighbourhoods…</p>}
            {neighborhoods.map((n) => (
              <div key={n.label} className="flex flex-col gap-2">
                <div>
                  <div className="text-xs font-semibold text-ink-900">{n.label}</div>
                  <div className="text-[11px] text-ink-500">{n.description}</div>
                </div>
                {n.hotels.map((h) => (
                  <HotelCard key={h.name} hotel={h} />
                ))}
              </div>
            ))}
          </>
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

function parseTable(markdown: string, headerRe: RegExp): string[][] {
  const sections = markdown.split(/(?=^## )/m);
  const sec = sections.find((s) => headerRe.test(s));
  if (!sec) return [];
  const rows: string[][] = [];
  for (const line of sec.split("\n")) {
    const t = line.trim();
    if (!t.startsWith("|") || /^\|[-:| ]+\|$/.test(t)) continue;
    const cells = t.replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
    if (cells.length >= 2) rows.push(cells);
  }
  return rows.slice(1); // drop header row
}
