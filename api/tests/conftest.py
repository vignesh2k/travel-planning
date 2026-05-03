import os

import pytest

# Set environment variables at module load time, before test collection
os.environ["OPENROUTER_API_KEY"] = "test-or"
os.environ["GOOGLE_MAPS_API_KEY"] = "test-gm"
os.environ["SUPABASE_URL"] = "https://example.supabase.co"
os.environ["SUPABASE_ANON_KEY"] = "test-anon"
os.environ["SUPABASE_SERVICE_ROLE_KEY"] = "test-svc"
os.environ["SUPABASE_JWT_SECRET"] = "test-secret-32chars-minimum-okok"


@pytest.fixture(autouse=True)
def _env() -> None:
    # Drop the lru_cache so each test gets a fresh Settings
    from api.config import get_settings
    get_settings.cache_clear()


@pytest.fixture(autouse=True)
def _default_no_profile(monkeypatch) -> None:
    """Default fetch_profile_for to None at every call site that uses it.
    Tests that want to assert a profile is applied can monkeypatch it back."""
    for path in (
        "api.routes.trips.fetch_profile_for",
        "api.routes.pdf.fetch_profile_for",
    ):
        try:
            monkeypatch.setattr(path, lambda _uid: None)
        except AttributeError:
            # Module doesn't import the helper yet (e.g., before Task 7) — fine.
            pass

    for path in ("api.routes.pdf.fetch_budget_for",):
        try:
            monkeypatch.setattr(path, lambda _trip_id: None)
        except AttributeError:
            pass
