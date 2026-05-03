import secrets

from fastapi import APIRouter, HTTPException, Response

from api.auth import CurrentUser
from api.config import get_settings
from api.db import service_client
from api.models import ShareOut

router = APIRouter(tags=["share"])


def _load_trip_or_404(slug: str, user_sub: str) -> dict:
    res = (
        service_client().table("trips")
        .select("id, user_id, slug, share_token")
        .eq("slug", slug).single().execute()
    )
    if not res or not res.data:
        raise HTTPException(status_code=404, detail="Trip not found")
    if res.data["user_id"] != user_sub:
        raise HTTPException(status_code=403, detail="Not your trip")
    return res.data


def _generate_token() -> str:
    return secrets.token_urlsafe(16)


@router.post("/trips/{slug}/share", response_model=ShareOut)
def create_share(slug: str, user: CurrentUser) -> ShareOut:
    trip = _load_trip_or_404(slug, user["sub"])
    token = _generate_token()
    res = (
        service_client().table("trips")
        .update({"share_token": token})
        .eq("id", trip["id"]).execute()
    )
    if not res.data:
        raise HTTPException(status_code=500, detail="share update returned no row")
    base = get_settings().app_base_url.rstrip("/")
    return ShareOut(share_url=f"{base}/s/{token}", token=token)


@router.delete("/trips/{slug}/share", status_code=204)
def revoke_share(slug: str, user: CurrentUser) -> Response:
    trip = _load_trip_or_404(slug, user["sub"])
    (
        service_client().table("trips")
        .update({"share_token": None})
        .eq("id", trip["id"]).execute()
    )
    return Response(status_code=204)
