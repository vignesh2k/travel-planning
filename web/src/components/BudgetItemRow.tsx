"use client";

import { combined } from "@/lib/currency";
import type { BudgetItem } from "@/lib/types";

export function BudgetItemRow({
  item, currency, gbpRate, onRemove,
}: {
  item: BudgetItem;
  currency: string;
  gbpRate: number;
  onRemove: () => void;
}) {
  return (
    <div className="group flex items-center justify-between text-xs text-ink-700 px-2 py-1 rounded hover:bg-white/60">
      <span className="truncate">{item.name}</span>
      <div className="flex items-center gap-2 shrink-0">
        <span className="text-ink-500">{combined(item.amount, currency, gbpRate)}</span>
        <button
          type="button"
          onClick={onRemove}
          className="text-ink-300 hover:text-rose-500 opacity-0 group-hover:opacity-100"
          aria-label={`Remove ${item.name}`}
        >
          ×
        </button>
      </div>
    </div>
  );
}
