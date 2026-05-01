from fastapi import APIRouter, HTTPException

from api.auth import CurrentUser
from api.db import service_client
from api.llm.refine import refine_document
from api.models import RefineIn, TripDocument, TripFull

router = APIRouter(tags=["refine"])


@router.post("/trips/{slug}/refine", response_model=TripFull)
def refine_trip(slug: str, body: RefineIn, user: CurrentUser) -> TripFull:
    db = service_client()
    res = db.table("trips").select("*").eq("slug", slug).single().execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Trip not found")
    row = res.data

    new_md = refine_document(row["document"]["document_markdown"], body.instruction)
    new_doc = {**row["document"], "document_markdown": new_md}

    update = db.table("trips").update({"document": new_doc}).eq("slug", slug).execute()
    db.table("messages").insert(
        {"trip_id": row["id"], "role": "user", "content": body.instruction}
    ).execute()

    updated_row = update.data[0]
    inserted_data = {**updated_row}
    doc_dict = inserted_data.pop("document")
    return TripFull(**inserted_data, document=TripDocument(**doc_dict))
