import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const SERVER_ROUTE_FILES = [
  "web/src/app/trip/[slug]/page.tsx",
  "web/src/app/s/[token]/page.tsx",
];

test("server routes do not pass callback props into TripPanel", async () => {
  for (const file of SERVER_ROUTE_FILES) {
    const source = await readFile(file, "utf8");

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
