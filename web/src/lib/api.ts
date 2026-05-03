import type {
  Budget,
  BudgetDay,
  BudgetDayIn,
  Neighborhood,
  PublicTrip,
  ShareOut,
  TripBriefIn,
  TripFull,
  TripSummary,
  UserProfile,
  UserProfileIn,
} from "./types";

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

export async function getProfile(token: string): Promise<UserProfile | null> {
  const res = await authedFetch("/me/profile", { method: "GET" }, token);
  if (!res.ok) throw new Error(`getProfile ${res.status}`);
  const data = await res.json();
  return data ?? null;
}

export async function saveProfile(
  profile: UserProfileIn,
  token: string,
): Promise<UserProfile> {
  const res = await authedFetch(
    "/me/profile",
    { method: "PUT", body: JSON.stringify(profile) },
    token,
  );
  if (!res.ok) throw new Error(`saveProfile ${res.status}`);
  return res.json();
}

export async function getBudget(slug: string, token: string): Promise<Budget | null> {
  const res = await authedFetch(`/trips/${slug}/budget`, { method: "GET" }, token);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`getBudget ${res.status}`);
  return res.json();
}

export async function regenerateBudget(slug: string, token: string): Promise<Budget> {
  const res = await authedFetch(
    `/trips/${slug}/budget/regenerate`, { method: "POST" }, token,
  );
  if (!res.ok) throw new Error(`regenerateBudget ${res.status}`);
  return res.json();
}

export async function updateBudgetDay(
  slug: string, day: number, body: BudgetDayIn, token: string,
): Promise<BudgetDay> {
  const res = await authedFetch(
    `/trips/${slug}/budget/days/${day}`,
    { method: "PUT", body: JSON.stringify(body) },
    token,
  );
  if (!res.ok) throw new Error(`updateBudgetDay ${res.status}`);
  return res.json();
}

export async function createShare(slug: string, token: string): Promise<ShareOut> {
  const res = await authedFetch(
    `/trips/${slug}/share`, { method: "POST" }, token,
  );
  if (!res.ok) throw new Error(`createShare ${res.status}`);
  return res.json();
}

export async function revokeShare(slug: string, token: string): Promise<void> {
  const res = await authedFetch(
    `/trips/${slug}/share`, { method: "DELETE" }, token,
  );
  if (!res.ok && res.status !== 204) throw new Error(`revokeShare ${res.status}`);
}

export async function getPublicTrip(token: string): Promise<PublicTrip | null> {
  const res = await fetch(
    `${API_BASE}/public/trips/${token}`,
    { method: "GET" },
  );
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`getPublicTrip ${res.status}`);
  return res.json();
}
