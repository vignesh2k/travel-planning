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
