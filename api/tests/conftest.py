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
