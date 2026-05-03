from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException

from api.auth import CurrentUser
from api.db import service_client
from api.models import UserProfile, UserProfileIn

router = APIRouter(tags=["profile"])


@router.get("/me/profile", response_model=UserProfile | None)
def get_profile(user: CurrentUser) -> UserProfile | None:
    res = (
        service_client().table("user_profiles")
        .select("*").eq("user_id", user["sub"]).maybe_single().execute()
    )
    if not res or not res.data:
        return None
    return UserProfile(**res.data)


@router.put("/me/profile", response_model=UserProfile)
def put_profile(body: UserProfileIn, user: CurrentUser) -> UserProfile:
    row = {
        "user_id": user["sub"],
        "diet": body.diet,
        "budget": body.budget,
        "pace": body.pace,
        "interests": body.interests,
        "notes": body.notes,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    res = (
        service_client().table("user_profiles")
        .upsert(row, on_conflict="user_id")
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=500, detail="upsert returned no row")
    return UserProfile(**res.data[0])


def fetch_profile_for(user_id: str) -> UserProfile | None:
    """Used by other routes to silently augment LLM calls with the user's
    saved preferences. Returns None if the user hasn't set one."""
    res = (
        service_client().table("user_profiles")
        .select("*").eq("user_id", user_id).maybe_single().execute()
    )
    if not res or not res.data:
        return None
    return UserProfile(**res.data)
