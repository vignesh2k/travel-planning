-- Drafts: every generation inserts a row, but it doesn't appear in the
-- user's Logbook until they click Save. Existing trips are grandfathered
-- in as saved.
alter table public.trips
  add column is_saved boolean not null default false;

update public.trips set is_saved = true where is_saved = false;

-- Hot path: list_trips filters by (user_id, is_saved=true) ordered by
-- created_at desc. The partial index keeps the size small (drafts are
-- short-lived) while exactly matching the predicate.
create index trips_user_saved_created_idx
  on public.trips(user_id, created_at desc)
  where is_saved = true;
