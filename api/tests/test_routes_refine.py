import time
import uuid
from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient
from jose import jwt

from api.config import get_settings
from api.main import app


def _token(user_id: str) -> str:
    return jwt.encode(
        {"sub": user_id, "email": "v@example.com",
         "exp": int(time.time()) + 3600, "aud": "authenticated"},
        get_settings().supabase_jwt_secret, algorithm="HS256",
    )


@pytest.fixture
def auth_headers() -> dict[str, str]:
    return {"Authorization": f"Bearer {_token(str(uuid.uuid4()))}"}


def test_refine_updates_document(monkeypatch, auth_headers) -> None:
    existing = {
        "id": "t1", "slug": "kyoto-7d-aaa", "user_id": "u", "destination": "Kyoto",
        "days": 7, "travel_style": "veg",
        "start_date": None, "airport_entry": None, "airport_exit": None,
        "document": {"document_markdown": "## Old", "places": [], "neighborhoods": []},
        "places": [],
        "created_at": "2026-05-01T00:00:00+00:00",
    }
    table = MagicMock()
    chain = MagicMock()
    table.select.return_value = chain
    chain.eq.return_value = chain
    chain.single.return_value = chain
    chain.execute.return_value = MagicMock(data=existing)
    table.update.return_value.eq.return_value.execute.return_value = MagicMock(
        data=[{**existing, "document": {**existing["document"],
               "document_markdown": "## Updated"}}]
    )
    table.insert.return_value.execute.return_value = MagicMock(data=[{"id": "m1"}])

    client = MagicMock()
    client.table.return_value = table
    monkeypatch.setattr("api.routes.refine.service_client", lambda: client)
    monkeypatch.setattr("api.routes.refine.refine_document", lambda d, i: "## Updated")

    res = TestClient(app).post(
        "/trips/kyoto-7d-aaa/refine",
        headers=auth_headers,
        json={"instruction": "make day 2 less touristy"},
    )

    assert res.status_code == 200, res.text
    assert res.json()["document"]["document_markdown"] == "## Updated"
