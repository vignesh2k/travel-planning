import assert from "node:assert/strict";
import test from "node:test";

import {
  isSheetTab,
  tabsForWorkspace,
  WORKSPACE_TAB_LABEL,
} from "./workspace-tabs.ts";

test("private desktop trips show every command center tab", () => {
  assert.deepEqual(tabsForWorkspace({ readOnly: false, isMobile: false }), [
    "Plan",
    "Map",
    "Stay",
    "Money",
    "Guide",
  ]);
});

test("private mobile trips hide Money from the primary bottom nav", () => {
  assert.deepEqual(tabsForWorkspace({ readOnly: false, isMobile: true }), [
    "Plan",
    "Map",
    "Stay",
    "Guide",
  ]);
});

test("read-only trips hide private money surfaces", () => {
  assert.deepEqual(tabsForWorkspace({ readOnly: true, isMobile: false }), [
    "Plan",
    "Map",
    "Stay",
    "Guide",
  ]);
});

test("map is not a sheet tab on mobile", () => {
  assert.equal(isSheetTab("Map"), false);
  assert.equal(isSheetTab("Plan"), true);
  assert.equal(isSheetTab("Guide"), true);
});

test("tab labels are stable", () => {
  assert.equal(WORKSPACE_TAB_LABEL.Plan, "Plan");
  assert.equal(WORKSPACE_TAB_LABEL.Money, "Money");
  assert.equal(WORKSPACE_TAB_LABEL.Guide, "Guide");
});
