import type { TripFull, TripSummary, TripBriefIn, Neighborhood } from "./types";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE!;

async function authedFetch(path: string, init: RequestInit, token: string): Promise<Response> {
  return fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      Authorization: `Bearer ${token}`,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
    },
  });
}

export async function listTrips(token: string): Promise<TripSummary[]> {
  const res = await authedFetch("/trips", { method: "GET" }, token);
  if (!res.ok) throw new Error(`listTrips ${res.status}`);
  return res.json();
}

export async function getTrip(slug: string, token: string): Promise<TripFull> {
  const res = await authedFetch(`/trips/${slug}`, { method: "GET" }, token);
  if (!res.ok) throw new Error(`getTrip ${res.status}`);
  return res.json();
}

export async function refineTrip(slug: string, instruction: string, token: string): Promise<TripFull> {
  const res = await authedFetch(
    `/trips/${slug}/refine`,
    { method: "POST", body: JSON.stringify({ instruction }) },
    token,
  );
  if (!res.ok) throw new Error(`refineTrip ${res.status}`);
  return res.json();
}

export async function fetchHotels(slug: string, adults: number, token: string): Promise<Neighborhood[]> {
  const res = await authedFetch(
    `/trips/${slug}/hotels`,
    { method: "POST", body: JSON.stringify({ adults }) },
    token,
  );
  if (!res.ok) throw new Error(`fetchHotels ${res.status}`);
  return res.json();
}

export async function postBrief(brief: TripBriefIn, token: string): Promise<TripFull> {
  const res = await authedFetch("/trips", { method: "POST", body: JSON.stringify(brief) }, token);
  if (!res.ok) throw new Error(`postBrief ${res.status}`);
  return res.json();
}

export async function deleteTrip(slug: string, token: string): Promise<void> {
  const res = await authedFetch(`/trips/${slug}`, { method: "DELETE" }, token);
  if (!res.ok) throw new Error(`deleteTrip ${res.status}`);
}
