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
    <TripWorkspace
      trip={trip}
      budget={null}
      initialDay={initialDay}
      readOnly
    />
  );
}
