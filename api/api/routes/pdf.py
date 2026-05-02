from fastapi import APIRouter, HTTPException
from fastapi.responses import Response

from api.auth import CurrentUser
from api.db import service_client
from api.models import TripDocument
from api.pdf import generate_pdf

router = APIRouter(tags=["pdf"])


@router.get("/trips/{slug}/pdf")
def trip_pdf(slug: str, user: CurrentUser) -> Response:
    res = service_client().table("trips").select("*").eq("slug", slug).single().execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Trip not found")
    row = res.data

    # Route the raw jsonb through TripDocument so the field validator coerces
    # any dict-shaped document_markdown back into a proper string.
    doc = TripDocument(**row["document"])
    pdf_bytes = generate_pdf(doc.document_markdown, row["destination"])
    safe_name = row["destination"].replace(" ", "_").replace(",", "")
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{safe_name}_travel_guide.pdf"'},
    )
