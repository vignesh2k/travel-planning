import Link from "next/link";

import { BrandIcon } from "@/components/BrandMark";
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
      <main className="min-h-screen flex flex-col items-center justify-center gap-4 bg-[var(--color-paper-cream)] px-6 text-center">
        <BrandIcon className="h-12 w-12" />
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink-900">Shared plan not found</h1>
          <p className="mt-2 max-w-sm text-sm leading-6 text-ink-500">This link may have expired.</p>
        </div>
        <Link href="/" className="rounded-[10px] bg-ink-900 px-4 py-2 text-sm font-semibold text-white hover:bg-ink-800">
          Back to Atlas
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
