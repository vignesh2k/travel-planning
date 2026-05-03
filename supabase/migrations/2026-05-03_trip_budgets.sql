create table public.trip_budgets (
  trip_id uuid primary key references public.trips(id) on delete cascade,
  currency text not null,
  gbp_rate numeric(12,6) not null,
  gbp_rate_date date not null,
  days jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.trip_budgets enable row level security;

create policy trip_budgets_select on public.trip_budgets
  for select using (
    exists (select 1 from public.trips t
            where t.id = trip_id and t.user_id = auth.uid())
  );
create policy trip_budgets_insert on public.trip_budgets
  for insert with check (
    exists (select 1 from public.trips t
            where t.id = trip_id and t.user_id = auth.uid())
  );
create policy trip_budgets_update on public.trip_budgets
  for update using (
    exists (select 1 from public.trips t
            where t.id = trip_id and t.user_id = auth.uid())
  );
create policy trip_budgets_delete on public.trip_budgets
  for delete using (
    exists (select 1 from public.trips t
            where t.id = trip_id and t.user_id = auth.uid())
  );
