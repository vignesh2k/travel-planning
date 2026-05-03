-- Centroid coords (mean of trip.document.places' lat/lng) so the Logbook
-- can show "37.7° N · 25.4° W" without loading the full document JSONB.

alter table public.trips add column centroid_lat real;
alter table public.trips add column centroid_lng real;

-- One-time backfill from existing places.
update public.trips
set centroid_lat = sub.lat, centroid_lng = sub.lng
from (
  select id,
    avg((p->>'lat')::real) as lat,
    avg((p->>'lng')::real) as lng
  from public.trips,
       jsonb_array_elements(document->'places') p
  where (p->>'lat') is not null and (p->>'lng') is not null
  group by id
) sub
where trips.id = sub.id;
