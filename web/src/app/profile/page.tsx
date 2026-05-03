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
    <main className="min-h-screen">
      <header className="px-6 py-4 flex items-center justify-between">
        <Link href="/" className="contents"><BrandMark /></Link>
        <Link href="/" className="text-xs text-ink-500 hover:text-ink-900">← Back</Link>
      </header>
      <section className="px-6 pb-12 anim-fade-in">
        <ProfileForm initial={profile} />
      </section>
    </main>
  );
}
