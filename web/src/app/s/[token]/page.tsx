import { notFound } from "next/navigation";

import { getPublicTrip } from "@/lib/api";

import { PublicView } from "./PublicView";

export default async function PublicTripPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const trip = await getPublicTrip(token).catch(() => null);
  if (!trip) notFound();
  return <PublicView trip={trip} />;
}
