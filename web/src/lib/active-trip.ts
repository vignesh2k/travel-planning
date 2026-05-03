import type { TripSummary } from "./types";

export interface ActiveTrip {
  trip: TripSummary;
  dayNumber: number;       // 1-indexed
  totalDays: number;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function daysBetween(startIso: string, todayIso: string): number {
  const start = new Date(`${startIso}T00:00:00`);
  const today = new Date(`${todayIso}T00:00:00`);
  return Math.floor((today.getTime() - start.getTime()) / MS_PER_DAY);
}

/**
 * Find the trip that's active today, if any.
 *
 * Active = start_date is set AND start_date <= today < start_date + days.
 * If multiple trips qualify (rare overlap), pick the most recently created.
 */
export function findActiveTrip(
  trips: TripSummary[],
  today: Date = new Date(),
): ActiveTrip | null {
  const todayIso = ymd(today);

  const candidates: ActiveTrip[] = [];
  for (const trip of trips) {
    if (!trip.start_date) continue;
    const offset = daysBetween(trip.start_date, todayIso);
    if (offset < 0 || offset >= trip.days) continue;
    candidates.push({
      trip,
      dayNumber: offset + 1,
      totalDays: trip.days,
    });
  }
  if (candidates.length === 0) return null;
  candidates.sort(
    (a, b) =>
      new Date(b.trip.created_at).getTime() - new Date(a.trip.created_at).getTime(),
  );
  return candidates[0];
}

/**
 * Tightest [minLng, minLat, maxLng, maxLat] around the given places.
 * Returns null if fewer than 2 points have valid coordinates.
 */
export function bboxFromPlaces(
  places: { lat: number | null; lng: number | null }[],
): [number, number, number, number] | null {
  const pts = places.filter(
    (p): p is { lat: number; lng: number } => p.lat !== null && p.lng !== null,
  );
  if (pts.length < 2) return null;
  let minLng = pts[0].lng, minLat = pts[0].lat;
  let maxLng = pts[0].lng, maxLat = pts[0].lat;
  for (const p of pts) {
    if (p.lng < minLng) minLng = p.lng;
    if (p.lng > maxLng) maxLng = p.lng;
    if (p.lat < minLat) minLat = p.lat;
    if (p.lat > maxLat) maxLat = p.lat;
  }
  return [minLng, minLat, maxLng, maxLat];
}
