"use client";

import { BudgetDayRow } from "./BudgetDayRow";
import { useBudget } from "@/lib/budget";
import { combined } from "@/lib/currency";
import type { Budget } from "@/lib/types";

export function BudgetTab({ slug, initial }: { slug: string; initial: Budget | null }) {
  const {
    budget, error, busyAction, setDay, addItem, removeItem, regenerate,
  } = useBudget(slug, initial);

  if (!budget) {
    return (
      <div className="frosted-strong rounded-[18px] p-6 text-center flex flex-col items-center gap-3">
        <p className="text-sm text-ink-700">No budget estimate yet.</p>
        <button
          type="button"
          onClick={regenerate}
          disabled={busyAction === "regenerating"}
          className="rounded-[10px] bg-gradient-to-br from-amber-400 to-amber-600 text-white text-sm py-2 px-5 font-medium hover:shadow-md disabled:opacity-50"
        >
          {busyAction === "regenerating" ? "Generating…" : "Generate budget"}
        </button>
        {error && <span className="text-xs text-rose-600">{error}</span>}
      </div>
    );
  }

  const tripTotal = budget.days.reduce(
    (sum, d) =>
      sum
      + (d.override ?? d.estimated)
      + d.items.reduce((s, it) => s + it.amount, 0),
    0,
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="frosted-strong rounded-[18px] p-5 flex items-baseline justify-between">
        <div>
          <div className="text-xs uppercase tracking-wider text-amber-700">Trip total</div>
          <div className="font-display text-2xl font-semibold text-ink-900">
            {combined(tripTotal, budget.currency, budget.gbp_rate)}
          </div>
        </div>
        <button
          type="button"
          onClick={regenerate}
          disabled={busyAction === "regenerating"}
          className="text-xs text-ink-500 hover:text-ink-900 disabled:opacity-50"
        >
          {busyAction === "regenerating" ? "Refreshing…" : "Refresh estimates"}
        </button>
      </div>

      {budget.days.map((d) => (
        <BudgetDayRow
          key={d.number}
          day={d}
          currency={budget.currency}
          gbpRate={budget.gbp_rate}
          onOverride={(value) => setDay(d.number, { override: value })}
          onAddItem={(item) => addItem(d.number, item)}
          onRemoveItem={(idx) => removeItem(d.number, idx)}
        />
      ))}

      <div className="text-[11px] text-ink-500 text-center">
        FX rate snapshotted {budget.gbp_rate_date}.
      </div>

      {error && <div className="text-xs text-rose-600 text-center">{error}</div>}
    </div>
  );
}
