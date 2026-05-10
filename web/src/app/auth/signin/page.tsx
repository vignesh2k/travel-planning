"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { BrandIcon } from "@/components/BrandMark";
import { createClient } from "@/lib/supabase/client";

function GoogleG({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 18 18" className={className} aria-hidden="true">
      <path
        fill="#4285F4"
        d="M17.64 9.2a10.341 10.341 0 0 0-.164-1.841H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"
      />
    </svg>
  );
}

export default function SignInPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    // If already signed in, redirect home
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) router.replace("/");
      setChecking(false);
    });
  }, [router]);

  async function signIn() {
    setLoading(true);
    try {
      const supabase = createClient();
      await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${window.location.origin}/auth/callback` },
      });
    } catch {
      setLoading(false);
    }
  }

  if (checking) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[var(--color-paper-cream)] px-6 text-center">
        <div className="flex flex-col items-center gap-3">
          <BrandIcon className="h-10 w-10" />
          <p className="text-sm font-medium text-ink-500">Checking your session...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-[var(--color-paper-cream)] px-6">
      <div className="flex w-full max-w-sm flex-col items-center gap-5 text-center">
        <BrandIcon className="h-12 w-12" />
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight text-ink-900">
            Atlas
          </h1>
          <p className="mt-2 text-sm leading-6 text-ink-500">
          Sign in to start planning your next journey.
          </p>
        </div>
        <button
          onClick={signIn}
          disabled={loading}
          className="inline-flex min-h-11 items-center justify-center gap-3 rounded-[12px] bg-gradient-to-br from-amber-400 to-amber-600 px-5 py-3 text-sm font-semibold text-white shadow-md transition-shadow hover:shadow-lg disabled:opacity-60"
        >
          <GoogleG className="w-5 h-5" />
          {loading ? "Signing in…" : "Sign in with Google"}
        </button>
      </div>
    </main>
  );
}
