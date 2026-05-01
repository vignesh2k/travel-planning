import json
from unittest.mock import MagicMock

from api.llm.research import get_travel_research


def _mock_completion(content: str) -> MagicMock:
    m = MagicMock()
    m.choices = [MagicMock(message=MagicMock(content=content))]
    return m


def test_get_travel_research_returns_document_and_places(monkeypatch) -> None:
    payload = {
        "document": "## Overview\n\nKyoto in autumn is glorious.\n\n## Neighbourhoods\n\nGion is the geisha district.",
        "places": [
            {"name": "Gion, Kyoto, Japan", "category": "neighbourhood", "description": "Historic geisha district."},
            {"name": "Kiyomizu-dera, Kyoto, Japan", "category": "photography_spot", "description": "Hilltop temple."},
        ],
    }
    fake_create = MagicMock(return_value=_mock_completion(json.dumps(payload)))
    monkeypatch.setattr(
        "api.llm.research.make_client",
        lambda: MagicMock(chat=MagicMock(completions=MagicMock(create=fake_create))),
    )

    result = get_travel_research("Kyoto, Japan", 7, "vegetarian, photography")

    assert "Overview" in result["document"]
    assert len(result["places"]) == 2
    assert result["places"][0]["category"] == "neighbourhood"
