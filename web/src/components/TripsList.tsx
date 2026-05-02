"use client";

import Link from "next/link";
import { useState } from "react";

import { deleteTrip } from "@/lib/api";
import { getBrowserToken } from "@/lib/auth.browser";
import type { TripSummary } from "@/lib/types";

export function TripsList({ trips: initial }: { trips: TripSummary[] }) {
  const [trips, setTrips] = useState(initial);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);

  if (trips.length === 0) return null;

  async function doDelete(slug: string) {
    setPendingDelete(slug);
    try {
      const token = await getBrowserToken();
      if (!token) return;
      await deleteTrip(slug, token);
      setTrips((prev) => prev.filter((t) => t.slug !== slug));
      setConfirming(null);
    } catch (e) {
      console.error("delete failed", e);
    } finally {
      setPendingDelete(null);
    }
  }

  return (
    <div className="frosted rounded-[18px] p-3 w-full max-w-xl">
      <div className="text-[11px] uppercase tracking-wider text-ink-500 mb-2">
        Recent trips
      </div>
      <ul className="flex flex-col gap-1">
        {trips.map((t) => {
          const isConfirming = confirming === t.slug;
          const isDeleting = pendingDelete === t.slug;
          return (
            <li key={t.id} className="group">
              <div className="flex items-center px-2 py-1.5 rounded-md hover:bg-white/70 gap-2">
                <Link
                  href={`/trip/${t.slug}`}
                  className="flex-1 flex justify-between items-center min-w-0"
                >
                  <span className="text-sm text-ink-900 truncate">{t.destination}</span>
                  <span className="text-xs text-ink-500 ml-2 shrink-0">{t.days} days</span>
                </Link>

                {!isConfirming && (
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      setConfirming(t.slug);
                    }}
                    className="text-ink-300 hover:text-rose-500 text-sm w-6 h-6 flex items-center justify-center rounded opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Delete trip"
                    aria-label={`Delete ${t.destination}`}
                  >
                    ×
                  </button>
                )}
                {isConfirming && (
                  <div className="flex items-center gap-1.5 text-[11px]">
                    <span className="text-ink-500">Delete?</span>
                    <button
                      onClick={() => doDelete(t.slug)}
                      disabled={isDeleting}
                      className="text-rose-500 font-semibold hover:text-rose-700 disabled:opacity-50"
                    >
                      {isDeleting ? "…" : "Yes"}
                    </button>
                    <button
                      onClick={() => setConfirming(null)}
                      disabled={isDeleting}
                      className="text-ink-500 hover:text-ink-900 disabled:opacity-50"
                    >
                      No
                    </button>
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
