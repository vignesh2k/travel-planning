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


def _mock_db_select(row: dict | None) -> MagicMock:
    table = MagicMock()
    chain = MagicMock()
    table.select.return_value = chain
    chain.eq.return_value = chain
    chain.maybe_single.return_value = chain
    chain.execute.return_value = MagicMock(data=row)
    client = MagicMock()
    client.table.return_value = table
    return client


def _mock_db_upsert(returned_row: dict) -> MagicMock:
    table = MagicMock()
    table.upsert.return_value.execute.return_value = MagicMock(data=[returned_row])
    client = MagicMock()
    client.table.return_value = table
    return client


def test_get_profile_returns_null_when_unset(monkeypatch, auth_headers):
    monkeypatch.setattr("api.routes.profile.service_client",
                        lambda: _mock_db_select(None))
    res = TestClient(app).get("/me/profile", headers=auth_headers)
    assert res.status_code == 200
    assert res.json() is None


def test_get_profile_returns_row_when_set(monkeypatch, auth_headers):
    row = {
        "diet": "vegetarian", "budget": "mid", "pace": "balanced",
        "interests": ["food"], "notes": None,
        "updated_at": "2026-05-03T10:00:00+00:00",
    }
    monkeypatch.setattr("api.routes.profile.service_client",
                        lambda: _mock_db_select(row))
    res = TestClient(app).get("/me/profile", headers=auth_headers)
    assert res.status_code == 200
    body = res.json()
    assert body["diet"] == "vegetarian"
    assert body["budget"] == "mid"


def test_put_profile_upserts_and_returns(monkeypatch, auth_headers):
    saved = {
        "user_id": OWNER_ID,
        "diet": "vegan", "budget": "mid", "pace": "relaxed",
        "interests": ["photography"], "notes": "no fish",
        "updated_at": "2026-05-03T10:00:00+00:00",
    }
    monkeypatch.setattr("api.routes.profile.service_client",
                        lambda: _mock_db_upsert(saved))
    res = TestClient(app).put(
        "/me/profile",
        headers=auth_headers,
        json={"diet": "vegan", "budget": "mid", "pace": "relaxed",
              "interests": ["photography"], "notes": "no fish"},
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["diet"] == "vegan"
    assert body["interests"] == ["photography"]


def test_put_profile_rejects_invalid_budget(monkeypatch, auth_headers):
    monkeypatch.setattr("api.routes.profile.service_client",
                        lambda: _mock_db_upsert({}))
    res = TestClient(app).put(
        "/me/profile",
        headers=auth_headers,
        json={"budget": "luxury"},
    )
    assert res.status_code == 422


def test_endpoints_require_auth():
    assert TestClient(app).get("/me/profile").status_code == 401
    assert TestClient(app).put("/me/profile", json={}).status_code == 401


def test_fetch_profile_for_returns_none_when_missing(monkeypatch):
    from api.routes.profile import fetch_profile_for

    monkeypatch.setattr("api.routes.profile.service_client",
                        lambda: _mock_db_select(None))
    assert fetch_profile_for("u1") is None


def test_fetch_profile_for_returns_profile_when_set(monkeypatch):
    from api.routes.profile import fetch_profile_for

    row = {
        "diet": "vegan", "budget": "mid", "pace": None,
        "interests": [], "notes": None,
        "updated_at": "2026-05-03T10:00:00+00:00",
    }
    monkeypatch.setattr("api.routes.profile.service_client",
                        lambda: _mock_db_select(row))
    p = fetch_profile_for("u1")
    assert p is not None
    assert p.diet == "vegan"
