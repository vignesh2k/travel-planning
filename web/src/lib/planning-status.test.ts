import assert from "node:assert/strict";
import test from "node:test";

import {
  activityId,
  ensurePlanningState,
  nextPlanningStatus,
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
