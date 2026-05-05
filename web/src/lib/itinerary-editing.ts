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

export function moveItineraryItem(
  document: TripDocument,
  dayNumber: number,
  time: ItineraryBulletGroup["time"],
  itemIndex: number,
  direction: -1 | 1,
): TripDocument {
  return replaceGroup(document, dayNumber, time, (group) => {
    const targetIndex = itemIndex + direction;
    if (targetIndex < 0 || targetIndex >= group.items.length) return group;
    const items = [...group.items];
    const [item] = items.splice(itemIndex, 1);
    items.splice(targetIndex, 0, item);
    return { ...group, items };
  });
}
