from functools import lru_cache

from supabase import Client, create_client

from api.config import get_settings


@lru_cache
def service_client() -> Client:
    """Bypasses RLS — use for trusted server-side writes after auth check."""
    s = get_settings()
    return create_client(s.supabase_url, s.supabase_service_role_key)
