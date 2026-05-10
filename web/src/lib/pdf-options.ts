export const PDF_SECTIONS = [
  "food",
  "photos",
  "tips",
  "costs",
] as const;

export type PdfSectionKey = (typeof PDF_SECTIONS)[number];

export const PDF_SECTION_LABEL: Record<PdfSectionKey, string> = {
  food: "Food spots",
  photos: "Photo spots",
  tips: "Tips",
  costs: "Estimated costs",
};

export const PDF_STYLE_OPTIONS = [
  { key: "pretty", label: "Editorial" },
  { key: "compact", label: "Compact" },
  { key: "reference", label: "Classic" },
] as const;

export type PdfStyleKey = (typeof PDF_STYLE_OPTIONS)[number]["key"];

export function defaultPdfSections(): PdfSectionKey[] {
  return [...PDF_SECTIONS];
}

export function defaultPdfSectionSelection(): Record<PdfSectionKey, boolean> {
  return {
    food: true,
    photos: true,
    tips: true,
    costs: true,
  };
}

export function visiblePdfSections({
  readOnly,
}: {
  readOnly: boolean;
}): PdfSectionKey[] {
  return readOnly
    ? PDF_SECTIONS.filter((section) => section !== "costs")
    : [...PDF_SECTIONS];
}

export function pdfSectionSummary(sections: readonly PdfSectionKey[]): string {
  const labels = sections.map((section) => PDF_SECTION_LABEL[section].toLowerCase());
  if (labels.length === 0) return "No optional sections";
  if (labels.length === 1) return PDF_SECTION_LABEL[sections[0]];
  if (labels.length === 2) {
    return `${labels[0][0].toUpperCase()}${labels[0].slice(1)} and ${labels[1]}`;
  }
  const head = labels.slice(0, -1);
  return `${head[0][0].toUpperCase()}${head[0].slice(1)}${head
    .slice(1)
    .map((label) => `, ${label}`)
    .join("")}, and ${labels[labels.length - 1]}`;
}
