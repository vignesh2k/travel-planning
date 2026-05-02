import Link from "next/link";

import type { TripSummary } from "@/lib/types";

export function TripsList({ trips }: { trips: TripSummary[] }) {
  if (trips.length === 0) return null;
  return (
    <div className="frosted rounded-[18px] p-3 w-full max-w-xl">
      <div className="text-[11px] uppercase tracking-wider text-ink-500 mb-2">
        Recent trips
      </div>
      <ul className="flex flex-col gap-1">
        {trips.map((t) => (
          <li key={t.id}>
            <Link
              href={`/trip/${t.slug}`}
              className="flex justify-between items-center px-2 py-1.5 rounded-md hover:bg-white/70"
            >
              <span className="text-sm text-ink-900">{t.destination}</span>
              <span className="text-xs text-ink-500">{t.days} days</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
