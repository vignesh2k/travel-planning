"use client";

import { useState } from "react";

import { PdfExportModal, type Stage } from "./PdfExportModal";

export function PdfExportMenu({
  slug,
  destination,
  days,
}: {
  slug: string;
  destination: string;
  days: number;
}) {
  const [building, setBuilding] = useState(false);

  function start() {
    setBuilding(true);
  }

  // Initial pending stages — one per day, plus the final compile step.
  const initialStages: Stage[] = [
    ...Array.from({ length: days }, (_, i) => ({
      key: `day_${i + 1}`,
      label: `Crafting Day ${i + 1}`,
      status: "pending" as const,
    })),
    { key: "compile", label: "Compiling PDF", status: "pending" as const },
  ];

  return (
    <>
      <button
        onClick={start}
        className="frosted rounded-[10px] px-3 py-1 text-xs hover:bg-white/85"
      >
        Export PDF
      </button>

      {building && (
        <PdfExportModal
          slug={slug}
          destination={destination}
          sections={[]}
          initialStages={initialStages}
          onClose={() => setBuilding(false)}
        />
      )}
    </>
  );
}
