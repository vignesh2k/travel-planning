from unittest.mock import MagicMock

from api.llm.refine import refine_document


def _mock_completion(content: str) -> MagicMock:
    m = MagicMock()
    m.choices = [MagicMock(message=MagicMock(content=content))]
    return m


def test_refine_returns_updated_markdown(monkeypatch) -> None:
    fake_create = MagicMock(return_value=_mock_completion("## Overview\n\nUpdated doc."))
    monkeypatch.setattr(
        "api.llm.refine.make_client",
        lambda: MagicMock(chat=MagicMock(completions=MagicMock(create=fake_create))),
    )

    out = refine_document("## Overview\n\nOld doc.", "Make day 2 less touristy")
    assert "Updated doc" in out
