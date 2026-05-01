from datetime import date

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from api.auth import CurrentUser
from api.db import service_client
from api.llm.hotels import suggest_hotels
from api.models import Neighborhood

router = APIRouter(tags=["hotels"])


class HotelsIn(BaseModel):
    adults: int = Field(2, ge=1, le=10)


@router.post("/trips/{slug}/hotels", response_model=list[Neighborhood])
def trip_hotels(slug: str, body: HotelsIn, user: CurrentUser) -> list[Neighborhood]:
    db = service_client()
    res = db.table("trips").select("*").eq("slug", slug).single().execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Trip not found")
    row = res.data
    if row["user_id"] != user["sub"]:
        raise HTTPException(status_code=403, detail="Not your trip")

    start = date.fromisoformat(row["start_date"]) if row.get("start_date") else None

    neighborhoods = suggest_hotels(
        document=row["document"]["document_markdown"],
        destination=row["destination"],
        days=row["days"],
        start_date=start,
        adults=body.adults,
    )

    new_doc = {**row["document"], "neighborhoods": [n.model_dump() for n in neighborhoods]}
    db.table("trips").update({"document": new_doc}).eq("slug", slug).execute()

    return neighborhoods
