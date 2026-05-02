import base64
from collections.abc import Iterator
from typing import Any

from fastapi import APIRouter, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel, Field

from api.auth import CurrentUser
from api.db import service_client
from api.llm.augment import SECTIONS, augment_section
from api.models import TripDocument
from api.pdf import generate_pdf
from api.sse import sse_stream

router = APIRouter(tags=["pdf"])


@router.get("/trips/{slug}/pdf")
def trip_pdf(slug: str, user: CurrentUser) -> Response:
    """Quick-export: just the base document, no augmentation."""
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
    sections: list[str] = Field(default_factory=list)


@router.post("/trips/{slug}/pdf/build")
def build_pdf(slug: str, body: PdfBuildIn, user: CurrentUser):
    """Streaming PDF build with optional augmented sections.

    Yields SSE events:
      - stage: {key, label, status: "running" | "done" | "error", message?}
        — emitted twice per section (running, then done/error) and once for
        the final compile step
      - done: {pdf_base64, filename}
        — base64-encoded PDF bytes the frontend decodes and saves
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
    safe_name = destination.replace(" ", "_").replace(",", "")

    def events() -> Iterator[tuple[str, Any]]:
        augmented_parts: list[str] = []
        for key in body.sections:
            spec = SECTIONS.get(key)
            if spec is None:
                continue
            yield ("stage", {"key": key, "label": spec["label"], "status": "running"})
            try:
                section_md = augment_section(key, base_md, destination, days)
                if section_md:
                    augmented_parts.append(section_md)
                yield ("stage", {"key": key, "label": spec["label"], "status": "done"})
            except Exception as e:
                yield (
                    "stage",
                    {"key": key, "label": spec["label"], "status": "error", "message": str(e)},
                )

        yield ("stage", {"key": "compile", "label": "Compiling PDF", "status": "running"})
        full_md = base_md
        if augmented_parts:
            full_md = base_md + "\n\n" + "\n\n".join(augmented_parts)
        pdf_bytes = generate_pdf(full_md, destination)
        b64 = base64.b64encode(pdf_bytes).decode("ascii")
        yield ("stage", {"key": "compile", "label": "Compiling PDF", "status": "done"})
        yield ("done", {"pdf_base64": b64, "filename": f"{safe_name}_travel_guide.pdf"})

    return sse_stream(events())
