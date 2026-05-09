import Link from "next/link";
import { redirect } from "next/navigation";

import { TripPanel } from "@/components/TripPanel";
import { createClient } from "@/lib/supabase/server";
import { getServerToken } from "@/lib/auth";
import { getTrip } from "@/lib/api";
import type { TripFull } from "@/lib/types";

export default async function TripPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ day?: string }>;
}) {
  const { slug } = await params;
  const { day } = await searchParams;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/signin");

  const token = await getServerToken();
  if (!token) redirect("/auth/signin");

  let trip: TripFull;
  try {
    trip = await getTrip(slug, token);
  } catch {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center text-center px-6">
        <h1 className="text-2xl font-medium text-ink-900">Trip not found</h1>
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
      </header>
      <div className="flex-1 overflow-hidden">
        <TripPanel
          trip={trip}
          budget={null}
          initialDay={initialDay}
          onFocusPlaces={() => {}}
          onRefinePrefill={() => {}}
        />
      </div>
    </main>
  );
}
