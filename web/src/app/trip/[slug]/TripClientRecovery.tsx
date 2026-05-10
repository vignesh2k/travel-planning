"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { BrandIcon } from "@/components/BrandMark";
import { TripWorkspace } from "@/components/TripWorkspace";
import { getBudget, getTrip } from "@/lib/api";
import { getBrowserToken } from "@/lib/auth.browser";
import type { Budget, TripFull } from "@/lib/types";

export function TripClientRecovery({
  slug,
  initialDay,
}: {
  slug: string;
  initialDay?: number;
}) {
  const router = useRouter();
  const [trip, setTrip] = useState<TripFull | null>(null);
  const [budget, setBudget] = useState<Budget | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const token = await getBrowserToken();
        if (!token) {
          router.replace("/auth/signin");
          return;
        }

        const [nextTrip, nextBudget] = await Promise.all([
          getTrip(slug, token),
          getBudget(slug, token).catch(() => null),
        ]);
        if (cancelled) return;
        setTrip(nextTrip);
        setBudget(nextBudget);
      } catch (e) {
        if (cancelled) return;
        const message = e instanceof Error ? e.message : "Could not load trip";
        setError(message);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [router, slug]);

  if (trip) {
    return (
      <main className="min-h-screen flex flex-col">
        <header className="px-4 py-3 border-b border-amber-700/10 flex items-center justify-between">
          <Link href="/" className="text-sm font-medium text-ink-900 hover:text-amber-600">
            Atlas
          </Link>
          <span className="text-sm text-ink-600 truncate max-w-[200px]">
            {trip.destination}
          </span>
        </header>
        <div className="flex-1 overflow-hidden">
          <TripWorkspace trip={trip} budget={budget} initialDay={initialDay} />
        </div>
      </main>
    );
  }

  return (
    <main
      className="min-h-screen flex flex-col items-center justify-center gap-4 px-6 text-center"
      style={{ background: "var(--color-paper-cream)" }}
    >
      <BrandIcon className="w-10 h-10" />
      <h1 className="font-display text-2xl font-semibold text-ink-900">
        Loading trip...
      </h1>
      <p className="max-w-sm text-sm leading-6 text-ink-500">
        {error ?? "Reconnecting with your browser session."}
      </p>
      {error && (
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="rounded-[10px] bg-ink-900 px-4 py-2 text-sm font-semibold text-white hover:bg-ink-800"
        >
          Reload
        </button>
      )}
    </main>
  );
}
