import { createClient as createBrowserSupabase } from "@/lib/supabase/client";
import { createClient as createServerSupabase } from "@/lib/supabase/server";

export async function getServerToken(): Promise<string | null> {
  const supabase = await createServerSupabase();
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ?? null;
}

export async function getBrowserToken(): Promise<string | null> {
  const supabase = createBrowserSupabase();
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ?? null;
}
