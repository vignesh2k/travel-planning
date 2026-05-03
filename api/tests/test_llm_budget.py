from unittest.mock import MagicMock, patch

import pytest

from api.llm.budget import budget_estimate


def _fake_response(content: str) -> MagicMock:
    msg = MagicMock(content=content)
    choice = MagicMock(message=msg)
    return MagicMock(choices=[choice])


def _patched_client(payload: str):
    fake_client = MagicMock()
    fake_client.chat.completions.create.return_value = _fake_response(payload)
    return patch("api.llm.budget.make_client", return_value=fake_client)


def test_budget_estimate_returns_per_day_numbers():
    payload = (
        '{"currency": "JPY", "days": ['
        '{"number": 1, "estimated": 18000},'
        '{"number": 2, "estimated": 22000}'
        "]}"
    )
    with _patched_client(payload):
        out = budget_estimate("Kyoto", 2, "vegetarian, mid budget")
    assert out.currency == "JPY"
    assert len(out.days) == 2
    assert out.days[0].estimated == 18000
    assert out.days[1].number == 2


def test_budget_estimate_strips_markdown_fences():
    payload = '```json\n{"currency": "EUR", "days": [{"number": 1, "estimated": 120}]}\n```'
    with _patched_client(payload):
        out = budget_estimate("Lisbon", 1, "")
    assert out.currency == "EUR"
    assert out.days[0].estimated == 120


def test_budget_estimate_raises_on_invalid_json():
    with _patched_client("not json"):
        with pytest.raises(ValueError):
            budget_estimate("Kyoto", 2, "")
