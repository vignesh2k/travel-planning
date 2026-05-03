"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { getBudget, regenerateBudget, updateBudgetDay } from "./api";
import { getBrowserToken } from "./auth.browser";
import type { Budget, BudgetDay, BudgetItem } from "./types";

const DEBOUNCE_MS = 800;

export function useBudget(slug: string, initial: Budget | null) {
  const [budget, setBudget] = useState<Budget | null>(initial);
  const [error, setError] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<"idle" | "regenerating">("idle");

  const debounceRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const flushDay = useCallback(
    async (dayNumber: number, dayState: BudgetDay) => {
      try {
        const token = await getBrowserToken();
        if (!token) return;
        await updateBudgetDay(
          slug, dayNumber,
          { override: dayState.override, items: dayState.items },
          token,
        );
      } catch (e) {
        console.error("updateBudgetDay failed", e);
        setError("Save failed. Refresh and try again.");
      }
    },
    [slug],
  );

  const setDay = useCallback(
    (dayNumber: number, partial: Partial<Pick<BudgetDay, "override" | "items">>) => {
      setBudget((prev) => {
        if (!prev) return prev;
        const next = {
          ...prev,
          days: prev.days.map((d) =>
            d.number === dayNumber ? { ...d, ...partial } : d,
          ),
        };

        const existing = debounceRef.current.get(dayNumber);
        if (existing) clearTimeout(existing);
        const updated = next.days.find((d) => d.number === dayNumber);
        if (updated) {
          const t = setTimeout(() => flushDay(dayNumber, updated), DEBOUNCE_MS);
          debounceRef.current.set(dayNumber, t);
        }

        return next;
      });
    },
    [flushDay],
  );

  const addItem = useCallback(
    (dayNumber: number, item: BudgetItem) => {
      const day = budget?.days.find((d) => d.number === dayNumber);
      if (!day) return;
      setDay(dayNumber, { items: [...day.items, item] });
    },
    [budget, setDay],
  );

  const removeItem = useCallback(
    (dayNumber: number, idx: number) => {
      const day = budget?.days.find((d) => d.number === dayNumber);
      if (!day) return;
      setDay(dayNumber, { items: day.items.filter((_, i) => i !== idx) });
    },
    [budget, setDay],
  );

  const regenerate = useCallback(async () => {
    setBusyAction("regenerating");
    setError(null);
    try {
      const token = await getBrowserToken();
      if (!token) return;
      const fresh = await regenerateBudget(slug, token);
      setBudget(fresh);
    } catch (e) {
      console.error("regenerate failed", e);
      setError("Could not refresh estimates. Please try again.");
    } finally {
      setBusyAction("idle");
    }
  }, [slug]);

  useEffect(() => {
    if (budget !== null) return;
    let cancelled = false;
    (async () => {
      const token = await getBrowserToken();
      if (!token) return;
      const fetched = await getBudget(slug, token).catch(() => null);
      if (!cancelled && fetched) setBudget(fetched);
    })();
    return () => { cancelled = true; };
  }, [budget, slug]);

  useEffect(() => {
    const debounces = debounceRef.current;
    return () => {
      debounces.forEach((t) => clearTimeout(t));
    };
  }, []);

  return { budget, error, busyAction, setDay, addItem, removeItem, regenerate };
}
