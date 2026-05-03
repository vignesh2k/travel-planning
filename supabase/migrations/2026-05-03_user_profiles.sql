create table public.user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  diet text,
  budget text check (budget in ('cheap', 'mid', 'premium')),
  pace text check (pace in ('relaxed', 'balanced', 'packed')),
  interests text[] not null default '{}',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_profiles enable row level security;

create policy user_profiles_select on public.user_profiles
  for select using (auth.uid() = user_id);
create policy user_profiles_insert on public.user_profiles
  for insert with check (auth.uid() = user_id);
create policy user_profiles_update on public.user_profiles
  for update using (auth.uid() = user_id);
create policy user_profiles_delete on public.user_profiles
  for delete using (auth.uid() = user_id);
