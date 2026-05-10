import type { PublicTrip, TripDocument, TripFull } from "./types.ts";
import {
  ensurePlanningState,
  planningReadinessForDocument,
  type OpenDecisionFilter,
} from "./planning-status.ts";

export type PlanHealthSeverity = "good" | "watch" | "risk";

export interface PlanHealthCheck {
  id: string;
  title: string;
  detail: string;
  severity: Exclude<PlanHealthSeverity, "good">;
  decisionFilter?: OpenDecisionFilter;
}

export interface PlanHealthSummary {
  severity: PlanHealthSeverity;
  score: number;
  checks: PlanHealthCheck[];
  hiddenCount: number;
}

type HealthTrip = Pick<TripFull | PublicTrip, "days" | "start_date" | "document"> & {
  airport_entry?: string | null;
  airport_exit?: string | null;
};

function visibleChecks(document: TripDocument, checks: PlanHealthCheck[]): PlanHealthCheck[] {
  const dismissed = new Set(ensurePlanningState(document).planning?.dismissed_health_checks ?? []);
  return checks.filter((check) => !dismissed.has(check.id));
}

export function planHealthForTrip(trip: HealthTrip): PlanHealthSummary {
  const document = ensurePlanningState(trip.document);
  const checks: PlanHealthCheck[] = [];

  if (!trip.start_date) {
    checks.push({
      id: "missing-start-date",
      title: "Add trip dates",
      detail: "The itinerary can be more useful once the start date is set.",
      severity: "watch",
    });
  }

  if ((document.itinerary?.length ?? 0) < trip.days) {
    checks.push({
      id: "itinerary-days-short",
      title: "Review day coverage",
      detail: "The visible itinerary has fewer days than the trip length.",
      severity: "risk",
    });
  }

  const emptyDay = document.itinerary?.find((day) => day.bullets.every((group) => group.items.length === 0));
  if (emptyDay) {
    checks.push({
      id: `empty-day-${emptyDay.number}`,
      title: `Day ${emptyDay.number} needs detail`,
      detail: "This day does not have any planned activities yet.",
      severity: "risk",
    });
  }

  const readiness = planningReadinessForDocument(document);
  if (readiness.needsBooking > 0) {
    checks.push({
      id: "needs-booking",
      title: "Bookings still open",
      detail: `${readiness.needsBooking} item${readiness.needsBooking === 1 ? "" : "s"} marked as needing a booking.`,
      severity: "watch",
      decisionFilter: "needs_booking",
    });
  }

  if (readiness.maybe > 0) {
    checks.push({
      id: "maybe-decisions",
      title: "Decisions still open",
      detail: `${readiness.maybe} item${readiness.maybe === 1 ? "" : "s"} still marked as maybe.`,
      severity: "watch",
      decisionFilter: "maybe",
    });
  }

  const mappedPlaces = document.places.filter((place) => place.lat !== null && place.lng !== null).length;
  if (document.places.length > 0 && mappedPlaces === 0) {
    checks.push({
      id: "no-mapped-places",
      title: "Map needs locations",
      detail: "No saved places currently have coordinates.",
      severity: "watch",
    });
  }

  const activeChecks = visibleChecks(document, checks);
  const hiddenCount = checks.length - activeChecks.length;
  const riskCount = activeChecks.filter((check) => check.severity === "risk").length;
  const watchCount = activeChecks.filter((check) => check.severity === "watch").length;
  const severity: PlanHealthSeverity = riskCount > 0 ? "risk" : watchCount > 0 ? "watch" : "good";
  const score = Math.max(0, 100 - riskCount * 28 - watchCount * 14);

  return {
    severity,
    score,
    checks: activeChecks,
    hiddenCount,
  };
}

export function dismissHealthCheck(document: TripDocument, checkId: string): TripDocument {
  const next = ensurePlanningState(document);
  const dismissed = new Set(next.planning?.dismissed_health_checks ?? []);
  dismissed.add(checkId);
  return {
    ...next,
    planning: {
      ...next.planning!,
      dismissed_health_checks: Array.from(dismissed),
    },
  };
}
