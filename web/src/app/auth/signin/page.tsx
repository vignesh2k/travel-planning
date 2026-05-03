import Link from "next/link";

import { BrandIcon } from "@/components/BrandMark";
import { CompassMark } from "@/components/atlas/CompassMark";
import { Contours } from "@/components/atlas/Contours";
import { GraticuleBg } from "@/components/atlas/GraticuleBg";
import { SideRail } from "@/components/atlas/SideRail";
import { WanderingStrokes } from "@/components/atlas/WanderingStrokes";
import { SignInButton } from "@/components/SignInButton";

const ERR_MESSAGES: Record<string, string> = {
  not_allowed: "This email isn't on the allowlist. Ask the admin to add you.",
  exchange: "Sign-in failed. Try again.",
  no_email: "We couldn't read your email from Google. Try again.",
};

const FEATURES: { coord: string; title: string; body: string }[] = [
  {
    coord: "01°",
    title: "Plain English in",
    body: "Tell Atlas where and when. It writes a day-by-day itinerary with real restaurants, neighbourhoods, and photo spots — pinned on an interactive map.",
  },
  {
    coord: "02°",
    title: "Budget-aware",
    body: "Per-day estimates in destination currency with a GBP equivalent. Adjust any day, add line items for splurges. The PDF gets a categorised cost breakdown.",
  },
  {
    coord: "03°",
    title: "Offline-ready",
    body: "Add Atlas to your home screen. Today's day pre-caches itself — itinerary, hotels, map tiles. Useful at the airport, on the plane, underground.",
  },
  {
    coord: "04°",
    title: "Share with friends",
    body: "One click for a public link. Anyone can open it without an account. Budget stays private. Revoke or rotate any time.",
  },
];

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <main
      className="relative min-h-screen overflow-hidden"
      style={{ background: "var(--color-paper-cream)" }}
    >
      {/* Ornaments — graticule, wandering strokes, contour clusters,
          all drifting on independent slow cycles. */}
      <GraticuleBg opacity={0.05} />
      <WanderingStrokes className="atlas-drift-b" />
      <Contours opacity={0.1} cx={18} cy={28} count={8} seed={1} className="atlas-drift-a" />
      <Contours opacity={0.09} cx={88} cy={70} count={9} seed={4} className="atlas-drift-c" />
      <Contours opacity={0.07} cx={70} cy={20} count={6} seed={7} className="atlas-drift-b" />
      <CompassMark />
      <SideRail />

      {/* Brand-only nav */}
      <nav
        className="absolute top-0 inset-x-0 z-20 flex items-center"
        style={{ padding: "22px 32px" }}
      >
        <Link href="/" className="flex items-center gap-[10px]">
          <BrandIcon className="w-[22px] h-[22px]" />
          <span
            style={{
              fontFamily: "var(--font-sans)",
              fontWeight: 600,
              fontSize: 15,
              letterSpacing: "-0.01em",
              color: "var(--color-paper-ink)",
            }}
          >
            Atlas
          </span>
        </Link>
      </nav>

      {/* Hero — first viewport */}
      <section className="relative z-10 min-h-screen flex items-center justify-center px-6 pointer-events-none">
        <div className="w-full max-w-[760px] text-center pointer-events-auto">
          <div
            className="atlas-rise atlas-rise-1"
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 10.5,
              letterSpacing: "0.22em",
              textTransform: "uppercase",
              color: "var(--color-paper-ink-3)",
              marginBottom: 22,
            }}
          >
            ✦   Welcome aboard   ✦
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
            className="text-5xl sm:text-6xl md:text-7xl lg:text-[88px] atlas-rise atlas-rise-2"
          >
            Travel guides you&apos;ll{" "}
            <em style={{ fontStyle: "italic" }}>actually take</em>.
          </h1>

          <p
            className="atlas-rise atlas-rise-3"
            style={{
              marginTop: 28,
              fontFamily: "var(--font-sans)",
              fontSize: 16,
              lineHeight: 1.55,
              color: "var(--color-paper-ink-2)",
              maxWidth: 540,
              marginInline: "auto",
            }}
          >
            Atlas is a polished AI travel planner. Give it a few words about
            your trip; get a real, mappable, day-by-day guide back. Edit it,
            share it, take it offline.
          </p>

          <div
            className="atlas-rise atlas-rise-4 flex flex-col items-center"
            style={{ marginTop: 32, gap: 12 }}
          >
            <SignInButton variant="primary" />
            {error && ERR_MESSAGES[error] && (
              <p
                className="text-sm"
                style={{ color: "var(--color-rose-500)" }}
              >
                {ERR_MESSAGES[error]}
              </p>
            )}
            <p
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 10.5,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                color: "var(--color-paper-ink-4)",
              }}
            >
              Allowlist · ask the admin if you need access
            </p>
          </div>
        </div>
      </section>

      {/* Feature legend — second section, scrolls into view */}
      <section className="relative z-10 px-6 pb-20">
        <div className="max-w-5xl mx-auto">
          <div
            className="flex justify-between items-baseline"
            style={{ marginBottom: 18 }}
          >
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                color: "var(--color-paper-ink-3)",
              }}
            >
              Legend · what&apos;s in the box
            </div>
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                letterSpacing: "0.08em",
                color: "var(--color-paper-ink-4)",
              }}
            >
              4 sections
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-10 gap-y-7">
            {FEATURES.map((f) => (
              <div
                key={f.title}
                className="pl-4"
                style={{ borderLeft: "1px solid rgba(31,26,20,0.12)" }}
              >
                <div
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 10,
                    letterSpacing: "0.06em",
                    color: "var(--color-paper-ink-4)",
                    padding: "2px 6px",
                    background: "var(--color-paper-cream-2)",
                    borderRadius: 999,
                    display: "inline-block",
                    marginBottom: 8,
                  }}
                >
                  {f.coord}
                </div>
                <h3
                  style={{
                    fontFamily: "var(--font-serif)",
                    fontWeight: 400,
                    fontSize: 24,
                    lineHeight: 1.1,
                    color: "var(--color-paper-ink)",
                    marginBottom: 6,
                  }}
                >
                  {f.title}
                </h3>
                <p
                  style={{
                    fontFamily: "var(--font-sans)",
                    fontSize: 13.5,
                    lineHeight: 1.5,
                    color: "var(--color-paper-ink-2)",
                  }}
                >
                  {f.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer
        className="relative z-10 text-center pb-6"
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          color: "var(--color-paper-ink-4)",
        }}
      >
        Atlas · 38.7223° N · 9.1393° W
      </footer>
    </main>
  );
}
