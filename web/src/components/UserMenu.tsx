"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { createClient } from "@/lib/supabase/client";

export function UserMenu({ email }: { email: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function signOut() {
    if (busy) return;
    setBusy(true);
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
      router.replace("/auth/signin");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-w-0 items-center gap-2 sm:gap-3">
      <span className="hidden max-w-[180px] truncate text-xs text-ink-500 sm:inline">
        {email}
      </span>
      <Link
        href="/profile"
        className="shrink-0 text-xs text-ink-500 hover:text-ink-900"
      >
        Preferences
      </Link>
      <button
        onClick={signOut}
        disabled={busy}
        className="shrink-0 text-xs text-ink-500 hover:text-ink-900 disabled:opacity-60"
      >
        {busy ? "…" : "Log out"}
      </button>
    </div>
  );
}
