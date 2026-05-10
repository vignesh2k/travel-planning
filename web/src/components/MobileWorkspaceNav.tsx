"use client";

import type { WorkspaceTab } from "@/lib/workspace-tabs";
import { WORKSPACE_TAB_LABEL } from "@/lib/workspace-tabs";

import { cx } from "./ui/AtlasPrimitives";

const TAB_ICON: Record<WorkspaceTab, string> = {
  Plan: "☰",
  Map: "⌖",
  Stay: "⌂",
  Money: "£",
  Guide: "▤",
};

export function MobileWorkspaceNav({
  tabs,
  active,
  onChange,
}: {
  tabs: readonly WorkspaceTab[];
  active: WorkspaceTab;
  onChange: (tab: WorkspaceTab) => void;
}) {
  return (
    <nav
      className="absolute inset-x-3 bottom-3 z-50 md:hidden"
      aria-label="Workspace navigation"
    >
      <div className="grid grid-cols-4 rounded-[16px] border border-amber-700/10 bg-white/88 p-1 shadow-2xl backdrop-blur-md">
        {tabs.map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => onChange(tab)}
            aria-current={active === tab ? "page" : undefined}
            className={cx(
              "flex h-11 flex-col items-center justify-center gap-0.5 rounded-[12px] text-[10px] font-semibold",
              active === tab
                ? "bg-ink-900 text-white"
                : "text-ink-500 hover:bg-white hover:text-ink-900",
            )}
          >
            <span className="text-[13px]" aria-hidden>
              {TAB_ICON[tab]}
            </span>
            {WORKSPACE_TAB_LABEL[tab]}
          </button>
        ))}
      </div>
    </nav>
  );
}
