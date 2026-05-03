import { notFound, redirect } from "next/navigation";

import { getBudget, getTrip } from "@/lib/api";
import { getServerToken } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

import { TripView } from "./TripView";

export default async function TripPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ day?: string }>;
}) {
  const { slug } = await params;
  const { day } = await searchParams;
  const dayNum = day ? Number(day) : NaN;
  const initialDay = Number.isFinite(dayNum) && dayNum >= 1 ? dayNum : undefined;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/signin");

  const token = await getServerToken();
  if (!token) redirect("/auth/signin");

  // Fetch trip + budget in parallel. getBudget tolerates 404 internally;
  // getTrip throws on 4xx/5xx so we catch and notFound().
  const [tripResult, budget] = await Promise.all([
    getTrip(slug, token).catch(() => null),
    getBudget(slug, token).catch(() => null),
  ]);
  if (!tripResult) notFound();

  return <TripView trip={tripResult} budget={budget} initialDay={initialDay} />;
}
