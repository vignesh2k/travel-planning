import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const WEB_ROOT = new URL("../../", import.meta.url);
const SERVER_ROUTE_FILES = [
  "src/app/trip/[slug]/page.tsx",
  "src/app/s/[token]/page.tsx",
];
const TRIP_WORKSPACE_FILE = "src/components/TripWorkspace.tsx";
const ITINERARY_FILE = "src/components/Itinerary.tsx";

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

test("map place selection returns to the plan before scrolling activity cards", async () => {
  const source = await readWorkspaceFile(TRIP_WORKSPACE_FILE);

  assert.match(
    source,
    /const selectPlace = useCallback\(\(place: Place\) => \{[\s\S]*setWorkspaceTab\("Plan"\);[\s\S]*setSelectedPlaceName\(place\.name\);[\s\S]*\}, \[\]\);/,
    "Map pin clicks should reveal the Plan panel before TripPanel scrolls to the matching activity card",
  );
});

test("trip workspace passes stable focus handlers into the itinerary panel", async () => {
  const source = await readWorkspaceFile(TRIP_WORKSPACE_FILE);

  assert.match(
    source,
    /const focus = useCallback\(\(next: Place\[\] \| null\) => \{[\s\S]*setSelectedPlaceName\(selectedPlaceNameForFocus\(next\)\);[\s\S]*\}, \[\]\);/,
    "The itinerary active-day focus effect depends on a stable onFocusPlaces callback",
  );
});

test("itinerary day focus does not clear an active map-pin selection", async () => {
  const source = await readWorkspaceFile(ITINERARY_FILE);

  assert.match(
    source,
    /if \(!active \|\| selectedPlaceName\) return;/,
    "The active-day map focus effect should not clear a map-pin selection before the scroll runs",
  );
  assert.match(
    source,
    /onClick=\{\(\) => selectDay\(d\)\}/,
    "Explicit day clicks should still refocus the map after skipping automatic focus during pin selection",
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

test("trip workspace centers the title independently from top-nav actions", async () => {
  const source = await readWorkspaceFile(TRIP_WORKSPACE_FILE);

  assert.match(
    source,
    /sm:absolute sm:left-1\/2 sm:top-1\/2[\s\S]*sm:-translate-x-1\/2 sm:-translate-y-1\/2/,
    "The destination title should be centered in the viewport, not between uneven header columns",
  );
});

test("trip workspace wires itinerary refine pills into the refine input", async () => {
  const source = await readWorkspaceFile(TRIP_WORKSPACE_FILE);

  assert.match(source, /<RefineInput\b/, "TripWorkspace should mount the refine input");
  assert.match(
    source,
    /onRefinePrefill=\{prefillRefine\}/,
    "TripPanel quick refine actions should prefill the refine input",
  );
  assert.match(
    source,
    /prefillKey=\{refinePrefillKey\}/,
    "Repeated quick refine clicks should re-apply the prefill",
  );
});
