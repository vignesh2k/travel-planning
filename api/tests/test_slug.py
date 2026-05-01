import re

from api.slug import make_trip_slug


def test_make_trip_slug_combines_destination_and_days() -> None:
    out = make_trip_slug("Kyoto, Japan", 7)
    assert re.match(r"^kyoto-japan-7d-[a-z0-9]{6}$", out), out


def test_make_trip_slug_handles_unicode() -> None:
    out = make_trip_slug("São Paulo", 5)
    assert out.startswith("sao-paulo-5d-")
