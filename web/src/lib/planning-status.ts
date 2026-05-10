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

export interface PlanningReadinessItem {
  id: string;
  dayNumber: number;
  time: string;
  itemIndex: number;
  text: string;
  status: PlanningStatusValue;
  note?: string;
}

export interface PlanningReadinessSummary {
  total: number;
  confirmed: number;
  booked: number;
  paid: number;
  needsBooking: number;
  maybe: number;
  ideas: number;
  skipped: number;
  openItems: PlanningReadinessItem[];
}

export interface DecisionQuickAction {
  label: string;
  status: PlanningStatusValue;
}

export interface OpenDecisionDisplay {
  items: PlanningReadinessItem[];
  hiddenCount: number;
  canExpand: boolean;
}

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

export function planningReadinessForDocument(document: TripDocument): PlanningReadinessSummary {
  const next = ensurePlanningState(document);
  const summary: PlanningReadinessSummary = {
    total: 0,
    confirmed: 0,
    booked: 0,
    paid: 0,
    needsBooking: 0,
    maybe: 0,
    ideas: 0,
    skipped: 0,
    openItems: [],
  };

  for (const day of next.itinerary) {
    for (const group of day.bullets) {
      group.items.forEach((text, itemIndex) => {
        const id = activityId(day.number, group.time, itemIndex);
        const status = next.planning?.statuses[id] ?? "idea";
        const note = next.planning?.notes[id];

        summary.total += 1;
        if (status === "booked") summary.booked += 1;
        if (status === "paid") summary.paid += 1;
        if (status === "needs_booking") summary.needsBooking += 1;
        if (status === "maybe") summary.maybe += 1;
        if (status === "idea") summary.ideas += 1;
        if (status === "skip") summary.skipped += 1;
        if (status === "booked" || status === "paid") summary.confirmed += 1;
        if (status === "needs_booking" || status === "maybe") {
          summary.openItems.push({
            id,
            dayNumber: day.number,
            time: group.time,
            itemIndex,
            text,
            status,
            note,
          });
        }
      });
    }
  }

  return summary;
}

export function nextPlanningStatus(current?: PlanningStatusValue): PlanningStatusValue {
  const index = current ? PLANNING_STATUSES.indexOf(current) : -1;
  return PLANNING_STATUSES[(index + 1) % PLANNING_STATUSES.length];
}

export function decisionQuickActionsForStatus(status: PlanningStatusValue): DecisionQuickAction[] {
  if (status === "needs_booking") {
    return [
      { label: "Booked", status: "booked" },
      { label: "Skip", status: "skip" },
    ];
  }
  if (status === "maybe") {
    return [
      { label: "Keep", status: "idea" },
      { label: "Skip", status: "skip" },
    ];
  }
  return [];
}

export function openDecisionItemsForDisplay(
  items: PlanningReadinessItem[],
  expanded: boolean,
  limit = 3,
): OpenDecisionDisplay {
  const visibleItems = expanded ? items : items.slice(0, limit);
  return {
    items: visibleItems,
    hiddenCount: expanded ? 0 : Math.max(0, items.length - visibleItems.length),
    canExpand: items.length > limit,
  };
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
