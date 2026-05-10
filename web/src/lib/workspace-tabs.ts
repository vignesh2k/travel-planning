export const WORKSPACE_TABS = ["Plan", "Map", "Stay", "Money", "Guide"] as const;

export type WorkspaceTab = (typeof WORKSPACE_TABS)[number];

export const WORKSPACE_TAB_LABEL: Record<WorkspaceTab, string> = {
  Plan: "Plan",
  Map: "Map",
  Stay: "Stay",
  Money: "Money",
  Guide: "Guide",
};

export function tabsForWorkspace({
  readOnly,
  isMobile,
}: {
  readOnly: boolean;
  isMobile: boolean;
}): WorkspaceTab[] {
  if (readOnly) return ["Plan", "Map", "Stay", "Guide"];
  if (isMobile) return ["Plan", "Map", "Stay", "Guide"];
  return [...WORKSPACE_TABS];
}

export function isSheetTab(tab: WorkspaceTab): boolean {
  return tab !== "Map";
}
