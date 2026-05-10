import assert from "node:assert/strict";
import test from "node:test";

import {
  activityIndexForPlace,
  activityMatchesPlace,
} from "./trip-activity-index.ts";
import type { TripDocument } from "./types.ts";

const document: TripDocument = {
  document_markdown: "",
  places: [
    {
      name: "Alvor Boardwalk",
      category: "photography_spot",
      description: "Wooden path through marshes",
      lat: 37.129,
      lng: -8.594,
    },
    {
      name: "Green Valley",
      category: "restaurant",
      description: "Plant-based lunch",
      lat: 37.13,
      lng: -8.59,
    },
  ],
  neighborhoods: [],
  restaurants: [],
  itinerary: [
    {
      number: 1,
      title: "Arrival",
      bullets: [
        {
          time: "Morning",
          items: ["Settle in and walk the riverfront."],
        },
      ],
    },
    {
      number: 2,
      title: "Coast",
      bullets: [
        {
          time: "Morning",
          items: ["Alvor Boardwalk, walk this long flat wooden path."],
        },
        {
          time: "Afternoon",
          items: ["Green Valley, plant-based lunch.", "Alvor Boardwalk again for sunset."],
        },
      ],
    },
  ],
};

test("activityMatchesPlace matches by place name in activity text", () => {
  assert.equal(
    activityMatchesPlace(
      "Alvor Boardwalk, walk this long flat wooden path.",
      "Alvor Boardwalk",
    ),
    true,
  );
});

test("activityMatchesPlace ignores case and punctuation differences", () => {
  assert.equal(activityMatchesPlace("green-valley lunch", "Green Valley"), true);
});

test("activityMatchesPlace matches the comma-qualified place head", () => {
  assert.equal(activityMatchesPlace("Louvre Museum tour", "Louvre Museum, Paris"), true);
});

test("activityIndexForPlace returns the first matching activity in itinerary order", () => {
  assert.deepEqual(activityIndexForPlace(document, "Alvor Boardwalk"), {
    dayNumber: 2,
    time: "Morning",
    itemIndex: 0,
    activityId: "day-2-morning-0",
    text: "Alvor Boardwalk, walk this long flat wooden path.",
  });
});

test("activityIndexForPlace returns null when the place is not referenced", () => {
  assert.equal(activityIndexForPlace(document, "Portimao Museum"), null);
});
