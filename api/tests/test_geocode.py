import httpx
import respx

from api.geocode import geocode_place


@respx.mock
def test_geocode_returns_lat_lng_on_ok() -> None:
    respx.get("https://maps.googleapis.com/maps/api/geocode/json").mock(
        return_value=httpx.Response(
            200,
            json={
                "status": "OK",
                "results": [{"geometry": {"location": {"lat": 35.0, "lng": 135.7}}}],
            },
        )
    )
    lat, lng = geocode_place("Kyoto, Japan")
    assert lat == 35.0
    assert lng == 135.7


@respx.mock
def test_geocode_returns_none_on_zero_results() -> None:
    respx.get("https://maps.googleapis.com/maps/api/geocode/json").mock(
        return_value=httpx.Response(200, json={"status": "ZERO_RESULTS", "results": []})
    )
    lat, lng = geocode_place("Atlantis")
    assert lat is None and lng is None


@respx.mock
def test_geocode_returns_none_on_http_error() -> None:
    respx.get("https://maps.googleapis.com/maps/api/geocode/json").mock(
        return_value=httpx.Response(500)
    )
    lat, lng = geocode_place("Kyoto")
    assert lat is None and lng is None
