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


def _trip_row(share_token=None) -> dict:
    return {"id": "t1", "user_id": OWNER_ID, "slug": "kyoto-7d-aaa",
            "share_token": share_token}


def _mock_db(trip_row=None, updated_row=None) -> MagicMock:
    select_chain = MagicMock()
    select_chain.select.return_value = select_chain
    select_chain.eq.return_value = select_chain
    select_chain.single.return_value = select_chain
    select_chain.execute.return_value = MagicMock(data=trip_row)

    select_chain.update.return_value = select_chain
    # Subsequent .execute() (after .update().eq()) — same chain returns updated row.
    select_chain.execute.return_value = MagicMock(data=trip_row)

    # Override for the update path: .update(...).eq(...).execute() returns the updated row.
    update_chain = MagicMock()
    update_chain.eq.return_value = update_chain
    update_chain.execute.return_value = MagicMock(data=[updated_row] if updated_row else [])
    select_chain.update.return_value = update_chain

    client = MagicMock()
    client.table.return_value = select_chain
    return client


def test_post_share_generates_token(monkeypatch, auth_headers):
    saved = {**_trip_row(), "share_token": "generated-token"}
    db = _mock_db(trip_row=_trip_row(), updated_row=saved)
    monkeypatch.setattr("api.routes.share.service_client", lambda: db)
    monkeypatch.setattr(
        "api.routes.share.secrets.token_urlsafe", lambda n: "generated-token",
    )

    res = TestClient(app).post(
        "/trips/kyoto-7d-aaa/share", headers=auth_headers,
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["token"] == "generated-token"
    assert body["share_url"].endswith("/s/generated-token")


def test_post_share_rotates_existing_token(monkeypatch, auth_headers):
    saved = {**_trip_row(share_token="old"), "share_token": "new"}
    db = _mock_db(trip_row=_trip_row(share_token="old"), updated_row=saved)
    monkeypatch.setattr("api.routes.share.service_client", lambda: db)
    monkeypatch.setattr(
        "api.routes.share.secrets.token_urlsafe", lambda n: "new",
    )

    res = TestClient(app).post(
        "/trips/kyoto-7d-aaa/share", headers=auth_headers,
    )
    assert res.status_code == 200, res.text
    assert res.json()["token"] == "new"


def test_post_share_403_when_not_owner(monkeypatch, auth_headers):
    other = {**_trip_row(), "user_id": "someone-else"}
    monkeypatch.setattr(
        "api.routes.share.service_client", lambda: _mock_db(trip_row=other),
    )
    res = TestClient(app).post(
        "/trips/kyoto-7d-aaa/share", headers=auth_headers,
    )
    assert res.status_code == 403


def test_post_share_404_when_trip_missing(monkeypatch, auth_headers):
    monkeypatch.setattr(
        "api.routes.share.service_client", lambda: _mock_db(trip_row=None),
    )
    res = TestClient(app).post(
        "/trips/missing/share", headers=auth_headers,
    )
    assert res.status_code == 404


def test_delete_share_clears_token(monkeypatch, auth_headers):
    cleared = {**_trip_row(share_token="abc"), "share_token": None}
    db = _mock_db(trip_row=_trip_row(share_token="abc"), updated_row=cleared)
    monkeypatch.setattr("api.routes.share.service_client", lambda: db)

    res = TestClient(app).delete(
        "/trips/kyoto-7d-aaa/share", headers=auth_headers,
    )
    assert res.status_code == 204


def test_delete_share_403_when_not_owner(monkeypatch, auth_headers):
    other = {**_trip_row(share_token="abc"), "user_id": "someone-else"}
    monkeypatch.setattr(
        "api.routes.share.service_client", lambda: _mock_db(trip_row=other),
    )
    res = TestClient(app).delete(
        "/trips/kyoto-7d-aaa/share", headers=auth_headers,
    )
    assert res.status_code == 403


def test_share_routes_require_auth():
    cli = TestClient(app)
    assert cli.post("/trips/x/share").status_code == 401
    assert cli.delete("/trips/x/share").status_code == 401
