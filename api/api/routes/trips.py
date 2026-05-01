from fastapi import APIRouter

from api.auth import CurrentUser
from api.db import service_client
from api.geocode import geocode_place
from api.llm.parse_brief import parse_brief
from api.llm.research import get_travel_research
from api.models import Place, TripBriefIn, TripDocument, TripFull
from api.slug import make_trip_slug

router = APIRouter(tags=["trips"])

GEOCODE_CAP = 15
GEOCODE_PRIORITY = ["restaurant", "photography_spot", "neighbourhood", "logistics"]


@router.post("/trips", response_model=TripFull)
def create_trip(brief: TripBriefIn, user: CurrentUser) -> TripFull:
    parsed = parse_brief(brief)

    research = get_travel_research(parsed.destination, parsed.days, parsed.travel_style)

    raw_places = research.get("places", [])
    raw_places.sort(
        key=lambda p: GEOCODE_PRIORITY.index(p.get("category", "logistics"))
        if p.get("category") in GEOCODE_PRIORITY else len(GEOCODE_PRIORITY),
    )
    places: list[Place] = []
    for p in raw_places[:GEOCODE_CAP]:
        lat, lng = geocode_place(p["name"])
        places.append(Place(
            name=p["name"], category=p["category"], description=p["description"],
            lat=lat, lng=lng,
        ))

    document = TripDocument(
        document_markdown=research["document"],
        places=places,
        neighborhoods=[],
    )

    slug = make_trip_slug(parsed.destination, parsed.days)
    row = {
        "slug": slug,
        "user_id": user["sub"],
        "destination": parsed.destination,
        "days": parsed.days,
        "travel_style": parsed.travel_style,
        "start_date": parsed.start_date.isoformat() if parsed.start_date else None,
        "airport_entry": parsed.airport_entry,
        "airport_exit": parsed.airport_exit,
        "document": document.model_dump(mode="json"),
        "places": [],  # legacy column, unused
    }
    res = service_client().table("trips").insert(row).execute()
    inserted = res.data[0]
    inserted_data = {**inserted}
    doc_dict = inserted_data.pop("document")
    return TripFull(**inserted_data, document=TripDocument(**doc_dict))
