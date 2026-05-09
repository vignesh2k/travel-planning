-- Performance: indexed lookups on trip_budgets by trip_id.
create index if not exists trip_budgets_trip_id_idx on public.trip_budgets(trip_id);
