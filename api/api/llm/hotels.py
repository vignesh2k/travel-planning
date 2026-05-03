import json
from datetime import date, timedelta
from urllib.parse import urlencode

from api.llm.client import make_client, strip_code_fences
from api.models import Hotel, Neighborhood

HOTEL_MODEL = "google/gemini-3.1-flash-lite-preview"

BOOKING_AID = "304142"  # generic Booking.com search affiliate id; safe to omit later


def build_booking_url(
    *,
    hotel_name: str,
    city: str,
    checkin: date | None,
    checkout: date | None,
    adults: int,
) -> str:
    """Build a Booking.com search URL with prefilled query params.

    We use /searchresults.html with the hotel name in the query, which
    reliably surfaces the hotel as the first result without needing
    Booking's dest_id system.
    """
    params: dict[str, str] = {
        "ss": f"{hotel_name}, {city}",
        "group_adults": str(adults),
        "no_rooms": "1",
        "group_children": "0",
        "aid": BOOKING_AID,
    }
    if checkin and checkout:
        params["checkin"] = checkin.isoformat()
        params["checkout"] = checkout.isoformat()
    return "https://www.booking.com/searchresults.html?" + urlencode(params)


def suggest_hotels(
    *,
    document: str,
    destination: str,
    days: int,
    start_date: date | None,
    adults: int,
) -> list[Neighborhood]:
    client = make_client()
    response = client.chat.completions.create(
        model=HOTEL_MODEL,
        max_tokens=900,
        messages=[
            {"role": "system", "content": "Return only a JSON array. No markdown fences, no extra text."},
            {"role": "user", "content": (
                f"This is a {days}-day itinerary for {destination}.\n\n"
                f"{document}\n\n"
                "Pick 2–3 distinct neighbourhoods the traveller should consider basing in. "
                "For each neighbourhood, name 2–3 specific real hotels (mix of mid-range and high-end). "
                "Return a JSON array where each object has:\n"
                '  "label": short neighbourhood name (e.g. "Higashiyama"),\n'
                '  "description": one sentence on why stay here,\n'
                '  "hotels": array of objects with "name" and "description" (one sentence each).'
            )},
        ],
    )
    raw = strip_code_fences(response.choices[0].message.content)
    data = json.loads(raw)

    checkin = start_date
    checkout = start_date + timedelta(days=days) if start_date else None

    out: list[Neighborhood] = []
    for nbr in data:
        hotels = [
            Hotel(
                name=h["name"],
                description=h["description"],
                booking_url=build_booking_url(
                    hotel_name=h["name"],
                    city=destination,
                    checkin=checkin,
                    checkout=checkout,
                    adults=adults,
                ),
            )
            for h in nbr.get("hotels", [])
        ]
        out.append(
            Neighborhood(label=nbr["label"], description=nbr["description"], hotels=hotels)
        )
    return out
