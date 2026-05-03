from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient

from api.main import app


def _trip_row(share_token: str | None) -> dict:
    return {
        "slug": "kyoto-7d-aaa",
        "destination": "Kyoto",
        "days": 7,
        "start_date": None,
        "document": {
            "document_markdown": "## Day 1",
            "places": [],
            "neighborhoods": [],
        },
        "created_at": "2026-05-01T00:00:00+00:00",
    }


def _mock_db(row: dict | None) -> MagicMock:
    chain = MagicMock()
    chain.select.return_value = chain
    chain.eq.return_value = chain
    chain.maybe_single.return_value = chain
    chain.execute.return_value = MagicMock(data=row)
    client = MagicMock()
    client.table.return_value = chain
    return client


def test_public_get_returns_trip_minus_personal_fields(monkeypatch):
    monkeypatch.setattr(
        "api.routes.public.service_client",
        lambda: _mock_db(_trip_row("abc")),
    )
    res = TestClient(app).get("/public/trips/abc")
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["destination"] == "Kyoto"
    assert body["days"] == 7
    # Personal fields must NOT be present.
    assert "user_id" not in body
    assert "airport_entry" not in body
    assert "airport_exit" not in body
    assert "travel_style" not in body


def test_public_get_404_when_token_missing(monkeypatch):
    monkeypatch.setattr(
        "api.routes.public.service_client", lambda: _mock_db(None),
    )
    res = TestClient(app).get("/public/trips/garbage")
    assert res.status_code == 404


def test_public_get_does_not_require_auth():
    """No Authorization header — should NOT return 401."""
    with patch("api.routes.public.service_client", return_value=_mock_db(None)):
        res = TestClient(app).get("/public/trips/whatever")
    assert res.status_code != 401
