import json
from unittest.mock import MagicMock

from api.llm.suggestions import get_suggestions


def _mock_completion(content: str) -> MagicMock:
    m = MagicMock()
    m.choices = [MagicMock(message=MagicMock(content=content))]
    return m


def test_get_suggestions_returns_string_list(monkeypatch) -> None:
    payload = ["Kiyomizu-dera at dawn", "Bamboo grove walk", "Nishiki market food tour"]
    fake_create = MagicMock(return_value=_mock_completion(json.dumps(payload)))
    monkeypatch.setattr(
        "api.llm.suggestions.make_client",
        lambda: MagicMock(chat=MagicMock(completions=MagicMock(create=fake_create))),
    )

    out = get_suggestions("Kyoto, Japan")
    assert out == payload


def test_get_suggestions_strips_code_fences(monkeypatch) -> None:
    fenced = '```json\n["Foo", "Bar"]\n```'
    fake_create = MagicMock(return_value=_mock_completion(fenced))
    monkeypatch.setattr(
        "api.llm.suggestions.make_client",
        lambda: MagicMock(chat=MagicMock(completions=MagicMock(create=fake_create))),
    )

    out = get_suggestions("Kyoto")
    assert out == ["Foo", "Bar"]
