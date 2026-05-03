import time
import uuid
from typing import Any
from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient
from jose import jwt

from api.config import get_settings
from api.main import app


def _token(user_id: str) -> str:
    return jwt.encode(
        {
            "sub": user_id,
            "email": "v@example.com",
            "exp": int(time.time()) + 3600,
            "aud": "authenticated",
        },
        get_settings().supabase_jwt_secret,
        algorithm="HS256",
    )


@pytest.fixture
def auth_headers() -> dict[str, str]:
    return {"Authorization": f"Bearer {_token(str(uuid.uuid4()))}"}


def _mock_supabase_insert(returned_row: dict[str, Any]) -> MagicMock:
    """Build a Supabase client mock whose .table().insert().execute() returns rows."""
    table = MagicMock()
    table.insert.return_value.execute.return_value = MagicMock(data=[returned_row])
    client = MagicMock()
    client.table.return_value = table
    return client


def test_post_trips_creates_and_returns_trip(monkeypatch, auth_headers) -> None:
    monkeypatch.setattr(
        "api.routes.trips.parse_brief",
        lambda b: MagicMock(
            destination="Kyoto, Japan",
            days=7,
            travel_style="vegetarian, photography",
            start_date=None,
            airport_entry=None,
            airport_exit=None,
        ),
    )
    monkeypatch.setattr(
        "api.routes.trips.get_travel_research",
        lambda d, l, s: {
            "document": "## Overview\n\nKyoto.",
            "places": [{"name": "Gion, Kyoto", "category": "neighbourhood", "description": "x"}],
        },
    )
    monkeypatch.setattr("api.routes.trips.geocode_place", lambda n: (35.0, 135.7))

    inserted_row = {
        "id": str(uuid.uuid4()),
        "slug": "kyoto-japan-7d-abc123",
        "user_id": "u",
        "destination": "Kyoto, Japan",
        "days": 7,
        "travel_style": "vegetarian, photography",
        "start_date": None,
        "airport_entry": None,
        "airport_exit": None,
        "document": {
            "document_markdown": "## Overview\n\nKyoto.",
            "places": [{"name": "Gion, Kyoto", "category": "neighbourhood",
                        "description": "x", "lat": 35.0, "lng": 135.7}],
            "neighborhoods": [],
        },
        "places": [],
        "created_at": "2026-05-01T00:00:00+00:00",
    }
    monkeypatch.setattr("api.routes.trips.service_client", lambda: _mock_supabase_insert(inserted_row))

    res = TestClient(app).post(
        "/trips",
        headers=auth_headers,
        json={"text": "7 days in Kyoto, vegetarian, photography"},
    )

    assert res.status_code == 200, res.text
    body = res.json()
    assert body["slug"] == "kyoto-japan-7d-abc123"
    assert body["destination"] == "Kyoto, Japan"
    assert body["document"]["document_markdown"].startswith("## Overview")


def test_post_trips_requires_auth() -> None:
    res = TestClient(app).post("/trips", json={"text": "Kyoto"})
    assert res.status_code == 401


def _mock_supabase_select(rows: list[dict]) -> MagicMock:
    table = MagicMock()
    chain = MagicMock()
    table.select.return_value = chain
    chain.eq.return_value = chain
    chain.order.return_value = chain
    chain.limit.return_value = chain
    chain.single.return_value = chain
    chain.execute.return_value = MagicMock(data=rows if len(rows) != 1 else rows[0])
    client = MagicMock()
    client.table.return_value = table
    return client


def test_list_trips_returns_summaries(monkeypatch, auth_headers) -> None:
    rows = [
        {
            "id": "t1", "slug": "kyoto-7d-aaa", "destination": "Kyoto",
            "days": 7, "created_at": "2026-05-01T00:00:00+00:00",
        }
    ]
    monkeypatch.setattr("api.routes.trips.service_client", lambda: _mock_supabase_select(rows))

    res = TestClient(app).get("/trips", headers=auth_headers)
    assert res.status_code == 200
    body = res.json()
    assert len(body) == 1
    assert body[0]["slug"] == "kyoto-7d-aaa"


def test_get_trip_by_slug_returns_full_trip(monkeypatch, auth_headers) -> None:
    row = {
        "id": "t1", "slug": "kyoto-7d-aaa", "user_id": "u", "destination": "Kyoto",
        "days": 7, "travel_style": "veg",
        "start_date": None, "airport_entry": None, "airport_exit": None,
        "document": {"document_markdown": "x", "places": [], "neighborhoods": []},
        "places": [],
        "created_at": "2026-05-01T00:00:00+00:00",
    }
    monkeypatch.setattr("api.routes.trips.service_client", lambda: _mock_supabase_select([row]))

    res = TestClient(app).get("/trips/kyoto-7d-aaa", headers=auth_headers)
    assert res.status_code == 200
    assert res.json()["slug"] == "kyoto-7d-aaa"


def test_post_trips_stream_emits_events(monkeypatch, auth_headers) -> None:
    monkeypatch.setattr(
        "api.routes.trips.parse_brief",
        lambda b: MagicMock(
            destination="Kyoto", days=7, travel_style="veg",
            start_date=None, airport_entry=None, airport_exit=None,
        ),
    )
    def fake_stream_research(d, l, s):
        yield ("progress", {"chars": 250})
        yield ("progress", {"chars": 500})
        yield ("result", {
            "document": "## x",
            "places": [{"name": "Gion", "category": "neighbourhood", "description": "x"}],
        })
    monkeypatch.setattr("api.routes.trips.stream_travel_research", fake_stream_research)
    monkeypatch.setattr("api.routes.trips.geocode_place", lambda n: (35.0, 135.7))

    inserted = {
        "id": "t1", "slug": "kyoto-7d-zzz", "user_id": "u", "destination": "Kyoto",
        "days": 7, "travel_style": "veg",
        "start_date": None, "airport_entry": None, "airport_exit": None,
        "document": {"document_markdown": "## x",
                     "places": [{"name": "Gion", "category": "neighbourhood",
                                 "description": "x", "lat": 35.0, "lng": 135.7}],
                     "neighborhoods": []},
        "places": [],
        "created_at": "2026-05-01T00:00:00+00:00",
    }
    table = MagicMock()
    table.insert.return_value.execute.return_value = MagicMock(data=[inserted])
    client = MagicMock()
    client.table.return_value = table
    monkeypatch.setattr("api.routes.trips.service_client", lambda: client)

    with TestClient(app).stream(
        "POST", "/trips/stream",
        headers=auth_headers,
        json={"text": "Kyoto"},
    ) as res:
        assert res.status_code == 200
        body = res.read().decode()

    assert "event: status" in body
    assert "event: progress" in body
    assert "event: place" in body
    assert "event: done" in body
    assert "kyoto-7d-zzz" in body


OWNER_ID = "owner-uid"


@pytest.fixture
def owner_headers() -> dict[str, str]:
    return {"Authorization": f"Bearer {_token(OWNER_ID)}"}


def _mock_supabase_select_then_delete(row: dict) -> MagicMock:
    table = MagicMock()
    chain = MagicMock()
    table.select.return_value = chain
    chain.eq.return_value = chain
    chain.single.return_value = chain
    chain.execute.return_value = MagicMock(data=row)
    table.delete.return_value.eq.return_value.execute.return_value = MagicMock(data=[row])
    client = MagicMock()
    client.table.return_value = table
    return client


def test_delete_trip_owner_succeeds(monkeypatch, owner_headers) -> None:
    monkeypatch.setattr(
        "api.routes.trips.service_client",
        lambda: _mock_supabase_select_then_delete({"user_id": OWNER_ID}),
    )
    res = TestClient(app).delete("/trips/kyoto-7d-aaa", headers=owner_headers)
    assert res.status_code == 200
    assert res.json() == {"ok": True}


def test_delete_trip_non_owner_403(monkeypatch, auth_headers) -> None:
    monkeypatch.setattr(
        "api.routes.trips.service_client",
        lambda: _mock_supabase_select_then_delete({"user_id": OWNER_ID}),
    )
    res = TestClient(app).delete("/trips/kyoto-7d-aaa", headers=auth_headers)
    assert res.status_code == 403


def test_delete_trip_missing_404(monkeypatch, auth_headers) -> None:
    table = MagicMock()
    chain = MagicMock()
    table.select.return_value = chain
    chain.eq.return_value = chain
    chain.single.return_value = chain
    chain.execute.return_value = MagicMock(data=None)
    client = MagicMock()
    client.table.return_value = table
    monkeypatch.setattr("api.routes.trips.service_client", lambda: client)
    res = TestClient(app).delete("/trips/missing-slug", headers=auth_headers)
    assert res.status_code == 404


def test_post_trips_stream_uses_profile_when_present(monkeypatch, auth_headers) -> None:
    """When a profile is set, the addendum prefixes travel_style going to research."""
    from datetime import datetime, timezone

    from api.models import UserProfile

    captured_style: dict[str, str] = {}

    def fake_stream_research(d, l, s):
        captured_style["s"] = s
        yield ("result", {"document": "## x", "places": []})

    monkeypatch.setattr(
        "api.routes.trips.parse_brief",
        lambda b: MagicMock(
            destination="Kyoto", days=7, travel_style="brief style",
            start_date=None, airport_entry=None, airport_exit=None,
        ),
    )
    monkeypatch.setattr("api.routes.trips.stream_travel_research", fake_stream_research)
    monkeypatch.setattr("api.routes.trips.geocode_place", lambda n: (35.0, 135.7))
    monkeypatch.setattr(
        "api.routes.trips.fetch_profile_for",
        lambda uid: UserProfile(
            diet="vegan", budget="mid", pace=None, interests=["food"],
            notes=None, updated_at=datetime.now(timezone.utc),
        ),
    )

    inserted = {
        "id": "t1", "slug": "kyoto-7d-prof", "user_id": "u", "destination": "Kyoto",
        "days": 7, "travel_style": "vegan. mid budget. Interests: food. brief style",
        "start_date": None, "airport_entry": None, "airport_exit": None,
        "document": {"document_markdown": "## x", "places": [], "neighborhoods": []},
        "places": [], "created_at": "2026-05-03T00:00:00+00:00",
    }
    table = MagicMock()
    table.insert.return_value.execute.return_value = MagicMock(data=[inserted])
    client = MagicMock()
    client.table.return_value = table
    monkeypatch.setattr("api.routes.trips.service_client", lambda: client)

    with TestClient(app).stream(
        "POST", "/trips/stream",
        headers=auth_headers, json={"text": "Kyoto"},
    ) as res:
        res.read()

    assert "vegan" in captured_style["s"]
    assert "mid budget" in captured_style["s"]
    assert "brief style" in captured_style["s"]
