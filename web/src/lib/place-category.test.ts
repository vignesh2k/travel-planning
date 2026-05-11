import assert from "node:assert/strict";
import test from "node:test";

import { PLACE_CATEGORY_EMOJI } from "./place-category.ts";

test("PLACE_CATEGORY_EMOJI keeps mapped place icons human-readable", () => {
  assert.deepEqual(PLACE_CATEGORY_EMOJI, {
    neighbourhood: "🏛️",
    restaurant: "🍽️",
    photography_spot: "📷",
    logistics: "🧭",
  });
});
