import time
from typing import Any
from unittest.mock import MagicMock

from fastapi.testclient import TestClient
from jose import jwt

from api.config import get_settings
from api.main import app


OWNER_ID = "document-owner"


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


def _headers(user_id: str = OWNER_ID) -> dict[str, str]:
    return {"Authorization": f"Bearer {_token(user_id)}"}


def _document(**overrides: Any) -> dict[str, Any]:
    base: dict[str, Any] = {
        "document_markdown": "## Overview\n\nKyoto.",
        "places": [],
        "neighborhoods": [],
        "restaurants": [],
        "itinerary": [
            {
                "number": 1,
                "title": "Arrival",
                "bullets": [{"time": "Morning", "items": ["Land and coffee"]}],
            }
        ],
        "planning": {
            "statuses": {},
            "notes": {},
            "dismissed_health_checks": [],
            "last_editor_version": 1,
        },
    }
    base.update(overrides)
    return base


def _trip_row(document: dict[str, Any] | None = None, *, owner: str = OWNER_ID) -> dict[str, Any]:
    return {
        "id": "trip-document-1",
        "slug": "kyoto-2d-doc",
        "user_id": owner,
        "destination": "Kyoto",
        "days": 2,
        "travel_style": "vegetarian",
        "start_date": None,
        "airport_entry": None,
        "airport_exit": None,
        "document": document or _document(),
        "places": [],
        "share_token": None,
        "is_saved": True,
        "created_at": "2026-05-01T00:00:00+00:00",
    }


def _mock_get_then_update(initial: dict[str, Any] | None, updated: dict[str, Any] | None) -> tuple[MagicMock, MagicMock]:
    table = MagicMock()

    select_chain = MagicMock()
    table.select.return_value = select_chain
    select_chain.eq.return_value = select_chain
    select_chain.single.return_value = select_chain
    select_chain.execute.return_value = MagicMock(data=initial)

    update_chain = MagicMock()
    table.update.return_value = update_chain
    update_chain.eq.return_value = update_chain
    update_chain.execute.return_value = MagicMock(data=[updated] if updated else [])

    client = MagicMock()
    client.table.return_value = table
    return client, table.update


def test_patch_trip_document_persists_itinerary_and_planning(monkeypatch) -> None:
    next_document = _document(
        itinerary=[
            {
                "number": 1,
                "title": "Arrival",
                "bullets": [{"time": "Morning", "items": ["Land, coffee, and Nishiki Market"]}],
            }
        ],
        planning={
            "statuses": {"day-1-morning-0": "booked"},
            "notes": {"day-1-morning-0": "Reservation confirmed"},
            "dismissed_health_checks": ["missing-start-date"],
            "last_editor_version": 1,
        },
    )
    updated = _trip_row(next_document)
    client, update_call = _mock_get_then_update(_trip_row(), updated)
    monkeypatch.setattr("api.routes.trips.service_client", lambda: client)

    res = TestClient(app).patch(
        "/trips/kyoto-2d-doc/document",
        headers=_headers(),
        json={"document": next_document},
    )

    assert res.status_code == 200, res.text
    assert res.json()["document"]["itinerary"][0]["bullets"][0]["items"][0] == "Land, coffee, and Nishiki Market"
    assert res.json()["document"]["planning"]["statuses"]["day-1-morning-0"] == "booked"
    update_call.assert_called_once()
    assert update_call.call_args.args[0]["document"]["planning"]["dismissed_health_checks"] == ["missing-start-date"]


def test_patch_trip_document_adds_default_planning_for_old_documents(monkeypatch) -> None:
    old_document = {
        "document_markdown": "## Overview\n\nKyoto.",
        "places": [],
        "neighborhoods": [],
        "itinerary": [],
    }
    updated = _trip_row(_document())
    client, update_call = _mock_get_then_update(_trip_row(old_document), updated)
    monkeypatch.setattr("api.routes.trips.service_client", lambda: client)

    res = TestClient(app).patch(
        "/trips/kyoto-2d-doc/document",
        headers=_headers(),
        json={"document": old_document},
    )

    assert res.status_code == 200, res.text
    assert update_call.call_args.args[0]["document"]["planning"]["last_editor_version"] == 1


def test_patch_trip_document_403_when_not_owner(monkeypatch) -> None:
    client, _ = _mock_get_then_update(_trip_row(owner="someone-else"), _trip_row(owner="someone-else"))
    monkeypatch.setattr("api.routes.trips.service_client", lambda: client)

    res = TestClient(app).patch(
        "/trips/kyoto-2d-doc/document",
        headers=_headers(),
        json={"document": _document()},
    )

    assert res.status_code == 403


def test_patch_trip_document_404_when_missing(monkeypatch) -> None:
    client, _ = _mock_get_then_update(None, None)
    monkeypatch.setattr("api.routes.trips.service_client", lambda: client)

    res = TestClient(app).patch(
        "/trips/missing/document",
        headers=_headers(),
        json={"document": _document()},
    )

    assert res.status_code == 404


def test_patch_trip_document_requires_auth() -> None:
    res = TestClient(app).patch("/trips/kyoto-2d-doc/document", json={"document": _document()})
    assert res.status_code == 401
