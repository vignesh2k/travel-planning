"use client";

const TABS = ["Itinerary", "Where to stay"] as const;
export type Tab = (typeof TABS)[number];

export function TripPanelTabs({
  active,
  onChange,
}: {
  active: Tab;
  onChange: (t: Tab) => void;
}) {
  return (
    <div className="flex gap-4 px-4 pt-3 border-b border-amber-700/10">
      {TABS.map((t) => (
        <button
          key={t}
          onClick={() => onChange(t)}
          className={
            t === active
              ? "pb-2 text-xs font-semibold text-ink-900 border-b-2 border-amber-600"
              : "pb-2 text-xs text-ink-500 hover:text-ink-700"
          }
        >
          {t}
        </button>
      ))}
    </div>
  );
}
