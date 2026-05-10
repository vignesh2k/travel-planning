import { activityId } from "./planning-status.ts";
import type { ItineraryDay, TripDocument } from "./types.ts";

export interface ActivityIndexResult {
  dayNumber: number;
  time: ItineraryDay["bullets"][number]["time"];
  itemIndex: number;
  activityId: string;
  text: string;
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function activityMatchesPlace(activityText: string, placeName: string): boolean {
  const normalizedActivity = normalize(activityText);
  const normalizedPlace = normalize(placeName);
  if (!normalizedActivity || !normalizedPlace) return false;
  return normalizedActivity.includes(normalizedPlace);
}

export function activityIndexForPlace(
  document: TripDocument,
  placeName: string,
): ActivityIndexResult | null {
  for (const day of document.itinerary ?? []) {
    for (const group of day.bullets) {
      for (const [itemIndex, text] of group.items.entries()) {
        if (!activityMatchesPlace(text, placeName)) continue;
        return {
          dayNumber: day.number,
          time: group.time,
          itemIndex,
          activityId: activityId(day.number, group.time, itemIndex),
          text,
        };
      }
    }
  }
  return null;
}
