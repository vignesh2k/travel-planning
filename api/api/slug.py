import secrets

from slugify import slugify


def make_trip_slug(destination: str, days: int) -> str:
    return f"{slugify(destination)}-{days}d-{secrets.token_hex(3)}"
