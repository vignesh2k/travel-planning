alter table public.trips add column share_token text unique;

create index trips_share_token_idx on public.trips(share_token)
  where share_token is not null;

-- Public read access scoped to rows that have an active share token.
-- Owner-only policy on trips remains in place; this adds a second
-- policy that anyone (including the anon role) can read shared rows.
create policy trips_public_read on public.trips
  for select using (share_token is not null);
