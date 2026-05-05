import { combined, dayTotal } from "@/lib/currency";
import type { Budget, ItineraryDay, Place, TripDocument } from "@/lib/types";

export interface TripInsightSummary {
  route: string;
  pace: "Relaxed" | "Balanced" | "Packed";
  neighbourhoods: string[];
  budgetLabel: string | null;
  mappedStops: number;
  qualityNotes: string[];
}

function headName(name: string): string {
  return name.split(",")[0]?.trim() || name;
}

function distanceKm(a: Place, b: Place): number | null {
  if (a.lat === null || a.lng === null || b.lat === null || b.lng === null) return null;
  const r = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(h));
}

function placeForText(text: string, places: Place[]): Place | null {
  const lower = text.toLowerCase();
  let best: { place: Place; length: number } | null = null;
  for (const place of places) {
    const head = headName(place.name);
    if (head.length < 4) continue;
    if (!lower.includes(head.toLowerCase())) continue;
    if (!best || head.length > best.length) best = { place, length: head.length };
  }
  return best?.place ?? null;
}

function placesForDay(day: ItineraryDay, places: Place[]): Place[] {
  const seen = new Set<string>();
  const out: Place[] = [];
  for (const group of day.bullets) {
    for (const item of group.items) {
      const place = placeForText(item, places);
      if (!place || seen.has(place.name)) continue;
      seen.add(place.name);
      out.push(place);
    }
  }
  return out;
}

function derivePace(days: ItineraryDay[]): TripInsightSummary["pace"] {
  if (days.length === 0) return "Balanced";
  const activities = days.reduce(
    (sum, day) => sum + day.bullets.reduce((inner, group) => inner + group.items.length, 0),
    0,
  );
  const perDay = activities / days.length;
  if (perDay <= 5) return "Relaxed";
  if (perDay >= 9) return "Packed";
  return "Balanced";
}

export function buildTripInsightSummary(
  document: TripDocument,
  budget: Budget | null,
): TripInsightSummary {
  const days = document.itinerary;
  const geocoded = document.places.filter((p) => p.lat !== null && p.lng !== null);
  const route = days.slice(0, 4).map((day) => day.title).join(" → ");
  const neighbourhoods = [
    ...new Set(
      [
        ...document.neighborhoods.map((n) => n.label),
        ...document.places
          .filter((p) => p.category === "neighbourhood")
          .map((p) => headName(p.name)),
      ].filter(Boolean),
    ),
  ].slice(0, 3);

  const budgetLabel = budget
    ? combined(
        budget.days.reduce((sum, day) => sum + dayTotal(day), 0),
        budget.currency,
        budget.gbp_rate,
      )
    : null;

  const notes: string[] = [];
  const unpinned = document.places.length - geocoded.length;
  if (unpinned > 0) {
    notes.push(`${unpinned} stop${unpinned === 1 ? "" : "s"} need map confirmation.`);
  }

  for (const day of days) {
    const dayPlaces = placesForDay(day, document.places);
    for (let i = 1; i < dayPlaces.length; i += 1) {
      const km = distanceKm(dayPlaces[i - 1], dayPlaces[i]);
      if (km !== null && km > 35) {
        notes.push(`Day ${day.number} has a long hop between stops.`);
        break;
      }
    }
    if (notes.length >= 2) break;
  }

  if (document.restaurants.length < 3) {
    notes.push("Food coverage is light; add a few more restaurant anchors.");
  }
  if (notes.length === 0) {
    notes.push("Pacing, food coverage, and mapped stops look coherent.");
  }

  return {
    route: route || "Mapped day-by-day plan",
    pace: derivePace(days),
    neighbourhoods,
    budgetLabel,
    mappedStops: geocoded.length,
    qualityNotes: notes.slice(0, 3),
  };
}

export { placeForText, placesForDay };
