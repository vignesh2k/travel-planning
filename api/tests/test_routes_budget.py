import time
from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient
from jose import jwt

from api.config import get_settings
from api.main import app

OWNER_ID = "owner-uid"


def _token(user_id: str) -> str:
    return jwt.encode(
        {"sub": user_id, "email": "v@example.com",
         "exp": int(time.time()) + 3600, "aud": "authenticated"},
        get_settings().supabase_jwt_secret, algorithm="HS256",
    )


@pytest.fixture
def auth_headers() -> dict[str, str]:
    return {"Authorization": f"Bearer {_token(OWNER_ID)}"}


def _trip_row() -> dict:
    return {"id": "t1", "user_id": OWNER_ID, "slug": "kyoto-7d-aaa",
            "destination": "Kyoto", "days": 2, "travel_style": "vegetarian"}


def _budget_row() -> dict:
    return {
        "trip_id": "t1",
        "currency": "JPY",
        "gbp_rate": 0.0052,
        "gbp_rate_date": "2026-05-03",
        "days": [
            {"number": 1, "title": "Day 1", "estimated": 18000,
             "override": None, "items": []},
            {"number": 2, "title": "Day 2", "estimated": 22000,
             "override": None, "items": []},
        ],
        "updated_at": "2026-05-03T10:00:00+00:00",
    }


def _mock_db(trip_row=None, budget_row=None) -> MagicMock:
    """Returns a Supabase client mock that handles trip + budget queries."""
    trips_chain = MagicMock()
    trips_chain.select.return_value = trips_chain
    trips_chain.eq.return_value = trips_chain
    trips_chain.single.return_value = trips_chain
    trips_chain.execute.return_value = MagicMock(data=trip_row)

    budgets_chain = MagicMock()
    budgets_chain.select.return_value = budgets_chain
    budgets_chain.eq.return_value = budgets_chain
    budgets_chain.maybe_single.return_value = budgets_chain
    budgets_chain.execute.return_value = MagicMock(data=budget_row)

    def table(name: str) -> MagicMock:
        return trips_chain if name == "trips" else budgets_chain

    client = MagicMock()
    client.table.side_effect = table
    return client


def test_get_budget_returns_404_when_trip_missing(monkeypatch, auth_headers):
    monkeypatch.setattr(
        "api.routes.budget.service_client",
        lambda: _mock_db(trip_row=None),
    )
    res = TestClient(app).get("/trips/nope/budget", headers=auth_headers)
    assert res.status_code == 404


def test_get_budget_returns_404_when_no_budget_row(monkeypatch, auth_headers):
    monkeypatch.setattr(
        "api.routes.budget.service_client",
        lambda: _mock_db(trip_row=_trip_row(), budget_row=None),
    )
    res = TestClient(app).get("/trips/kyoto-7d-aaa/budget", headers=auth_headers)
    assert res.status_code == 404


def test_get_budget_returns_row(monkeypatch, auth_headers):
    monkeypatch.setattr(
        "api.routes.budget.service_client",
        lambda: _mock_db(trip_row=_trip_row(), budget_row=_budget_row()),
    )
    res = TestClient(app).get("/trips/kyoto-7d-aaa/budget", headers=auth_headers)
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["currency"] == "JPY"
    assert len(body["days"]) == 2


def test_get_budget_403_when_not_owner(monkeypatch, auth_headers):
    other = {**_trip_row(), "user_id": "someone-else"}
    monkeypatch.setattr(
        "api.routes.budget.service_client",
        lambda: _mock_db(trip_row=other),
    )
    res = TestClient(app).get("/trips/kyoto-7d-aaa/budget", headers=auth_headers)
    assert res.status_code == 403


def test_put_day_updates_override_and_items(monkeypatch, auth_headers):
    db = _mock_db(trip_row=_trip_row(), budget_row=_budget_row())
    saved = _budget_row()
    saved["days"][0] = {**saved["days"][0], "override": 20000,
                        "items": [{"name": "Spa", "amount": 5000}]}
    db.table("trip_budgets").update.return_value.eq.return_value.execute.return_value = (
        MagicMock(data=[saved])
    )
    monkeypatch.setattr("api.routes.budget.service_client", lambda: db)

    res = TestClient(app).put(
        "/trips/kyoto-7d-aaa/budget/days/1",
        headers=auth_headers,
        json={"override": 20000, "items": [{"name": "Spa", "amount": 5000}]},
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["override"] == 20000
    assert body["items"][0]["name"] == "Spa"


def test_put_day_404_for_unknown_day(monkeypatch, auth_headers):
    monkeypatch.setattr(
        "api.routes.budget.service_client",
        lambda: _mock_db(trip_row=_trip_row(), budget_row=_budget_row()),
    )
    res = TestClient(app).put(
        "/trips/kyoto-7d-aaa/budget/days/99",
        headers=auth_headers,
        json={"override": 1, "items": []},
    )
    assert res.status_code == 404


def test_put_day_rejects_negative(monkeypatch, auth_headers):
    monkeypatch.setattr(
        "api.routes.budget.service_client",
        lambda: _mock_db(trip_row=_trip_row(), budget_row=_budget_row()),
    )
    res = TestClient(app).put(
        "/trips/kyoto-7d-aaa/budget/days/1",
        headers=auth_headers,
        json={"override": -1, "items": []},
    )
    assert res.status_code == 422


def test_regenerate_replaces_estimates_preserves_overrides(monkeypatch, auth_headers):
    """Regenerate updates `estimated` per day but keeps user override + items."""
    from datetime import date

    from api.fx import FxRate
    from api.models import BudgetEstimateDay, BudgetEstimateRaw

    monkeypatch.setattr(
        "api.routes.budget.budget_estimate",
        lambda *_a, **_k: BudgetEstimateRaw(
            currency="JPY",
            days=[BudgetEstimateDay(number=1, estimated=21000),
                  BudgetEstimateDay(number=2, estimated=25000)],
        ),
    )
    monkeypatch.setattr(
        "api.routes.budget.get_gbp_rate",
        lambda c: FxRate(rate=0.0050, fetched_on=date(2026, 5, 3)),
    )

    existing_with_overrides = _budget_row()
    existing_with_overrides["days"][0] = {
        **existing_with_overrides["days"][0],
        "override": 20000,
        "items": [{"name": "Spa", "amount": 5000}],
    }
    db = _mock_db(trip_row=_trip_row(), budget_row=existing_with_overrides)

    captured: dict = {}

    def upsert_side_effect(row, on_conflict=None):
        captured["row"] = row
        chain = MagicMock()
        chain.execute.return_value = MagicMock(data=[row])
        return chain

    db.table("trip_budgets").upsert.side_effect = upsert_side_effect
    monkeypatch.setattr("api.routes.budget.service_client", lambda: db)

    res = TestClient(app).post(
        "/trips/kyoto-7d-aaa/budget/regenerate", headers=auth_headers,
    )
    assert res.status_code == 200, res.text
    saved_days = captured["row"]["days"]
    assert saved_days[0]["estimated"] == 21000
    assert saved_days[0]["override"] == 20000
    assert saved_days[0]["items"] == [{"name": "Spa", "amount": 5000}]
    assert saved_days[1]["estimated"] == 25000
    assert saved_days[1]["override"] is None


def test_endpoints_require_auth():
    cli = TestClient(app)
    assert cli.get("/trips/x/budget").status_code == 401
    assert cli.put("/trips/x/budget/days/1", json={}).status_code == 401
    assert cli.post("/trips/x/budget/regenerate").status_code == 401
