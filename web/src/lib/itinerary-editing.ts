import type { ItineraryBulletGroup, TripDocument } from "./types.ts";
import { ensurePlanningState } from "./planning-status.ts";

function replaceGroup(
  document: TripDocument,
  dayNumber: number,
  time: ItineraryBulletGroup["time"],
  updater: (group: ItineraryBulletGroup) => ItineraryBulletGroup,
): TripDocument {
  const next = ensurePlanningState(document);
  return {
    ...next,
    itinerary: next.itinerary.map((day) => {
      if (day.number !== dayNumber) return day;
      return {
        ...day,
        bullets: day.bullets.map((group) => (group.time === time ? updater(group) : group)),
      };
    }),
  };
}

export function updateItineraryItem(
  document: TripDocument,
  dayNumber: number,
  time: ItineraryBulletGroup["time"],
  itemIndex: number,
  value: string,
): TripDocument {
  return replaceGroup(document, dayNumber, time, (group) => ({
    ...group,
    items: group.items.map((item, index) => (index === itemIndex ? value : item)),
  }));
}

export function addItineraryItem(
  document: TripDocument,
  dayNumber: number,
  time: ItineraryBulletGroup["time"],
  value = "New plan item",
): TripDocument {
  return replaceGroup(document, dayNumber, time, (group) => ({
    ...group,
    items: [...group.items, value],
  }));
}

export function removeItineraryItem(
  document: TripDocument,
  dayNumber: number,
  time: ItineraryBulletGroup["time"],
  itemIndex: number,
): TripDocument {
  return replaceGroup(document, dayNumber, time, (group) => ({
    ...group,
    items: group.items.filter((_, index) => index !== itemIndex),
  }));
}
