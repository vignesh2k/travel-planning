import { BrandIcon } from "@/components/BrandMark";
import { SignInButton } from "@/components/SignInButton";

const ERR_MESSAGES: Record<string, string> = {
  not_allowed: "This email isn't on the allowlist. Ask the admin to add you.",
  exchange: "Sign-in failed. Try again.",
  no_email: "We couldn't read your email from Google. Try again.",
};

const FEATURES: { icon: string; title: string; body: string }[] = [
  {
    icon: "🗺️",
    title: "Plan a trip in plain English",
    body: "Tell Atlas where and when. It writes a day-by-day itinerary with real restaurants, neighbourhoods, and photo spots — pinned on an interactive map.",
  },
  {
    icon: "💷",
    title: "Budget without the spreadsheet",
    body: "Per-day estimates in destination currency with a GBP equivalent. Tweak any day, add line items for splurges. The PDF gets a categorised cost breakdown.",
  },
  {
    icon: "📱",
    title: "Install it. Take it offline.",
    body: "Add Atlas to your home screen. Today's day pre-caches itself — itinerary, hotels, map tiles. Useful at the airport, on the plane, or underground.",
  },
  {
    icon: "🔗",
    title: "Share read-only with friends",
    body: "One click for a public link. Anyone can open it without signing in. Budget stays private. Revoke or rotate any time.",
  },
];

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <main className="min-h-screen flex flex-col">
      <header className="px-6 py-4 flex items-center">
        <div className="flex items-center gap-2">
          <BrandIcon className="w-6 h-6" />
          <span className="font-display text-sm font-semibold text-ink-900 tracking-tight">
            Atlas
          </span>
        </div>
      </header>

      {/* Hero */}
      <section className="flex flex-col items-center justify-center gap-6 px-6 pt-6 pb-16 anim-fade-in text-center">
        <BrandIcon className="w-20 h-20" />
        <h1 className="font-display text-4xl md:text-6xl font-semibold tracking-tight text-ink-900 max-w-3xl leading-[1.05]">
          Travel guides you&apos;ll <span className="text-amber-600">actually&nbsp;take</span>.
        </h1>
        <p className="text-ink-700 max-w-xl text-base md:text-lg">
          Atlas is a polished AI travel planner. Give it a few words about
          your trip; get a real, mappable, day-by-day guide back. Edit it,
          share it, take it offline.
        </p>

        <div className="flex flex-col items-center gap-3 mt-2">
          <SignInButton variant="primary" />
          {error && ERR_MESSAGES[error] && (
            <p className="text-rose-500 text-sm">{ERR_MESSAGES[error]}</p>
          )}
          <p className="text-xs text-ink-500">
            Allowlist-only for now — ask the admin if you need access.
          </p>
        </div>
      </section>

      {/* Features */}
      <section className="px-6 pb-20">
        <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-4">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="frosted rounded-[18px] p-5 flex flex-col gap-2"
            >
              <div className="text-2xl">{f.icon}</div>
              <h3 className="font-display text-lg font-semibold text-ink-900">
                {f.title}
              </h3>
              <p className="text-sm text-ink-700 leading-relaxed">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="px-6 py-4 text-center text-[11px] text-ink-500">
        Atlas — built by Vignesh.
      </footer>
    </main>
  );
}
