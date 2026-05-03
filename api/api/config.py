from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    openrouter_api_key: str
    google_maps_api_key: str
    supabase_url: str
    supabase_anon_key: str
    supabase_service_role_key: str
    supabase_jwt_secret: str
    allowed_origins: str = "http://localhost:3000"
    app_base_url: str = "https://atlas.viggy.dev"
    port: int = 8080


@lru_cache
def get_settings() -> Settings:
    return Settings()
