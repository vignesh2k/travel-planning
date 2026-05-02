import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      return NextResponse.redirect(`${origin}/auth/signin?error=exchange`);
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.email) {
      return NextResponse.redirect(`${origin}/auth/signin?error=no_email`);
    }

    // Allowlist check via the public RPC `is_allowed` (defined in the
    // initial schema migration, security definer, returns boolean).
    const { data: allowed, error: rpcErr } = await supabase.rpc("is_allowed");
    if (rpcErr || !allowed) {
      await supabase.auth.signOut();
      return NextResponse.redirect(`${origin}/auth/signin?error=not_allowed`);
    }
  }

  return NextResponse.redirect(`${origin}${next}`);
}
