import Link from "next/link";

import { TripWorkspace } from "@/components/TripWorkspace";
import { getTrip } from "@/lib/api";
import type { TripFull } from "@/lib/types";

export default async function SharedTripPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ day?: string }>;
}) {
  const { token } = await params;
  const { day } = await searchParams;

  let trip: TripFull;
  try {
    trip = await getTrip(token, token);
  } catch {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center text-center px-6">
        <h1 className="text-2xl font-medium text-ink-900">Shared plan not found</h1>
        <p className="text-sm text-ink-600 mt-2">This link may have expired.</p>
        <Link href="/" className="text-sm text-amber-600 hover:underline mt-4">
          ← Back to Atlas
        </Link>
      </main>
    );
  }

  const initialDay = day ? parseInt(day, 10) : undefined;

  return (
    <main className="min-h-screen flex flex-col">
      <header className="px-4 py-3 border-b border-amber-700/10 flex items-center justify-between">
        <Link href="/" className="text-sm font-medium text-ink-900 hover:text-amber-600">
          ← Atlas
        </Link>
        <span className="text-sm text-ink-600 truncate max-w-[200px]">
          {trip.destination}
        </span>
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 border border-amber-200">
          Shared
        </span>
      </header>
      <div className="flex-1 overflow-hidden">
        <TripWorkspace
          trip={trip}
          budget={null}
          initialDay={initialDay}
          readOnly
        />
      </div>
    </main>
  );
}
