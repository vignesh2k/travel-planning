"use client";

import { useEffect, useRef, useState } from "react";

import { COMPILE_KEY, PdfExportModal, type Stage } from "./PdfExportModal";

const SECTION_OPTIONS = [
  { key: "deep_itinerary", label: "In-depth itinerary" },
  { key: "photography", label: "Photography spots" },
  { key: "restaurants_deep", label: "Restaurant deep dive" },
  { key: "logistics", label: "Logistics & what to pack" },
] as const;

const SECTION_RUNNING_LABELS: Record<string, string> = {
  deep_itinerary: "Researching deeper itinerary",
  photography: "Looking for photo spots",
  restaurants_deep: "Deep-diving restaurants",
  logistics: "Compiling logistics",
};

export function PdfExportMenu({
  slug,
  destination,
}: {
  slug: string;
  destination: string;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const [building, setBuilding] = useState<{ sections: string[]; stages: Stage[] } | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Close menu on outside click.
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (!wrapperRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    window.addEventListener("mousedown", handler);
    return () => window.removeEventListener("mousedown", handler);
  }, [menuOpen]);

  function startBuild() {
    const selected = SECTION_OPTIONS.filter((s) => picked[s.key]).map((s) => s.key);
    const stages: Stage[] = [
      ...selected.map((k) => ({
        key: k,
        label: SECTION_RUNNING_LABELS[k] ?? k,
        status: "pending" as const,
      })),
      { key: COMPILE_KEY, label: "Compiling PDF", status: "pending" as const },
    ];
    setBuilding({ sections: selected, stages });
    setMenuOpen(false);
  }

  return (
    <div ref={wrapperRef} className="relative">
      <button
        onClick={() => setMenuOpen((v) => !v)}
        className="frosted rounded-[10px] px-3 py-1 text-xs hover:bg-white/85 flex items-center gap-1"
      >
        Export PDF
        <span className="text-[9px] text-ink-500">▾</span>
      </button>

      {menuOpen && (
        <div className="absolute right-0 top-full mt-1.5 frosted-strong rounded-[12px] p-3 z-30 w-60 flex flex-col gap-2 anim-fade-in">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-500">
            Add extra sections
          </div>
          {SECTION_OPTIONS.map((s) => (
            <label
              key={s.key}
              className="flex items-center gap-2 text-xs text-ink-900 cursor-pointer rounded-md px-1 py-0.5 hover:bg-white/70"
            >
              <input
                type="checkbox"
                checked={!!picked[s.key]}
                onChange={(e) => setPicked({ ...picked, [s.key]: e.target.checked })}
                className="accent-amber-600"
              />
              {s.label}
            </label>
          ))}
          <button
            onClick={startBuild}
            className="mt-1 rounded-[8px] bg-gradient-to-br from-amber-400 to-amber-600 text-white text-xs py-2 font-medium hover:shadow-md"
          >
            Build PDF
          </button>
          <p className="text-[10px] text-ink-500 leading-snug mt-0.5">
            Base itinerary is always included. Each extra section adds 5-15s of generation time.
          </p>
        </div>
      )}

      {building && (
        <PdfExportModal
          slug={slug}
          destination={destination}
          sections={building.sections}
          initialStages={building.stages}
          onClose={() => setBuilding(null)}
        />
      )}
    </div>
  );
}
