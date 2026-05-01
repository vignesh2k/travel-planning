import httpx

from api.config import get_settings


def geocode_place(place_name: str) -> tuple[float | None, float | None]:
    try:
        resp = httpx.get(
            "https://maps.googleapis.com/maps/api/geocode/json",
            params={"address": place_name, "key": get_settings().google_maps_api_key},
            timeout=6,
        )
        if resp.status_code != 200:
            return None, None
        data = resp.json()
        if data.get("status") == "OK":
            loc = data["results"][0]["geometry"]["location"]
            return loc["lat"], loc["lng"]
    except Exception:
        pass
    return None, None
