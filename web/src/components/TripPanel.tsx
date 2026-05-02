"use client";

import { useState } from "react";

import { fetchHotels } from "@/lib/api";
import { getBrowserToken } from "@/lib/auth.browser";
import type { Neighborhood, Place, TripFull } from "@/lib/types";

import { type Day } from "./DayCard";
import { HotelCard } from "./HotelCard";
import { Itinerary } from "./Itinerary";
import { TripPanelTabs, type Tab } from "./TripPanelTabs";

export function TripPanel({
  trip,
  onFocusPlaces,
  onRefinePrefill,
}: {
  trip: TripFull;
  onFocusPlaces: (places: Place[] | null) => void;
  onRefinePrefill: (text: string) => void;
}) {
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
          if (t !== "Itinerary") onFocusPlaces(null);
        }}
      />
      <div className="flex-1 p-3 overflow-auto flex flex-col gap-2">
        {tab === "Itinerary" && (
          <Itinerary
            days={days}
            places={trip.document.places}
            onFocusPlaces={onFocusPlaces}
            onRefinePrefill={onRefinePrefill}
          />
        )}

        {tab === "Restaurants" && (
          <ul className="flex flex-col gap-1.5">
            {restaurants.map((r, i) => {
              const query = [r[0], r[1], trip.destination].filter(Boolean).join(" ");
              const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
              return (
                <li key={i}>
                  <a
                    href={mapsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="frosted rounded-[14px] p-3 text-xs flex items-start gap-2 hover:bg-white/95 hover:border-amber-600/30 hover:shadow-sm"
                  >
                    <span className="text-[14px] leading-none mt-0.5 shrink-0" aria-hidden>🍽️</span>
                    <div className="flex-1 min-w-0">
                      <div>
                        <span className="font-semibold text-ink-900">{r[0]}</span>
                        {r[1] && <span className="text-ink-500"> · {r[1]}</span>}
                      </div>
                      {r[2] && <div className="text-ink-700 mt-1 leading-snug">{r[2]}</div>}
                      <div className="text-[11px] text-amber-700 mt-1.5">Reviews on Google Maps →</div>
                    </div>
                  </a>
                </li>
              );
            })}
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
                <div className="flex items-start gap-2">
                  <span className="text-[14px] leading-none mt-0.5 shrink-0" aria-hidden>🏘️</span>
                  <div>
                    <div className="text-xs font-semibold text-ink-900">{n.label}</div>
                    <div className="text-[11px] text-ink-500">{n.description}</div>
                  </div>
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
      // Stop at the next time-of-day marker, the next day heading, the next
      // top-level section heading, or end of string. Without the `\n## ` and
      // `\n### Day` stops, the Evening regex on the last day greedily eats
      // everything that follows (e.g. the `## Logistics` table).
      const re = new RegExp(
        `\\*\\*${time}:\\*\\*([\\s\\S]*?)(?=\\*\\*(?:Morning|Afternoon|Evening):\\*\\*|\\n## |\\n### Day \\d+:|$)`,
      );
      const m = block.match(re);
      if (m) {
        const items = m[1]
          .split("\n")
          .map((l) => l.replace(/^[-*]\s+/, "").trim())
          .filter((l) => l && !l.startsWith("|") && !l.startsWith("##") && !l.startsWith("###"));
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
  return rows.slice(1);
}
