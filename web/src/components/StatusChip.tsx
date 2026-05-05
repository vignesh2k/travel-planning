"use client";

import type { PlanningStatusValue } from "@/lib/types";
import { STATUS_META } from "@/lib/planning-status";

const TONE_CLASS: Record<string, string> = {
  slate: "bg-slate-100 text-slate-700 border-slate-200",
  amber: "bg-amber-100 text-amber-800 border-amber-200",
  rose: "bg-rose-100 text-rose-700 border-rose-200",
  emerald: "bg-emerald-100 text-emerald-700 border-emerald-200",
  blue: "bg-sky-100 text-sky-700 border-sky-200",
  zinc: "bg-zinc-100 text-zinc-600 border-zinc-200",
};

export function StatusChip({
  value,
  onClick,
  compact = false,
}: {
  value: PlanningStatusValue;
  onClick?: () => void;
  compact?: boolean;
}) {
  const meta = STATUS_META[value];
  const className = [
    "inline-flex items-center rounded-full border font-medium whitespace-nowrap",
    compact ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-1 text-[11px]",
    TONE_CLASS[meta.tone] ?? TONE_CLASS.slate,
    onClick ? "hover:brightness-95" : "",
  ].join(" ");

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={className} title="Change status">
        {meta.label}
      </button>
    );
  }

  return <span className={className}>{meta.label}</span>;
}
