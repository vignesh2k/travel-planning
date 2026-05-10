import Link from "next/link";

import { TripWorkspace } from "@/components/TripWorkspace";
import { ApiRequestError, getBudget, getTrip } from "@/lib/api";
import { getServerToken } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { shouldTryBrowserSessionLoad, shouldTryBrowserTripLoad } from "@/lib/trip-page-errors";

import { TripClientRecovery } from "./TripClientRecovery";

function TripNotFound() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center text-center px-6">
      <h1 className="text-2xl font-medium text-ink-900">Trip not found</h1>
      <Link href="/" className="text-sm text-amber-600 hover:underline mt-4">
        Back to Atlas
      </Link>
    </main>
  );
}

export default async function TripPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ day?: string }>;
}) {
  const { slug } = await params;
  const { day } = await searchParams;
  const initialDay = day ? parseInt(day, 10) : undefined;

  let hasServerUser = false;
  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    hasServerUser = Boolean(data.user);
  } catch (error) {
    if (shouldTryBrowserSessionLoad(error)) {
      return <TripClientRecovery slug={slug} initialDay={initialDay} />;
    }
    throw error;
  }
  if (!hasServerUser) return <TripClientRecovery slug={slug} initialDay={initialDay} />;

  let token: string | null = null;
  try {
    token = await getServerToken();
  } catch (error) {
    if (shouldTryBrowserSessionLoad(error)) {
      return <TripClientRecovery slug={slug} initialDay={initialDay} />;
    }
    throw error;
  }
  if (!token) return <TripClientRecovery slug={slug} initialDay={initialDay} />;

  const [tripResult, budget] = await Promise.all([
    getTrip(slug, token).then((trip) => ({ trip, error: null as unknown })).catch((error) => {
      if (error instanceof ApiRequestError && error.status === 404) return { trip: null, error };
      if (shouldTryBrowserTripLoad(error)) return { trip: null, error };
      throw error;
    }),
    getBudget(slug, token).catch(() => null),
  ]);
  const trip = tripResult?.trip ?? null;
  const tripLoadError = tripResult?.error ?? null;

  if (!trip) {
    if (shouldTryBrowserTripLoad(tripLoadError)) {
      return <TripClientRecovery slug={slug} initialDay={initialDay} />;
    }
    return <TripNotFound />;
  }

  return (
    <TripWorkspace
      trip={trip}
      budget={budget}
      initialDay={initialDay}
    />
  );
}
