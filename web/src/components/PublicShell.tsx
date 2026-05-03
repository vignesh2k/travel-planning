import Link from "next/link";

import { BrandMark } from "./BrandMark";

export function PublicShell({
  children, title, subtitle,
}: {
  children: React.ReactNode;
  title: string;
  subtitle?: string;
}) {
  return (
    <main className="relative h-dvh w-screen overflow-hidden">
      {children}
      <header className="absolute top-0 inset-x-0 px-6 py-3 flex items-center justify-between backdrop-blur-md bg-cream-50/40 z-20 anim-slide-up">
        <Link href="/" className="contents"><BrandMark /></Link>
        <div className="text-sm text-ink-700 font-medium">
          {title}
          {subtitle && <span className="text-ink-500"> · {subtitle}</span>}
        </div>
        <Link
          href="/"
          className="text-xs text-ink-500 hover:text-ink-900"
        >
          Plan your own →
        </Link>
      </header>
    </main>
  );
}
