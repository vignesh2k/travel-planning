import concurrent.futures
from typing import Any

from fastapi import APIRouter, HTTPException

from api.auth import CurrentUser
from api.db import service_client
from api.fx import get_gbp_rate
from api.geocode import geocode_place
from api.llm.budget import budget_estimate
from api.llm.parse_brief import parse_brief
from api.llm.profile import profile_addendum
from api.llm.quick_extract import quick_extract
from api.llm.research import get_travel_research, stream_travel_research
from api.models import (
    BudgetEstimateRaw,
    Place,
    TripBriefIn,
    TripDocument,
    TripFull,
    TripPatch,
    TripSummary,
)
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


def _centroid(places: list[dict]) -> tuple[float | None, float | None]:
    """Mean of (lat, lng) over places that have valid coords. Used as the
    trip's "headline location" for the home-screen Logbook coord readout."""
    coords = [(p["lat"], p["lng"]) for p in places if p.get("lat") is not None and p.get("lng") is not None]
    if not coords:
        return (None, None)
    avg_lat = sum(c[0] for c in coords) / len(coords)
    avg_lng = sum(c[1] for c in coords) / len(coords)
    return (avg_lat, avg_lng)


def _persist_budget(trip_id: str, estimate: BudgetEstimateRaw) -> None:
    """Best-effort write of a fresh budget row alongside a new trip."""
    fx = get_gbp_rate(estimate.currency)
    row = {
        "trip_id": trip_id,
        "currency": estimate.currency,
        "gbp_rate": fx.rate,
        "gbp_rate_date": fx.fetched_on.isoformat(),
        "days": [
            {
                "number": d.number,
                "title": f"Day {d.number}",
                "estimated": d.estimated,
                "breakdown": [b.model_dump() for b in d.breakdown],
                "override": None,
                "items": [],
            }
            for d in estimate.days
        ],
    }
    service_client().table("trip_budgets").upsert(
        row, on_conflict="trip_id",
    ).execute()


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
    capped = raw_places[:GEOCODE_CAP]
    # Parallel geocode — each call is independent and IO-bound (~150ms
    # round-trip to Google). Fan out, preserve order via index.
    with concurrent.futures.ThreadPoolExecutor(
        max_workers=min(len(capped), 8) or 1,
    ) as ex:
        coords = list(ex.map(lambda p: geocode_place(p["name"]), capped))
    places: list[Place] = [
        Place(
            name=p["name"], category=p["category"], description=p["description"],
            lat=lat, lng=lng,
        )
        for p, (lat, lng) in zip(capped, coords)
    ]

    document = TripDocument(
        document_markdown=research["document"],
        places=places,
        neighborhoods=[],
    )

    slug = make_trip_slug(parsed.destination, parsed.days)
    cent_lat, cent_lng = _centroid([p.model_dump() for p in places])
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
        "centroid_lat": cent_lat,
        "centroid_lng": cent_lng,
    }
    res = service_client().table("trips").insert(row).execute()
    inserted = res.data[0]

    try:
        estimate = budget_estimate(parsed.destination, parsed.days, combined_style)
        _persist_budget(inserted["id"], estimate)
    except Exception as e:
        print(f"[trips.create] budget persist failed: {e}")

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

        # Profile fetch happens in the executor too, so the first SSE
        # status event flushes before any blocking I/O.
        executor = concurrent.futures.ThreadPoolExecutor(max_workers=4)
        profile_future = executor.submit(fetch_profile_for, user["sub"])

        def combine(brief_style: str) -> str:
            try:
                addendum = profile_addendum(profile_future.result(timeout=5))
            except Exception:
                addendum = ""
            if not addendum:
                return brief_style
            if not brief_style:
                return addendum
            return f"{addendum}. {brief_style}"

        try:
            if fast_dest and fast_days:
                yield ("status", f"Researching {fast_dest} for {fast_days} days…")
                parse_future = executor.submit(parse_brief, brief)
                research_dest, research_days, research_style = (
                    fast_dest,
                    fast_days,
                    combine(brief.text),
                )
                budget_future = executor.submit(
                    budget_estimate, fast_dest, fast_days, research_style,
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
                budget_future = executor.submit(
                    budget_estimate, parsed_now.destination, parsed_now.days,
                    research_style,
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
        capped = raw_places[:GEOCODE_CAP]
        # Parallel geocode. Yield "place" events in input order as each
        # future completes — fast trips populate the map almost
        # instantly instead of stepping place-by-place at ~150ms each.
        geocoded: list[dict[str, Any]] = []
        if capped:
            with concurrent.futures.ThreadPoolExecutor(
                max_workers=min(len(capped), 8),
            ) as geox:
                future_to_p = {
                    geox.submit(geocode_place, p["name"]): p for p in capped
                }
                for fut in concurrent.futures.as_completed(future_to_p):
                    p = future_to_p[fut]
                    try:
                        lat, lng = fut.result()
                    except Exception:
                        lat, lng = None, None
                    place = {**p, "lat": lat, "lng": lng}
                    geocoded.append(place)
                    yield ("place", place)

        document = {
            "document_markdown": research["document"],
            "places": geocoded,
            "neighborhoods": [],
        }

        slug = make_trip_slug(parsed.destination, parsed.days)
        cent_lat, cent_lng = _centroid(geocoded)
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
            "centroid_lat": cent_lat,
            "centroid_lng": cent_lng,
        }
        res = service_client().table("trips").insert(row).execute()
        saved_slug = res.data[0]["slug"] if res.data else slug

        if res.data:
            try:
                estimate = budget_future.result(timeout=30)
                _persist_budget(res.data[0]["id"], estimate)
            except Exception as e:
                # Budget is best-effort. Trip creation already succeeded.
                print(f"[trips.stream] budget persist failed: {e}")

        yield ("done", {"slug": saved_slug})

    return sse_stream(events())


@router.get("/trips", response_model=list[TripSummary])
def list_trips(user: CurrentUser) -> list[TripSummary]:
    res = (
        service_client().table("trips")
        .select("id, slug, destination, days, start_date, centroid_lat, centroid_lng, created_at")
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


@router.patch("/trips/{slug}", response_model=TripFull)
def patch_trip(slug: str, body: TripPatch, user: CurrentUser) -> TripFull:
    db = service_client()
    res = db.table("trips").select("*").eq("slug", slug).single().execute()
    if not res or not res.data:
        raise HTTPException(status_code=404, detail="Trip not found")
    if res.data["user_id"] != user["sub"]:
        raise HTTPException(status_code=403, detail="Not your trip")

    update = {
        "start_date": body.start_date.isoformat() if body.start_date else None,
    }
    upd = db.table("trips").update(update).eq("slug", slug).execute()
    if not upd.data:
        raise HTTPException(status_code=500, detail="update returned no row")

    row = upd.data[0]
    inserted_data = {**row}
    doc_dict = inserted_data.pop("document")
    return TripFull(**inserted_data, document=TripDocument(**doc_dict))
