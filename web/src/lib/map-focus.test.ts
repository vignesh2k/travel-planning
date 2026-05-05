import assert from "node:assert/strict";
import test from "node:test";

import { selectedPlaceNameForFocus } from "./map-focus.ts";

test("clears selected place when focus returns to a whole day", () => {
  assert.equal(
    selectedPlaceNameForFocus([
      { name: "Canal Ring" },
      { name: "Jordaan" },
    ]),
    null,
  );
});

test("keeps a selected place for single-place focus", () => {
  assert.equal(selectedPlaceNameForFocus([{ name: "Canal Ring" }]), "Canal Ring");
});

test("clears selected place when focus is empty", () => {
  assert.equal(selectedPlaceNameForFocus(null), null);
});
