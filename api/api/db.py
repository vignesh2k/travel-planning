from functools import lru_cache

from supabase import Client, create_client

from api.config import get_settings


@lru_cache
def service_client() -> Client:
    """Bypasses RLS — use for trusted server-side writes after auth check."""
    s = get_settings()
    return create_client(s.supabase_url, s.supabase_service_role_key)


def user_client(jwt_token: str) -> Client:
    """Honors RLS as the authenticated user."""
    s = get_settings()
    client = create_client(s.supabase_url, s.supabase_anon_key)
    client.postgrest.auth(jwt_token)
    return client
