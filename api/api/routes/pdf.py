import base64
from collections.abc import Iterator
from typing import Any

from fastapi import APIRouter, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel

from api.auth import CurrentUser
from api.db import service_client
from api.llm.pdf_plan import PdfSections, stream_pdf_plan
from api.models import PdfPlan, TripDocument
from api.pdf import generate_pdf, render_plan_pdf
from api.sse import sse_stream

router = APIRouter(tags=["pdf"])


@router.get("/trips/{slug}/pdf")
def trip_pdf(slug: str, user: CurrentUser) -> Response:
    res = service_client().table("trips").select("*").eq("slug", slug).single().execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Trip not found")
    row = res.data
    doc = TripDocument(**row["document"])
    pdf_bytes = generate_pdf(doc.document_markdown, row["destination"])
    safe_name = row["destination"].replace(" ", "_").replace(",", "")
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{safe_name}_travel_guide.pdf"'},
    )


class PdfBuildIn(BaseModel):
    food: bool = True
    photos: bool = True
    tips: bool = True


@router.post("/trips/{slug}/pdf/build")
def build_pdf(slug: str, body: PdfBuildIn, user: CurrentUser):
    """Streaming deep-PDF build with toggleable sections.

    Schedule is always produced. Food, photos, and tips are conditional —
    if a flag is False the LLM is told not to generate that section, saving
    tokens/latency.
    """
    res = service_client().table("trips").select("*").eq("slug", slug).single().execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Trip not found")
    row = res.data
    if row["user_id"] != user["sub"]:
        raise HTTPException(status_code=403, detail="Not your trip")

    doc = TripDocument(**row["document"])
    base_md = doc.document_markdown
    destination = row["destination"]
    days = row["days"]
    travel_style = row.get("travel_style", "")
    start_date_iso = row.get("start_date")
    safe_name = destination.replace(" ", "_").replace(",", "")
    sections = PdfSections(food=body.food, photos=body.photos, tips=body.tips)

    def events() -> Iterator[tuple[str, Any]]:
        plan: PdfPlan | None = None
        for ev_type, payload in stream_pdf_plan(
            destination=destination,
            total_days=days,
            travel_style=travel_style,
            base_md=base_md,
            sections=sections,
            start_date_iso=start_date_iso,
        ):
            if ev_type == "stage":
                yield ("stage", payload)
            elif ev_type == "plan":
                plan = payload
            elif ev_type == "error":
                yield ("stage", {"key": "error", "label": "Error", "status": "error", "message": payload})
                return

        if plan is None:
            yield ("stage", {"key": "error", "label": "No plan", "status": "error"})
            return

        yield ("stage", {"key": "compile", "label": "Compiling PDF", "status": "running"})
        pdf_bytes = render_plan_pdf(plan)
        b64 = base64.b64encode(pdf_bytes).decode("ascii")
        yield ("stage", {"key": "compile", "label": "Compiling PDF", "status": "done"})
        yield ("done", {"pdf_base64": b64, "filename": f"{safe_name}_travel_guide.pdf"})

    return sse_stream(events())
