import Link from "next/link";
import { redirect } from "next/navigation";

import { BrandMark } from "@/components/BrandMark";
import { ProfileForm } from "@/components/ProfileForm";
import { getProfile } from "@/lib/api";
import { getServerToken } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function ProfilePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/signin");

  const token = await getServerToken();
  const profile = token ? await getProfile(token).catch(() => null) : null;

  return (
    <main className="min-h-screen bg-[var(--color-paper-cream)]">
      <header className="flex min-h-14 items-center justify-between border-b border-amber-700/10 bg-white/35 px-4 py-3 sm:px-6">
        <Link href="/" className="contents"><BrandMark /></Link>
        <Link href="/" className="text-xs text-ink-500 hover:text-ink-900">← Back</Link>
      </header>
      <section className="px-4 py-8 sm:px-6 sm:py-10 anim-fade-in">
        <ProfileForm initial={profile} />
      </section>
    </main>
  );
}
