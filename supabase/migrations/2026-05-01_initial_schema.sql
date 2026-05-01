-- Allowed emails — admin-managed allowlist for Google sign-in.
create table public.allowed_emails (
  email text primary key
);

-- Trips table.
create table public.trips (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  destination text not null,
  days int not null,
  travel_style text not null default '',
  start_date date,
  airport_entry text,
  airport_exit text,
  document jsonb not null,
  places jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index trips_user_id_idx on public.trips(user_id);
create index trips_slug_idx on public.trips(slug);

-- Refine messages per trip.
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamptz not null default now()
);

create index messages_trip_id_idx on public.messages(trip_id);

-- Row-level security.
alter table public.trips enable row level security;
alter table public.messages enable row level security;
alter table public.allowed_emails enable row level security;

-- Helper: is the caller's email on the allowlist?
create or replace function public.is_allowed() returns boolean
language sql stable security definer set search_path = public, auth as $$
  select exists (
    select 1 from public.allowed_emails ae
    where ae.email = (select email from auth.users where id = auth.uid())
  );
$$;

-- trips: any allowed user can read; only owner can write.
create policy trips_select on public.trips for select using (public.is_allowed());
create policy trips_insert on public.trips for insert with check (auth.uid() = user_id);
create policy trips_update on public.trips for update using (auth.uid() = user_id);
create policy trips_delete on public.trips for delete using (auth.uid() = user_id);

-- messages: only owner of the parent trip can read/write.
create policy messages_select on public.messages for select using (
  exists (select 1 from public.trips t where t.id = messages.trip_id and t.user_id = auth.uid())
);
create policy messages_insert on public.messages for insert with check (
  exists (select 1 from public.trips t where t.id = messages.trip_id and t.user_id = auth.uid())
);

-- allowed_emails: nobody reads through the API. (Service role bypasses RLS.)
create policy allowed_emails_no_read on public.allowed_emails for select using (false);
