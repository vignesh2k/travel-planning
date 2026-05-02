import { redirect } from "next/navigation";

import { BrandMark } from "@/components/BrandMark";
import { ChatInputClient } from "@/components/ChatInputClient";
import { SuggestionChipsClient } from "@/components/SuggestionChipsClient";
import { TripsList } from "@/components/TripsList";
import { listTrips } from "@/lib/api";
import { getServerToken } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function Home() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/signin");

  const token = await getServerToken();
  const trips = token ? await listTrips(token).catch(() => []) : [];

  return (
    <main className="min-h-screen flex flex-col">
      <header className="px-6 py-4 flex items-center justify-between">
        <BrandMark />
        <div className="text-xs text-ink-500">
          {user.email}
        </div>
      </header>

      <section className="flex-1 flex flex-col items-center justify-center gap-6 px-6 pb-12">
        <h1 className="font-display text-4xl md:text-5xl font-semibold tracking-tight text-ink-900 text-center">
          Where to next?
        </h1>
        <p className="text-ink-500 max-w-md text-center">
          Tell me about your trip in plain English — destination, days, what you love.
        </p>
        <ChatInputClient />
        <SuggestionChipsClient />
        <TripsList trips={trips} />
      </section>
    </main>
  );
}
