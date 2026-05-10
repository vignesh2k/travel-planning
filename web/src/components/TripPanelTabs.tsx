"use client";

const ALL_TABS = ["Plan", "Stay", "Money"] as const;
export type Tab = (typeof ALL_TABS)[number];

export function TripPanelTabs({
  active,
  onChange,
  tabs = ALL_TABS as readonly Tab[],
}: {
  active: Tab;
  onChange: (t: Tab) => void;
  tabs?: readonly Tab[];
}) {
  return (
    <div className="flex gap-4 overflow-x-auto px-4 pt-3 border-b border-amber-700/10">
      {tabs.map((t) => (
        <button
          key={t}
          onClick={() => onChange(t)}
          className={
            t === active
              ? "shrink-0 pb-2 text-xs font-semibold text-ink-900 border-b-2 border-amber-600"
              : "shrink-0 pb-2 text-xs text-ink-500 hover:text-ink-700"
          }
        >
          {t}
        </button>
      ))}
    </div>
  );
}
