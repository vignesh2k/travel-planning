import type { PlanningStatusValue, TripDocument, TripPlanningState } from "./types.ts";

export const PLANNING_STATUSES: PlanningStatusValue[] = [
  "idea",
  "maybe",
  "needs_booking",
  "booked",
  "paid",
  "skip",
];

export const STATUS_META: Record<PlanningStatusValue, { label: string; tone: string }> = {
  idea: { label: "Idea", tone: "slate" },
  maybe: { label: "Maybe", tone: "amber" },
  needs_booking: { label: "Needs booking", tone: "rose" },
  booked: { label: "Booked", tone: "emerald" },
  paid: { label: "Paid", tone: "blue" },
  skip: { label: "Skip", tone: "zinc" },
};

export function defaultPlanningState(): TripPlanningState {
  return {
    statuses: {},
    notes: {},
    dismissed_health_checks: [],
    last_editor_version: 1,
  };
}

export function ensurePlanningState(document: TripDocument): TripDocument {
  return {
    ...document,
    restaurants: document.restaurants ?? [],
    itinerary: document.itinerary ?? [],
    planning: {
      ...defaultPlanningState(),
      ...(document.planning ?? {}),
      statuses: document.planning?.statuses ?? {},
      notes: document.planning?.notes ?? {},
      dismissed_health_checks: document.planning?.dismissed_health_checks ?? [],
    },
  };
}

export function activityId(dayNumber: number, time: string, itemIndex: number): string {
  return `day-${dayNumber}-${time.toLowerCase()}-${itemIndex}`;
}

export function nextPlanningStatus(current?: PlanningStatusValue): PlanningStatusValue {
  const index = current ? PLANNING_STATUSES.indexOf(current) : -1;
  return PLANNING_STATUSES[(index + 1) % PLANNING_STATUSES.length];
}

export function setActivityStatus(
  document: TripDocument,
  id: string,
  status: PlanningStatusValue,
): TripDocument {
  const next = ensurePlanningState(document);
  return {
    ...next,
    planning: {
      ...next.planning!,
      statuses: {
        ...next.planning!.statuses,
        [id]: status,
      },
    },
  };
}

export function setActivityNote(document: TripDocument, id: string, note: string): TripDocument {
  const next = ensurePlanningState(document);
  const notes = { ...next.planning!.notes };
  if (note.trim()) notes[id] = note;
  else delete notes[id];
  return {
    ...next,
    planning: {
      ...next.planning!,
      notes,
    },
  };
}
