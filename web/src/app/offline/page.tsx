import Link from "next/link";

import { BrandIcon, BrandMark } from "@/components/BrandMark";

export default function OfflinePage() {
  return (
    <main className="min-h-screen flex flex-col">
      <header className="px-6 py-4 flex items-center justify-between">
        <Link href="/" className="contents"><BrandMark /></Link>
      </header>
      <section className="flex-1 flex flex-col items-center justify-center gap-4 px-6 pb-12 text-center">
        <BrandIcon className="w-12 h-12" />
        <h1 className="font-display text-2xl font-semibold text-ink-900">
          You&apos;re offline
        </h1>
        <p className="text-sm text-ink-500 max-w-sm">
          Trips you&apos;ve opened recently are still readable. Try heading
          back home.
        </p>
        <Link
          href="/"
          className="rounded-[10px] bg-gradient-to-br from-amber-400 to-amber-600 text-white text-sm py-2 px-5 font-medium hover:shadow-md mt-2"
        >
          Home
        </Link>
      </section>
    </main>
  );
}
