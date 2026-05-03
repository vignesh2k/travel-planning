import { notFound, redirect } from "next/navigation";

import { getBudget, getTrip } from "@/lib/api";
import { getServerToken } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

import { TripView } from "./TripView";

export default async function TripPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/signin");

  const token = await getServerToken();
  if (!token) redirect("/auth/signin");

  let trip;
  try {
    trip = await getTrip(slug, token);
  } catch {
    notFound();
  }

  const budget = await getBudget(slug, token).catch(() => null);

  return <TripView trip={trip} budget={budget} />;
}
