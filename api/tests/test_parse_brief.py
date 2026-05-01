import json
from datetime import date
from unittest.mock import MagicMock

from api.llm.parse_brief import parse_brief
from api.models import TripBriefIn


def _mock_completion(content: str) -> MagicMock:
    m = MagicMock()
    m.choices = [MagicMock(message=MagicMock(content=content))]
    return m


def test_parse_brief_extracts_destination_and_days(monkeypatch) -> None:
    payload = {
        "destination": "Kyoto, Japan",
        "days": 7,
        "travel_style": "vegetarian, photography focus",
        "start_date": "2026-10-15",
        "airport_entry": None,
        "airport_exit": None,
    }
    fake_create = MagicMock(return_value=_mock_completion(json.dumps(payload)))
    monkeypatch.setattr(
        "api.llm.parse_brief.make_client",
        lambda: MagicMock(chat=MagicMock(completions=MagicMock(create=fake_create))),
    )

    parsed = parse_brief(TripBriefIn(text="7 days in Kyoto, vegetarian, photography, mid-October"))

    assert parsed.destination == "Kyoto, Japan"
    assert parsed.days == 7
    assert parsed.start_date == date(2026, 10, 15)
    assert "vegetarian" in parsed.travel_style.lower()


def test_parse_brief_uses_structured_overrides(monkeypatch) -> None:
    payload = {
        "destination": "Kyoto, Japan",
        "days": 7,
        "travel_style": "vegetarian",
        "start_date": None,
        "airport_entry": None,
        "airport_exit": None,
    }
    fake_create = MagicMock(return_value=_mock_completion(json.dumps(payload)))
    monkeypatch.setattr(
        "api.llm.parse_brief.make_client",
        lambda: MagicMock(chat=MagicMock(completions=MagicMock(create=fake_create))),
    )

    brief = TripBriefIn(
        text="Kyoto trip",
        start_date=date(2026, 10, 15),
        airport_entry="LHR",
        airport_exit="NRT",
    )
    parsed = parse_brief(brief)

    assert parsed.start_date == date(2026, 10, 15)
    assert parsed.airport_entry == "LHR"
    assert parsed.airport_exit == "NRT"
