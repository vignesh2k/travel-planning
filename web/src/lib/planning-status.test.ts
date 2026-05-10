import assert from "node:assert/strict";
import test from "node:test";

import {
  activityId,
  decisionQuickActionsForStatus,
  ensurePlanningState,
  nextPlanningStatus,
  openDecisionItemsForDisplay,
  planningReadinessForDocument,
  setActivityNote,
  setActivityStatus,
} from "./planning-status.ts";
import type { TripDocument } from "./types.ts";

const document: TripDocument = {
  document_markdown: "## Overview",
  places: [],
  neighborhoods: [],
  restaurants: [],
  itinerary: [],
};

test("ensurePlanningState fills defaults without dropping existing document data", () => {
  const next = ensurePlanningState(document);
  assert.equal(next.document_markdown, "## Overview");
  assert.deepEqual(next.planning?.statuses, {});
  assert.equal(next.planning?.last_editor_version, 1);
});

test("activityId is stable for a rendered activity position", () => {
  assert.equal(activityId(2, "Morning", 1), "day-2-morning-1");
});

test("nextPlanningStatus cycles through the workflow states", () => {
  assert.equal(nextPlanningStatus(), "idea");
  assert.equal(nextPlanningStatus("idea"), "maybe");
  assert.equal(nextPlanningStatus("skip"), "idea");
});

test("decisionQuickActionsForStatus offers status actions that clear open decisions", () => {
  assert.deepEqual(decisionQuickActionsForStatus("needs_booking"), [
    { label: "Booked", status: "booked" },
    { label: "Skip", status: "skip" },
  ]);
  assert.deepEqual(decisionQuickActionsForStatus("maybe"), [
    { label: "Keep", status: "idea" },
    { label: "Skip", status: "skip" },
  ]);
  assert.deepEqual(decisionQuickActionsForStatus("booked"), []);
});

test("openDecisionItemsForDisplay limits collapsed decisions and exposes hidden count", () => {
  const items = [0, 1, 2, 3, 4].map((itemIndex) => ({
    id: `day-1-morning-${itemIndex}`,
    dayNumber: 1,
    time: "Morning",
    itemIndex,
    text: `Decision ${itemIndex}`,
    status: "maybe" as const,
  }));

  const collapsed = openDecisionItemsForDisplay(items, false);
  assert.deepEqual(collapsed.items.map((item) => item.text), [
    "Decision 0",
    "Decision 1",
    "Decision 2",
  ]);
  assert.equal(collapsed.hiddenCount, 2);
  assert.equal(collapsed.canExpand, true);

  const expanded = openDecisionItemsForDisplay(items, true);
  assert.equal(expanded.items.length, 5);
  assert.equal(expanded.hiddenCount, 0);
});

test("setActivityStatus stores status under the activity id", () => {
  const next = setActivityStatus(document, "day-1-morning-0", "booked");
  assert.equal(next.planning?.statuses["day-1-morning-0"], "booked");
});

test("setActivityNote removes empty notes", () => {
  const withNote = setActivityNote(document, "day-1-morning-0", "Reserve by Friday");
  const cleared = setActivityNote(withNote, "day-1-morning-0", "");
  assert.equal(withNote.planning?.notes["day-1-morning-0"], "Reserve by Friday");
  assert.equal(cleared.planning?.notes["day-1-morning-0"], undefined);
});

test("planningReadinessForDocument summarizes itinerary status in render order", () => {
  const summary = planningReadinessForDocument({
    ...document,
    itinerary: [
      {
        number: 1,
        title: "Arrival",
        bullets: [
          { time: "Morning", items: ["Book museum", "Coffee stop"] },
          { time: "Afternoon", items: ["Harbour walk"] },
          { time: "Evening", items: ["Dinner"] },
        ],
      },
    ],
    planning: {
      statuses: {
        "day-1-morning-0": "needs_booking",
        "day-1-afternoon-0": "booked",
        "day-1-evening-0": "paid",
      },
      notes: { "day-1-morning-0": "Reserve timed entry" },
      dismissed_health_checks: [],
      last_editor_version: 1,
    },
  });

  assert.equal(summary.total, 4);
  assert.equal(summary.confirmed, 2);
  assert.equal(summary.needsBooking, 1);
  assert.equal(summary.maybe, 0);
  assert.equal(summary.ideas, 1);
  assert.deepEqual(summary.openItems.map((item) => item.text), ["Book museum"]);
  assert.equal(summary.openItems[0].note, "Reserve timed entry");
});
