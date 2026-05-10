import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const WEB_ROOT = new URL("../../", import.meta.url);
const SERVER_ROUTE_FILES = [
  "src/app/trip/[slug]/page.tsx",
  "src/app/s/[token]/page.tsx",
];
const TRIP_WORKSPACE_FILE = "src/components/TripWorkspace.tsx";

function readWorkspaceFile(file) {
  return readFile(new URL(file, WEB_ROOT), "utf8");
}

test("server routes do not pass callback props into TripPanel", async () => {
  for (const file of SERVER_ROUTE_FILES) {
    const source = await readWorkspaceFile(file);

    assert.equal(
      /onFocusPlaces=\{/.test(source),
      false,
      `${file} passes onFocusPlaces across the Server Component boundary`,
    );
    assert.equal(
      /onRefinePrefill=\{/.test(source),
      false,
      `${file} passes onRefinePrefill across the Server Component boundary`,
    );
  }
});

test("trip server routes mount the map workspace", async () => {
  for (const file of SERVER_ROUTE_FILES) {
    const source = await readWorkspaceFile(file);

    assert.match(source, /<TripWorkspace\b/, `${file} should render the trip map workspace`);
    assert.equal(
      /<TripPanel\b/.test(source),
      false,
      `${file} should not bypass the map workspace with TripPanel directly`,
    );
  }
});

test("trip workspace only mounts the portal sheet on mobile", async () => {
  const source = await readWorkspaceFile(TRIP_WORKSPACE_FILE);

  assert.match(
    source,
    /\{isMobile && isSheetTab\(workspaceTab\) && \(\s*<MobileSheet>/,
    "MobileSheet portals outside its parent, so it must be conditionally mounted on mobile sheet tabs",
  );
});

test("trip workspace exposes authenticated top-nav actions", async () => {
  const source = await readWorkspaceFile(TRIP_WORKSPACE_FILE);

  assert.match(source, /<SaveTripButton\b/, "TripWorkspace should render save controls");
  assert.match(source, /<PdfExportMenu\b/, "TripWorkspace should render PDF export controls");
  assert.match(source, /<ShareMenu\b/, "TripWorkspace should render share controls");
  assert.match(source, /<header\b/, "TripWorkspace should render the trip top navigation");
  assert.equal(
    /actions=\{actions\}/.test(source),
    false,
    "TripWorkspace should not pass top-nav actions into the side panel",
  );
});
