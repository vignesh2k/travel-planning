import { redirect } from "next/navigation";

import { ActiveTripPrecache } from "@/components/ActiveTripPrecache";
import { AtlasNav } from "@/components/atlas/AtlasNav";
import { CompassMark } from "@/components/atlas/CompassMark";
import { Contours } from "@/components/atlas/Contours";
import { GraticuleBg } from "@/components/atlas/GraticuleBg";
import { Logbook } from "@/components/atlas/Logbook";
import { PinInput } from "@/components/atlas/PinInput";
import { SideRail } from "@/components/atlas/SideRail";
import { WanderingStrokes } from "@/components/atlas/WanderingStrokes";
import { listTrips } from "@/lib/api";
import { findActiveTrip } from "@/lib/active-trip";
import { getServerToken } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function Home() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/signin");

  const token = await getServerToken();
  const trips = token ? await listTrips(token).catch(() => []) : [];
  const active = findActiveTrip(trips);

  const hasLogbook = trips.length > 0;

  return (
    <main
      className="relative min-h-screen overflow-hidden"
      style={{ background: "var(--color-paper-cream)" }}
    >
      {/* Layered ornaments — graticule, wandering strokes, contour clusters.
          Each gets a slow, low-amplitude drift so the page breathes; three
          different durations avoid synchronised motion. */}
      <GraticuleBg opacity={0.05} />
      <WanderingStrokes className="atlas-drift-b" />
      <Contours opacity={0.1} cx={18} cy={28} count={8} seed={1} className="atlas-drift-a" />
      <Contours opacity={0.09} cx={88} cy={70} count={9} seed={4} className="atlas-drift-c" />
      <Contours opacity={0.07} cx={70} cy={20} count={6} seed={7} className="atlas-drift-b" />

      {/* Decorative ornaments */}
      <CompassMark />
      <SideRail />

      {/* Top nav */}
      <AtlasNav email={user.email ?? ""} />

      {/* Centered hero — flex centering is reliable across breakpoints. */}
      <div
        className="relative z-10 min-h-screen flex items-center justify-center px-6"
        style={{ paddingBottom: hasLogbook ? 180 : 80 }}
      >
        <section className="w-full max-w-[700px] text-center">
          <div
            className="atlas-rise atlas-rise-1"
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 10.5,
              letterSpacing: "0.22em",
              textTransform: "uppercase",
              color: active
                ? "var(--color-terracotta-500)"
                : "var(--color-paper-ink-3)",
              marginBottom: 22,
            }}
          >
            {active
              ? `✦   Today · Day ${active.dayNumber} of ${active.totalDays} · ${active.trip.destination}   ✦`
              : "✦   Drop a pin anywhere   ✦"}
          </div>

          <h1
            style={{
              fontFamily: "var(--font-serif)",
              fontWeight: 400,
              letterSpacing: "-0.03em",
              lineHeight: 0.92,
              margin: 0,
              color: "var(--color-paper-ink)",
            }}
            className="text-5xl sm:text-6xl md:text-8xl lg:text-[100px] atlas-rise atlas-rise-2"
          >
            Where to <em style={{ fontStyle: "italic" }}>next</em>?
          </h1>

          <div className="atlas-rise atlas-rise-3">
            <PinInput />
          </div>
        </section>
      </div>

      {/* Bottom logbook strip — absolute so it doesn't affect centering. */}
      <Logbook trips={trips} />

      {/* When an active trip exists, kick the SW pre-cache. */}
      {active && <ActiveTripPrecache slug={active.trip.slug} />}
    </main>
  );
}
