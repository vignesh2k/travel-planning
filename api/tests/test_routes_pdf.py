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


def test_get_pdf_returns_pdf_bytes(monkeypatch) -> None:
    OWNER = "owner-pdf"
    row = {
        "id": "t1", "slug": "kyoto-7d-aaa", "user_id": OWNER, "destination": "Kyoto, Japan",
        "days": 7, "travel_style": "veg",
        "start_date": None, "airport_entry": None, "airport_exit": None,
        "document": {"document_markdown": "## Overview\n\nKyoto.", "places": [], "neighborhoods": []},
        "places": [],
        "created_at": "2026-05-01T00:00:00+00:00",
    }
    table = MagicMock()
    chain = MagicMock()
    table.select.return_value = chain
    chain.eq.return_value = chain
    chain.single.return_value = chain
    chain.execute.return_value = MagicMock(data=row)
    client = MagicMock()
    client.table.return_value = table
    monkeypatch.setattr("api.routes.pdf.service_client", lambda: client)

    headers = {"Authorization": f"Bearer {_token(OWNER)}"}
    res = TestClient(app).get("/trips/kyoto-7d-aaa/pdf", headers=headers)

    assert res.status_code == 200
    assert res.headers["content-type"] == "application/pdf"
    assert res.content.startswith(b"%PDF-")


def test_get_pdf_403_when_not_owner(monkeypatch) -> None:
    row = {
        "id": "t1", "slug": "kyoto-7d-aaa", "user_id": "alice", "destination": "Kyoto",
        "days": 7, "travel_style": "veg",
        "start_date": None, "airport_entry": None, "airport_exit": None,
        "document": {"document_markdown": "x", "places": [], "neighborhoods": []},
        "places": [], "created_at": "2026-05-01T00:00:00+00:00",
    }
    table = MagicMock()
    chain = MagicMock()
    table.select.return_value = chain
    chain.eq.return_value = chain
    chain.single.return_value = chain
    chain.execute.return_value = MagicMock(data=row)
    client = MagicMock()
    client.table.return_value = table
    monkeypatch.setattr("api.routes.pdf.service_client", lambda: client)

    headers = {"Authorization": f"Bearer {_token('bob')}"}
    res = TestClient(app).get("/trips/kyoto-7d-aaa/pdf", headers=headers)
    assert res.status_code == 403
