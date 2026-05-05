from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


def test_shared_trip_migration_removes_direct_anon_table_access():
    migration = ROOT / "supabase/migrations/2026-05-05_lock_down_shared_trips.sql"
    sql = migration.read_text()

    assert "drop policy if exists trips_public_read" in sql
    assert "revoke all on public.trips from anon" in sql
    assert "revoke all on public.trips from authenticated" in sql
