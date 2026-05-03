from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException

from api.auth import CurrentUser
from api.db import service_client
from api.fx import get_gbp_rate
from api.llm.budget import budget_estimate
from api.models import Budget, BudgetDay, BudgetDayIn, BudgetEstimateRaw

router = APIRouter(tags=["budget"])


def _load_trip_or_404(slug: str, user_sub: str) -> dict:
    res = (
        service_client().table("trips")
        .select("id, user_id, destination, days, travel_style")
        .eq("slug", slug).single().execute()
    )
    if not res or not res.data:
        raise HTTPException(status_code=404, detail="Trip not found")
    if res.data["user_id"] != user_sub:
        raise HTTPException(status_code=403, detail="Not your trip")
    return res.data


def _load_budget(trip_id: str) -> dict | None:
    res = (
        service_client().table("trip_budgets")
        .select("*").eq("trip_id", trip_id).maybe_single().execute()
    )
    return res.data if res and res.data else None


@router.get("/trips/{slug}/budget", response_model=Budget)
def get_budget(slug: str, user: CurrentUser) -> Budget:
    trip = _load_trip_or_404(slug, user["sub"])
    row = _load_budget(trip["id"])
    if not row:
        raise HTTPException(status_code=404, detail="Budget not generated")
    return Budget(**row)


@router.put("/trips/{slug}/budget/days/{day_number}", response_model=BudgetDay)
def put_budget_day(
    slug: str, day_number: int, body: BudgetDayIn, user: CurrentUser,
) -> BudgetDay:
    trip = _load_trip_or_404(slug, user["sub"])
    row = _load_budget(trip["id"])
    if not row:
        raise HTTPException(status_code=404, detail="Budget not generated")

    days = row["days"]
    idx = next((i for i, d in enumerate(days) if d["number"] == day_number), None)
    if idx is None:
        raise HTTPException(status_code=404, detail=f"Day {day_number} not found")

    days[idx] = {
        **days[idx],
        "override": body.override,
        "items": [item.model_dump() for item in body.items],
    }

    res = (
        service_client().table("trip_budgets")
        .update({
            "days": days,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        })
        .eq("trip_id", trip["id"]).execute()
    )
    if not res.data:
        raise HTTPException(status_code=500, detail="update returned no row")
    return BudgetDay(**res.data[0]["days"][idx])


@router.post("/trips/{slug}/budget/regenerate", response_model=Budget)
def regenerate_budget(slug: str, user: CurrentUser) -> Budget:
    trip = _load_trip_or_404(slug, user["sub"])
    existing = _load_budget(trip["id"]) or {"days": []}

    estimate: BudgetEstimateRaw = budget_estimate(
        trip["destination"],
        trip["days"],
        trip.get("travel_style", ""),
    )
    fx = get_gbp_rate(estimate.currency)

    prior_by_num = {d["number"]: d for d in existing.get("days", [])}
    new_days = []
    for ed in estimate.days:
        prior = prior_by_num.get(ed.number, {})
        new_days.append({
            "number": ed.number,
            "title": prior.get("title", f"Day {ed.number}"),
            "estimated": ed.estimated,
            "override": prior.get("override"),
            "items": prior.get("items", []),
        })

    row = {
        "trip_id": trip["id"],
        "currency": estimate.currency,
        "gbp_rate": fx.rate,
        "gbp_rate_date": fx.fetched_on.isoformat(),
        "days": new_days,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }

    res = (
        service_client().table("trip_budgets")
        .upsert(row, on_conflict="trip_id").execute()
    )
    if not res.data:
        raise HTTPException(status_code=500, detail="upsert returned no row")
    return Budget(**res.data[0])


def fetch_budget_for(trip_id: str) -> dict | None:
    """Helper used by other routes (e.g. PDF) that need read-only access."""
    return _load_budget(trip_id)
