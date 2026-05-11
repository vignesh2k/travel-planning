import { cx } from "./ui/AtlasPrimitives";

export const TOP_NAV_BUTTON_CLASS =
  "inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-[12px] border border-amber-700/12 bg-white/82 px-4 text-sm font-semibold text-ink-900 shadow-sm hover:bg-white disabled:cursor-default disabled:opacity-55";

export function topNavButtonClass(className?: string): string {
  return cx(TOP_NAV_BUTTON_CLASS, className);
}
