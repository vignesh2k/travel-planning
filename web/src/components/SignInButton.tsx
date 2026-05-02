"use client";

import { createClient } from "@/lib/supabase/client";

export function SignInButton() {
  const supabase = createClient();
  return (
    <button
      onClick={async () => {
        await supabase.auth.signInWithOAuth({
          provider: "google",
          options: { redirectTo: `${window.location.origin}/auth/callback` },
        });
      }}
      className="frosted-strong rounded-[10px] px-4 py-2 text-sm font-medium text-ink-900 hover:bg-white/95"
    >
      Sign in with Google
    </button>
  );
}
