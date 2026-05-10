"use client";

import type { WorkspaceTab } from "@/lib/workspace-tabs";
import { WORKSPACE_TAB_LABEL } from "@/lib/workspace-tabs";

import { cx } from "./ui/AtlasPrimitives";

export function TripPanelTabs({
  active,
  onChange,
  tabs,
}: {
  active: WorkspaceTab;
  onChange: (tab: WorkspaceTab) => void;
  tabs: readonly WorkspaceTab[];
}) {
  return (
    <div className="flex gap-4 overflow-x-auto border-b border-amber-700/10 px-4 pt-3">
      {tabs.map((tab) => (
        <button
          key={tab}
          type="button"
          onClick={() => onChange(tab)}
          className={cx(
            "shrink-0 pb-2 text-xs",
            tab === active
              ? "border-b-2 border-amber-600 font-semibold text-ink-900"
              : "text-ink-500 hover:text-ink-700",
          )}
        >
          {WORKSPACE_TAB_LABEL[tab]}
        </button>
      ))}
    </div>
  );
}
