/**
 * Tiny client for the public OSRM demo at router.project-osrm.org.
 * Returns a GeoJSON LineString that follows roads/paths between the
 * given waypoints. Falls back to null if the request fails — caller
 * is expected to render a straight line in that case.
 */

const OSRM_BASE = "https://router.project-osrm.org/route/v1";

export type RouteProfile = "foot" | "driving" | "bike";

export interface RouteResult {
  geometry: GeoJSON.LineString;
  distance: number; // meters
  duration: number; // seconds
}

export async function fetchRoute(
  points: { lat: number; lng: number }[],
  profile: RouteProfile = "foot",
  signal?: AbortSignal,
): Promise<RouteResult | null> {
  if (points.length < 2) return null;
  // OSRM expects lng,lat (not lat,lng).
  const coords = points.map((p) => `${p.lng},${p.lat}`).join(";");
  const url = `${OSRM_BASE}/${profile}/${coords}?overview=full&geometries=geojson`;
  try {
    const res = await fetch(url, { signal });
    if (!res.ok) return null;
    const body = await res.json();
    const route = body?.routes?.[0];
    if (!route?.geometry) return null;
    return {
      geometry: route.geometry as GeoJSON.LineString,
      distance: Number(route.distance) || 0,
      duration: Number(route.duration) || 0,
    };
  } catch {
    return null;
  }
}
