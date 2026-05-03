import { redirect } from "next/navigation";

import { BrandMark } from "@/components/BrandMark";
import { ChatInputClient } from "@/components/ChatInputClient";
import { ProfileBanner } from "@/components/ProfileBanner";
import { TodayBanner } from "@/components/TodayBanner";
import { TripsList } from "@/components/TripsList";
import { UserMenu } from "@/components/UserMenu";
import { getProfile, listTrips } from "@/lib/api";
import { findActiveTrip } from "@/lib/active-trip";
import { getServerToken } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function Home() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/signin");

  const token = await getServerToken();
  const [trips, profile] = token
    ? await Promise.all([
        listTrips(token).catch(() => []),
        getProfile(token).catch(() => null),
      ])
    : [[], null];

  const active = findActiveTrip(trips);

  return (
    <main className="min-h-screen flex flex-col">
      <header className="px-6 py-4 flex items-center justify-between">
        <BrandMark />
        <UserMenu email={user.email ?? ""} />
      </header>

      <section className="flex-1 flex flex-col items-center justify-center gap-6 px-6 pb-12 anim-fade-in">
        <h1 className="font-display text-4xl md:text-5xl font-semibold tracking-tight text-ink-900 text-center">
          Where to next?
        </h1>
        <p className="text-ink-500 max-w-md text-center">
          Tell me about your trip in plain English — destination, days, what you love.
        </p>
        {active && <TodayBanner active={active} />}
        {profile === null && <ProfileBanner />}
        <ChatInputClient hasProfile={profile !== null} />
        <TripsList trips={trips} />
      </section>
    </main>
  );
}
