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

function metadataKey(dayNumber: number, time: ItineraryBulletGroup["time"], index: number): string {
  return `day-${dayNumber}-${time.toLowerCase()}-${index}`;
}

function reorderActivityMetadata<T>(
  values: Record<string, T>,
  dayNumber: number,
  time: ItineraryBulletGroup["time"],
  itemCount: number,
  fromIndex: number,
  toIndex: number,
): Record<string, T> {
  const next = { ...values };
  const order = Array.from({ length: itemCount }, (_, index) => index);
  const [moved] = order.splice(fromIndex, 1);
  order.splice(toIndex, 0, moved);

  for (let index = 0; index < itemCount; index += 1) {
    delete next[metadataKey(dayNumber, time, index)];
  }

  order.forEach((oldIndex, newIndex) => {
    const value = values[metadataKey(dayNumber, time, oldIndex)];
    if (value !== undefined) {
      next[metadataKey(dayNumber, time, newIndex)] = value;
    }
  });

  return next;
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

export function reorderItineraryItem(
  document: TripDocument,
  dayNumber: number,
  time: ItineraryBulletGroup["time"],
  fromIndex: number,
  toIndex: number,
): TripDocument {
  const next = ensurePlanningState(document);
  const targetGroup = next.itinerary
    .find((day) => day.number === dayNumber)
    ?.bullets.find((group) => group.time === time);
  const itemCount = targetGroup?.items.length ?? 0;

  if (
    fromIndex < 0 ||
    fromIndex >= itemCount ||
    toIndex < 0 ||
    toIndex >= itemCount ||
    fromIndex === toIndex
  ) {
    return next;
  }

  const reordered = replaceGroup(next, dayNumber, time, (group) => {
    const items = [...group.items];
    const [item] = items.splice(fromIndex, 1);
    items.splice(toIndex, 0, item);
    return { ...group, items };
  });

  return {
    ...reordered,
    planning: {
      ...reordered.planning!,
      statuses: reorderActivityMetadata(
        reordered.planning!.statuses,
        dayNumber,
        time,
        itemCount,
        fromIndex,
        toIndex,
      ),
      notes: reorderActivityMetadata(
        reordered.planning!.notes,
        dayNumber,
        time,
        itemCount,
        fromIndex,
        toIndex,
      ),
    },
  };
}
