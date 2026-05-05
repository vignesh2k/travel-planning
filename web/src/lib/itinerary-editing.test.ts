import assert from "node:assert/strict";
import test from "node:test";

import {
  addItineraryItem,
  removeItineraryItem,
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
