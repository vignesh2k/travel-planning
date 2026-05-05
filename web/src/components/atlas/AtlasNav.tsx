"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { BrandIcon } from "@/components/BrandMark";

export function AtlasNav({ email }: { email: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function signOut() {
    if (busy) return;
    setBusy(true);
    try {
      const { createClient } = await import("@/lib/supabase/client");
      const supabase = createClient();
      await supabase.auth.signOut();
      router.replace("/auth/signin");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <nav
      className="absolute top-0 inset-x-0 z-20 flex items-center justify-between"
      style={{ padding: "22px 32px" }}
    >
      <Link href="/" className="flex items-center gap-[10px] group">
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
      <div
        className="flex items-center"
        style={{ gap: 22, fontSize: 13, color: "var(--color-paper-ink-3)" }}
      >
        <span className="hidden md:inline" aria-label="Signed in as">
          {email}
        </span>
        <Link
          href="/profile"
          style={{ color: "var(--color-terracotta-500)" }}
          className="hover:text-[var(--color-paper-ink)] transition-colors"
        >
          Preferences
        </Link>
        <button
          type="button"
          onClick={signOut}
          disabled={busy}
          style={{ color: "var(--color-terracotta-500)" }}
          className="hover:text-[var(--color-paper-ink)] disabled:opacity-50 transition-colors"
        >
          {busy ? "…" : "Log out"}
        </button>
      </div>
    </nav>
  );
}
