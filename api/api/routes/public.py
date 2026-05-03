from fastapi import APIRouter, HTTPException

from api.db import service_client
from api.models import PublicTrip, TripDocument

router = APIRouter(tags=["public"])


@router.get("/public/trips/{token}", response_model=PublicTrip)
def public_trip(token: str) -> PublicTrip:
    res = (
        service_client().table("trips")
        .select("slug, destination, days, start_date, document, created_at")
        .eq("share_token", token).maybe_single().execute()
    )
    if not res or not res.data:
        raise HTTPException(status_code=404, detail="Not found")
    row = res.data
    doc = TripDocument(**row["document"])
    return PublicTrip(
        slug=row["slug"],
        destination=row["destination"],
        days=row["days"],
        start_date=row.get("start_date"),
        document=doc,
        created_at=row["created_at"],
    )
