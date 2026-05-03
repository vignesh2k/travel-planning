import concurrent.futures
from typing import Any

from fastapi import APIRouter, HTTPException

from api.auth import CurrentUser
from api.db import service_client
from api.geocode import geocode_place
from api.llm.parse_brief import parse_brief
from api.llm.profile import profile_addendum
from api.llm.quick_extract import quick_extract
from api.llm.research import get_travel_research, stream_travel_research
from api.models import Place, TripBriefIn, TripDocument, TripFull, TripSummary
from api.routes.profile import fetch_profile_for
from api.slug import make_trip_slug
from api.sse import sse_stream

router = APIRouter(tags=["trips"])

GEOCODE_CAP = 15
GEOCODE_PRIORITY = ["restaurant", "photography_spot", "neighbourhood", "logistics"]


def _combine_style(user_id: str, brief_style: str) -> str:
    """Prefix the user's saved profile (if any) onto the brief's travel_style."""
    addendum = profile_addendum(fetch_profile_for(user_id))
    if not addendum:
        return brief_style
    if not brief_style:
        return addendum
    return f"{addendum}. {brief_style}"


@router.post("/trips", response_model=TripFull)
def create_trip(brief: TripBriefIn, user: CurrentUser) -> TripFull:
    parsed = parse_brief(brief)
    combined_style = _combine_style(user["sub"], parsed.travel_style)

    research = get_travel_research(parsed.destination, parsed.days, combined_style)

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
        "travel_style": combined_style,
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


@router.post("/trips/stream")
def create_trip_stream(brief: TripBriefIn, user: CurrentUser):
    def events():
        # Try a fast regex extraction. If it succeeds, we can start research
        # immediately while parse_brief runs in parallel — saves ~3-5s of
        # otherwise-sequential parse_brief latency.
        fast_dest, fast_days = quick_extract(brief.text)

        addendum = profile_addendum(fetch_profile_for(user["sub"]))

        def combine(brief_style: str) -> str:
            if not addendum:
                return brief_style
            if not brief_style:
                return addendum
            return f"{addendum}. {brief_style}"

        executor = concurrent.futures.ThreadPoolExecutor(max_workers=2)
        try:
            if fast_dest and fast_days:
                yield ("status", f"Researching {fast_dest} for {fast_days} days…")
                parse_future = executor.submit(parse_brief, brief)
                research_dest, research_days, research_style = (
                    fast_dest,
                    fast_days,
                    combine(brief.text),
                )
            else:
                yield ("status", "Parsing your brief…")
                parsed_now = parse_brief(brief)
                yield (
                    "status",
                    f"Researching {parsed_now.destination} for {parsed_now.days} days…",
                )
                parse_future = executor.submit(lambda: parsed_now)
                research_dest, research_days, research_style = (
                    parsed_now.destination,
                    parsed_now.days,
                    combine(parsed_now.travel_style),
                )

            research: dict[str, Any] | None = None
            for ev_type, payload in stream_travel_research(
                research_dest, research_days, research_style
            ):
                if ev_type == "progress":
                    yield ("progress", payload)
                elif ev_type == "result":
                    research = payload
                elif ev_type == "error":
                    yield ("status", f"Research error: {payload}")
                    return
            if research is None:
                yield ("status", "Research failed: no response")
                return

            # parse_brief should have finished by now since research is the
            # long pole. Block briefly if it hasn't.
            parsed = parse_future.result(timeout=30)
        finally:
            executor.shutdown(wait=False)

        yield ("status", "Mapping places…")
        raw_places = research.get("places", [])
        raw_places.sort(
            key=lambda p: GEOCODE_PRIORITY.index(p.get("category", "logistics"))
            if p.get("category") in GEOCODE_PRIORITY else len(GEOCODE_PRIORITY),
        )
        geocoded: list[dict[str, Any]] = []
        for p in raw_places[:GEOCODE_CAP]:
            lat, lng = geocode_place(p["name"])
            place = {**p, "lat": lat, "lng": lng}
            geocoded.append(place)
            yield ("place", place)

        document = {
            "document_markdown": research["document"],
            "places": geocoded,
            "neighborhoods": [],
        }

        slug = make_trip_slug(parsed.destination, parsed.days)
        row = {
            "slug": slug,
            "user_id": user["sub"],
            "destination": parsed.destination,
            "days": parsed.days,
            "travel_style": combine(parsed.travel_style),
            "start_date": parsed.start_date.isoformat() if parsed.start_date else None,
            "airport_entry": parsed.airport_entry,
            "airport_exit": parsed.airport_exit,
            "document": document,
            "places": [],
        }
        res = service_client().table("trips").insert(row).execute()
        saved_slug = res.data[0]["slug"] if res.data else slug
        yield ("done", {"slug": saved_slug})

    return sse_stream(events())


@router.get("/trips", response_model=list[TripSummary])
def list_trips(user: CurrentUser) -> list[TripSummary]:
    res = (
        service_client().table("trips")
        .select("id, slug, destination, days, created_at")
        .eq("user_id", user["sub"])
        .order("created_at", desc=True)
        .limit(50)
        .execute()
    )
    rows = res.data if isinstance(res.data, list) else [res.data]
    return [TripSummary(**r) for r in rows]


@router.get("/trips/{slug}", response_model=TripFull)
def get_trip(slug: str, user: CurrentUser) -> TripFull:
    res = (
        service_client().table("trips")
        .select("*").eq("slug", slug).single().execute()
    )
    if not res.data:
        raise HTTPException(status_code=404, detail="Trip not found")
    row = res.data
    inserted_data = {**row}
    doc_dict = inserted_data.pop("document")
    return TripFull(**inserted_data, document=TripDocument(**doc_dict))


@router.delete("/trips/{slug}")
def delete_trip(slug: str, user: CurrentUser) -> dict[str, bool]:
    db = service_client()
    res = db.table("trips").select("user_id").eq("slug", slug).single().execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Trip not found")
    if res.data["user_id"] != user["sub"]:
        raise HTTPException(status_code=403, detail="Not your trip")
    db.table("trips").delete().eq("slug", slug).execute()
    return {"ok": True}
