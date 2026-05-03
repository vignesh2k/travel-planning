/**
 * Tiny client for the public OSRM demo at router.project-osrm.org.
 * Returns a GeoJSON LineString that follows roads/paths between the
 * given waypoints. Falls back to null if the request fails — caller
 * is expected to render a straight line in that case.
 */

const OSRM_BASE = "https://router.project-osrm.org/route/v1";

export type RouteProfile = "foot" | "driving" | "bike";

/** Walking-comfortable threshold. Anything beyond is clearly transit/drive. */
const WALK_MAX_SEGMENT_M = 5000;

const EARTH_M = 6_371_000;

function haversine(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_M * Math.asin(Math.sqrt(x));
}

/**
 * Pick "foot" by default; bump to "driving" if any consecutive segment
 * exceeds the walking-comfortable threshold (~5km). Keeps short city
 * itineraries on pavement and switches day-trips/multi-city days to
 * road routing automatically.
 */
export function pickProfile(
  points: { lat: number; lng: number }[],
): RouteProfile {
  if (points.length < 2) return "foot";
  let maxSeg = 0;
  for (let i = 1; i < points.length; i++) {
    const d = haversine(points[i - 1], points[i]);
    if (d > maxSeg) maxSeg = d;
  }
  return maxSeg > WALK_MAX_SEGMENT_M ? "driving" : "foot";
}

export interface RouteResult {
  geometry: GeoJSON.LineString;
  distance: number; // meters
  duration: number; // seconds
}

// In-memory LRU cache. Switching back and forth between the same day's
// points re-uses the route immediately — no extra OSRM hits. Entries
// are tiny (a few hundred coords each), 50-entry cap is generous.
const _ROUTE_CACHE = new Map<string, RouteResult>();
const _ROUTE_CACHE_MAX = 50;

function cacheKey(
  profile: RouteProfile,
  points: { lat: number; lng: number }[],
): string {
  return (
    profile +
    "|" +
    points.map((p) => `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`).join(";")
  );
}

export async function fetchRoute(
  points: { lat: number; lng: number }[],
  profile: RouteProfile = "foot",
  signal?: AbortSignal,
): Promise<RouteResult | null> {
  if (points.length < 2) return null;
  const key = cacheKey(profile, points);
  const cached = _ROUTE_CACHE.get(key);
  if (cached) {
    // Touch (LRU): re-insert moves to back of insertion order.
    _ROUTE_CACHE.delete(key);
    _ROUTE_CACHE.set(key, cached);
    return cached;
  }

  // OSRM expects lng,lat (not lat,lng).
  const coords = points.map((p) => `${p.lng},${p.lat}`).join(";");
  const url = `${OSRM_BASE}/${profile}/${coords}?overview=full&geometries=geojson`;
  try {
    const res = await fetch(url, { signal });
    if (!res.ok) return null;
    const body = await res.json();
    const route = body?.routes?.[0];
    if (!route?.geometry) return null;
    const result: RouteResult = {
      geometry: route.geometry as GeoJSON.LineString,
      distance: Number(route.distance) || 0,
      duration: Number(route.duration) || 0,
    };
    if (_ROUTE_CACHE.size >= _ROUTE_CACHE_MAX) {
      const oldest = _ROUTE_CACHE.keys().next().value;
      if (oldest !== undefined) _ROUTE_CACHE.delete(oldest);
    }
    _ROUTE_CACHE.set(key, result);
    return result;
  } catch {
    return null;
  }
}
