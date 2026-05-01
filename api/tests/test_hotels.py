import json
from datetime import date
from unittest.mock import MagicMock

from api.llm.hotels import build_booking_url, suggest_hotels


def test_build_booking_url_has_prefilled_dates_and_search() -> None:
    url = build_booking_url(
        hotel_name="Hotel Granvia Kyoto",
        city="Kyoto, Japan",
        checkin=date(2026, 10, 15),
        checkout=date(2026, 10, 18),
        adults=2,
    )
    assert url.startswith("https://www.booking.com/searchresults.html?")
    assert "ss=Hotel+Granvia+Kyoto%2C+Kyoto%2C+Japan" in url
    assert "checkin=2026-10-15" in url
    assert "checkout=2026-10-18" in url
    assert "group_adults=2" in url


def _mock_completion(content: str) -> MagicMock:
    m = MagicMock()
    m.choices = [MagicMock(message=MagicMock(content=content))]
    return m


def test_suggest_hotels_returns_neighborhoods_with_hotels(monkeypatch) -> None:
    payload = [
        {
            "label": "Higashiyama",
            "description": "Old Kyoto, walk to temples.",
            "hotels": [
                {"name": "Park Hyatt Kyoto", "description": "Luxury, hilltop views."},
                {"name": "Seikoro Ryokan", "description": "Traditional ryokan."},
            ],
        },
        {
            "label": "Downtown",
            "description": "Central, near Nishiki.",
            "hotels": [
                {"name": "The Thousand Kyoto", "description": "Modern, near station."},
            ],
        },
    ]
    fake_create = MagicMock(return_value=_mock_completion(json.dumps(payload)))
    monkeypatch.setattr(
        "api.llm.hotels.make_client",
        lambda: MagicMock(chat=MagicMock(completions=MagicMock(create=fake_create))),
    )

    out = suggest_hotels(
        document="## Overview\n\nKyoto.",
        destination="Kyoto, Japan",
        days=7,
        start_date=date(2026, 10, 15),
        adults=2,
    )

    assert len(out) == 2
    assert out[0].label == "Higashiyama"
    assert len(out[0].hotels) == 2
    assert out[0].hotels[0].name == "Park Hyatt Kyoto"
    assert "checkin=2026-10-15" in out[0].hotels[0].booking_url


def test_suggest_hotels_handles_missing_start_date(monkeypatch) -> None:
    payload = [{"label": "Center", "description": "x", "hotels": [{"name": "A", "description": "x"}]}]
    fake_create = MagicMock(return_value=_mock_completion(json.dumps(payload)))
    monkeypatch.setattr(
        "api.llm.hotels.make_client",
        lambda: MagicMock(chat=MagicMock(completions=MagicMock(create=fake_create))),
    )

    out = suggest_hotels(
        document="x", destination="Kyoto", days=7, start_date=None, adults=2,
    )
    assert out[0].hotels[0].booking_url.startswith("https://www.booking.com/searchresults.html?")
    assert "checkin=" not in out[0].hotels[0].booking_url
