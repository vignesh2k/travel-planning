import time
import uuid
from datetime import date
from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient
from jose import jwt

from api.config import get_settings
from api.main import app
from api.models import Hotel, Neighborhood


def _token(user_id: str) -> str:
    return jwt.encode(
        {"sub": user_id, "email": "v@example.com",
         "exp": int(time.time()) + 3600, "aud": "authenticated"},
        get_settings().supabase_jwt_secret, algorithm="HS256",
    )


OWNER_ID = "owner-uid"


@pytest.fixture
def owner_headers() -> dict[str, str]:
    return {"Authorization": f"Bearer {_token(OWNER_ID)}"}


@pytest.fixture
def stranger_headers() -> dict[str, str]:
    return {"Authorization": f"Bearer {_token(str(uuid.uuid4()))}"}


def test_post_hotels_persists_neighborhoods(monkeypatch, owner_headers) -> None:
    existing = {
        "id": "t1", "slug": "kyoto-7d-aaa", "user_id": OWNER_ID, "destination": "Kyoto, Japan",
        "days": 7, "travel_style": "veg",
        "start_date": "2026-10-15", "airport_entry": None, "airport_exit": None,
        "document": {"document_markdown": "## x", "places": [], "neighborhoods": []},
        "places": [],
        "created_at": "2026-05-01T00:00:00+00:00",
    }
    table = MagicMock()
    chain = MagicMock()
    table.select.return_value = chain
    chain.eq.return_value = chain
    chain.single.return_value = chain
    chain.execute.return_value = MagicMock(data=existing)

    suggested = [
        Neighborhood(label="Higashiyama", description="x", hotels=[
            Hotel(name="Park Hyatt Kyoto", description="x", booking_url="https://..."),
        ]),
    ]
    monkeypatch.setattr("api.routes.hotels.suggest_hotels", lambda **kw: suggested)

    table.update.return_value.eq.return_value.execute.return_value = MagicMock(data=[{
        **existing,
        "document": {**existing["document"], "neighborhoods": [n.model_dump() for n in suggested]},
    }])

    client = MagicMock()
    client.table.return_value = table
    monkeypatch.setattr("api.routes.hotels.service_client", lambda: client)

    res = TestClient(app).post(
        "/trips/kyoto-7d-aaa/hotels",
        headers=owner_headers,
        json={"adults": 2},
    )

    assert res.status_code == 200, res.text
    body = res.json()
    assert len(body) == 1
    assert body[0]["label"] == "Higashiyama"
    assert body[0]["hotels"][0]["name"] == "Park Hyatt Kyoto"


def test_post_hotels_rejects_non_owner(monkeypatch, stranger_headers) -> None:
    existing = {
        "id": "t1", "slug": "kyoto-7d-aaa", "user_id": OWNER_ID, "destination": "Kyoto, Japan",
        "days": 7, "travel_style": "veg",
        "start_date": "2026-10-15", "airport_entry": None, "airport_exit": None,
        "document": {"document_markdown": "## x", "places": [], "neighborhoods": []},
        "places": [],
        "created_at": "2026-05-01T00:00:00+00:00",
    }
    table = MagicMock()
    chain = MagicMock()
    table.select.return_value = chain
    chain.eq.return_value = chain
    chain.single.return_value = chain
    chain.execute.return_value = MagicMock(data=existing)
    client = MagicMock()
    client.table.return_value = table
    monkeypatch.setattr("api.routes.hotels.service_client", lambda: client)

    res = TestClient(app).post(
        "/trips/kyoto-7d-aaa/hotels",
        headers=stranger_headers,
        json={"adults": 2},
    )
    assert res.status_code == 403
