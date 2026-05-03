"use client";

import { useState } from "react";

import { BudgetItemRow } from "./BudgetItemRow";
import { combined, dayTotal, formatGbp, formatLocal } from "@/lib/currency";
import type { BudgetDay } from "@/lib/types";

export function BudgetDayRow({
  day, currency, gbpRate,
  onOverride, onAddItem, onRemoveItem,
}: {
  day: BudgetDay;
  currency: string;
  gbpRate: number;
  onOverride: (value: number | null) => void;
  onAddItem: (item: { name: string; amount: number }) => void;
  onRemoveItem: (idx: number) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [showBreakdown, setShowBreakdown] = useState(false);

  const total = dayTotal(day);
  const baseValue = day.override ?? day.estimated;
  const breakdown = day.breakdown ?? [];
  const hasBreakdown = breakdown.length > 0;

  function submitItem() {
    const value = Number(amount);
    if (!name.trim() || !Number.isFinite(value) || value < 0) return;
    onAddItem({ name: name.trim(), amount: Math.round(value) });
    setName("");
    setAmount("");
    setAdding(false);
  }

  return (
    <div id={`budget-day-${day.number}`} className="frosted rounded-[14px] p-4 flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs uppercase tracking-wider text-amber-700">Day {day.number}</div>
          <div className="text-sm font-semibold text-ink-900 truncate">{day.title}</div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-xs text-ink-500">Total</div>
          <div className="text-sm font-semibold text-ink-900">
            {combined(total, currency, gbpRate)}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 text-xs flex-wrap">
        <span className="text-ink-500">Estimate:</span>
        <input
          type="number"
          inputMode="numeric"
          min={0}
          value={baseValue}
          onChange={(e) => {
            const v = e.target.value === ""
              ? null
              : Math.max(0, Math.round(Number(e.target.value)));
            onOverride(v);
          }}
          className="w-28 rounded-[8px] bg-white/80 border border-amber-700/12 px-2 py-1 text-sm text-ink-900 outline-none focus:border-amber-600/40"
        />
        <span className="text-ink-500">{currency}</span>
        <span className="text-ink-300">·</span>
        <span className="text-ink-500">≈ {formatGbp(Math.round(baseValue * gbpRate))}</span>
        {day.override !== null && day.override !== day.estimated && (
          <button
            type="button"
            onClick={() => onOverride(null)}
            className="text-ink-500 hover:text-ink-900 underline ml-2"
            title="Reset to AI estimate"
          >
            reset
          </button>
        )}
      </div>

      {hasBreakdown && (
        <div className="flex flex-col gap-1">
          <button
            type="button"
            onClick={() => setShowBreakdown((v) => !v)}
            className="self-start text-[11px] text-ink-500 hover:text-ink-900 inline-flex items-center gap-1"
            aria-expanded={showBreakdown}
          >
            <span
              className="inline-block transition-transform"
              style={{
                transform: showBreakdown ? "rotate(90deg)" : "rotate(0deg)",
              }}
              aria-hidden="true"
            >
              ›
            </span>
            {showBreakdown ? "Hide breakdown" : "Where the estimate goes"}
          </button>
          {showBreakdown && (
            <div
              className="flex flex-col gap-0.5 pl-3 ml-1"
              style={{ borderLeft: "1px solid rgba(168, 95, 37, 0.15)" }}
            >
              {breakdown.map((b, i) => (
                <div
                  key={`${b.label}-${i}`}
                  className="flex items-baseline justify-between text-[11px]"
                >
                  <span className="text-ink-700 truncate">{b.label}</span>
                  <span className="text-ink-500 tabular-nums shrink-0 ml-2">
                    {formatLocal(b.amount, currency)}
                    <span className="text-ink-300">
                      {" · "}
                      {formatGbp(Math.round(b.amount * gbpRate))}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {day.items.length > 0 && (
        <div className="flex flex-col">
          {day.items.map((it, i) => (
            <BudgetItemRow
              key={`${it.name}-${i}`}
              item={it}
              currency={currency}
              gbpRate={gbpRate}
              onRemove={() => onRemoveItem(i)}
            />
          ))}
        </div>
      )}

      {adding ? (
        <div className="flex items-center gap-2 text-xs">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Cooking class"
            className="flex-1 rounded-[8px] bg-white/80 border border-amber-700/12 px-2 py-1 text-sm text-ink-900 outline-none focus:border-amber-600/40"
            autoFocus
          />
          <input
            type="number"
            inputMode="numeric"
            min={0}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="4500"
            className="w-24 rounded-[8px] bg-white/80 border border-amber-700/12 px-2 py-1 text-sm text-ink-900 outline-none focus:border-amber-600/40"
            onKeyDown={(e) => { if (e.key === "Enter") submitItem(); }}
          />
          <button
            type="button"
            onClick={submitItem}
            className="rounded-[8px] bg-amber-600 text-white px-3 py-1 text-xs font-semibold hover:bg-amber-700"
          >
            Add
          </button>
          <button
            type="button"
            onClick={() => { setAdding(false); setName(""); setAmount(""); }}
            className="text-ink-500 hover:text-ink-900 text-xs"
          >
            cancel
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="text-xs text-amber-700 hover:text-amber-900 self-start"
        >
          + Add item
        </button>
      )}
    </div>
  );
}
