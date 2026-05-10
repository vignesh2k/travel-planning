import assert from "node:assert/strict";
import test from "node:test";

import {
  defaultPdfSectionSelection,
  defaultPdfSections,
  PDF_STYLE_OPTIONS,
  pdfSectionSummary,
  visiblePdfSections,
} from "./pdf-options.ts";

test("defaultPdfSections includes the core guide sections", () => {
  assert.deepEqual(defaultPdfSections(), [
    "food",
    "photos",
    "tips",
    "costs",
  ]);
});

test("defaultPdfSectionSelection enables every guide section by default", () => {
  assert.deepEqual(defaultPdfSectionSelection(), {
    food: true,
    photos: true,
    tips: true,
    costs: true,
  });
});

test("visiblePdfSections hides costs for read-only trips", () => {
  assert.deepEqual(visiblePdfSections({ readOnly: true }), [
    "food",
    "photos",
    "tips",
  ]);
});

test("pdfSectionSummary formats selected sections", () => {
  assert.equal(
    pdfSectionSummary(["food", "photos", "tips"]),
    "Food spots, photo spots, and tips",
  );
});

test("PDF_STYLE_OPTIONS keeps the Guide tab display order", () => {
  assert.deepEqual(
    PDF_STYLE_OPTIONS.map((option) => option.key),
    ["pretty", "compact", "reference"],
  );
});
