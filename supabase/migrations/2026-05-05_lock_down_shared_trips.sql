-- Public shared trips are served through the FastAPI
-- /public/trips/:token endpoint, which returns a deliberately limited
-- PublicTrip shape. Do not expose shared rows directly through Supabase
-- table REST access, where callers could enumerate all shared trips or
-- select owner/private columns.

drop policy if exists trips_public_read on public.trips;

revoke all on public.trips from anon;
revoke all on public.trips from authenticated;
