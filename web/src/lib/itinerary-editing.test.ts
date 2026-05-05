import assert from "node:assert/strict";
import test from "node:test";

import {
  addItineraryItem,
  moveItineraryItem,
  removeItineraryItem,
  reorderItineraryItem,
  updateItineraryItem,
} from "./itinerary-editing.ts";
import type { TripDocument } from "./types.ts";

const document: TripDocument = {
  document_markdown: "## Overview",
  places: [],
  neighborhoods: [],
  restaurants: [],
  itinerary: [
    {
      number: 1,
      title: "Arrival",
      bullets: [
        { time: "Morning", items: ["Coffee", "Market"] },
        { time: "Evening", items: ["Dinner"] },
      ],
    },
  ],
};

test("updateItineraryItem changes only the targeted item", () => {
  const next = updateItineraryItem(document, 1, "Morning", 1, "Nishiki Market");
  assert.deepEqual(next.itinerary[0].bullets[0].items, ["Coffee", "Nishiki Market"]);
  assert.deepEqual(document.itinerary[0].bullets[0].items, ["Coffee", "Market"]);
});

test("addItineraryItem appends to the requested day part", () => {
  const next = addItineraryItem(document, 1, "Evening", "Jazz bar");
  assert.deepEqual(next.itinerary[0].bullets[1].items, ["Dinner", "Jazz bar"]);
});

test("removeItineraryItem removes by index", () => {
  const next = removeItineraryItem(document, 1, "Morning", 0);
  assert.deepEqual(next.itinerary[0].bullets[0].items, ["Market"]);
});

test("moveItineraryItem moves within bounds and ignores impossible moves", () => {
  const moved = moveItineraryItem(document, 1, "Morning", 1, -1);
  const ignored = moveItineraryItem(document, 1, "Morning", 0, -1);
  assert.deepEqual(moved.itinerary[0].bullets[0].items, ["Market", "Coffee"]);
  assert.deepEqual(ignored.itinerary[0].bullets[0].items, ["Coffee", "Market"]);
});

test("reorderItineraryItem moves directly to a target index", () => {
  const next = reorderItineraryItem(
    {
      ...document,
      itinerary: [
        {
          number: 1,
          title: "Arrival",
          bullets: [{ time: "Morning", items: ["Coffee", "Market", "Gallery"] }],
        },
      ],
    },
    1,
    "Morning",
    0,
    2,
  );

  assert.deepEqual(next.itinerary[0].bullets[0].items, ["Market", "Gallery", "Coffee"]);
});

test("reorderItineraryItem moves status metadata with the reordered card", () => {
  const next = reorderItineraryItem(
    {
      ...document,
      itinerary: [
        {
          number: 1,
          title: "Arrival",
          bullets: [{ time: "Morning", items: ["Coffee", "Market", "Gallery"] }],
        },
      ],
      planning: {
        statuses: {
          "day-1-morning-0": "booked",
          "day-1-morning-1": "needs_booking",
        },
        notes: {
          "day-1-morning-0": "Confirmed",
        },
        dismissed_health_checks: [],
        last_editor_version: 1,
      },
    },
    1,
    "Morning",
    0,
    2,
  );

  assert.equal(next.planning?.statuses["day-1-morning-2"], "booked");
  assert.equal(next.planning?.statuses["day-1-morning-0"], "needs_booking");
  assert.equal(next.planning?.notes["day-1-morning-2"], "Confirmed");
});
