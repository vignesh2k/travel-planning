import assert from "node:assert/strict";
import test from "node:test";

import {
  activityId,
  ensurePlanningState,
  nextPlanningStatus,
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
