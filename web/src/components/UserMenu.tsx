"use client";

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
    <div className="flex items-center gap-3">
      <span className="text-xs text-ink-500">{email}</span>
      <button
        onClick={signOut}
        disabled={busy}
        className="text-xs text-ink-500 hover:text-ink-900 disabled:opacity-60"
      >
        {busy ? "…" : "Log out"}
      </button>
    </div>
  );
}
