import Link from "next/link";
import { redirect } from "next/navigation";

import { BrandIcon, BrandMark } from "@/components/BrandMark";
import { listTrips } from "@/lib/api";
import { findActiveTrip } from "@/lib/active-trip";
import { getServerToken } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function TodayPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/signin");

  const token = await getServerToken();
  const trips = token ? await listTrips(token).catch(() => []) : [];
  const active = findActiveTrip(trips);

  if (active) {
    redirect(`/trip/${active.trip.slug}?day=${active.dayNumber}`);
  }

  return (
    <main className="min-h-screen flex flex-col">
      <header className="px-6 py-4 flex items-center justify-between">
        <Link href="/" className="contents"><BrandMark /></Link>
      </header>
      <section className="flex-1 flex flex-col items-center justify-center gap-4 px-6 pb-12 anim-fade-in text-center">
        <BrandIcon className="w-12 h-12" />
        <h1 className="font-display text-3xl font-semibold text-ink-900">
          Nothing scheduled today
        </h1>
        <p className="text-sm text-ink-500 max-w-sm">
          When you have an active trip — start date set and today falls
          within the trip — it&apos;ll open here directly.
        </p>
        <Link
          href="/"
          className="rounded-[10px] bg-gradient-to-br from-amber-400 to-amber-600 text-white text-sm py-2 px-5 font-medium hover:shadow-md mt-2"
        >
          Plan a trip →
        </Link>
      </section>
    </main>
  );
}
