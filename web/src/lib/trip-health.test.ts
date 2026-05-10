import assert from "node:assert/strict";
import test from "node:test";

import { dismissHealthCheck, planHealthForTrip } from "./trip-health.ts";
import type { TripFull } from "./types.ts";

const healthyTrip: Pick<TripFull, "days" | "start_date" | "document"> = {
  days: 1,
  start_date: "2026-05-15",
  document: {
    document_markdown: "## Overview",
    places: [{ name: "Gion", category: "neighbourhood", description: "x", lat: 35, lng: 135 }],
    neighborhoods: [],
    restaurants: [],
    itinerary: [
      {
        number: 1,
        title: "Arrival",
        bullets: [{ time: "Morning", items: ["Coffee"] }],
      },
    ],
    planning: {
      statuses: {},
      notes: {},
      dismissed_health_checks: [],
      last_editor_version: 1,
    },
  },
};

test("planHealthForTrip returns good health for a complete basic trip", () => {
  const summary = planHealthForTrip(healthyTrip);
  assert.equal(summary.severity, "good");
  assert.equal(summary.checks.length, 0);
  assert.equal(summary.score, 100);
});

test("planHealthForTrip flags missing dates and short itinerary coverage", () => {
  const summary = planHealthForTrip({
    ...healthyTrip,
    days: 3,
    start_date: null,
  });
  assert.equal(summary.severity, "risk");
  assert.deepEqual(summary.checks.map((check) => check.id), ["missing-start-date", "itinerary-days-short"]);
});

test("planHealthForTrip flags open booking statuses", () => {
  const summary = planHealthForTrip({
    ...healthyTrip,
    document: {
      ...healthyTrip.document,
      planning: {
        statuses: { "day-1-morning-0": "needs_booking" },
        notes: {},
        dismissed_health_checks: [],
        last_editor_version: 1,
      },
    },
  });
  assert.equal(summary.severity, "watch");
  assert.equal(summary.checks[0].id, "needs-booking");
});

test("planHealthForTrip flags maybe decisions as unfinished planning", () => {
  const summary = planHealthForTrip({
    ...healthyTrip,
    document: {
      ...healthyTrip.document,
      planning: {
        statuses: { "day-1-morning-0": "maybe" },
        notes: {},
        dismissed_health_checks: [],
        last_editor_version: 1,
      },
    },
  });
  assert.equal(summary.severity, "watch");
  assert.equal(summary.checks[0].id, "maybe-decisions");
});

test("dismissHealthCheck hides a health check", () => {
  const document = dismissHealthCheck(healthyTrip.document, "missing-start-date");
  const summary = planHealthForTrip({
    ...healthyTrip,
    start_date: null,
    document,
  });
  assert.equal(summary.hiddenCount, 1);
  assert.equal(summary.checks.find((check) => check.id === "missing-start-date"), undefined);
});
