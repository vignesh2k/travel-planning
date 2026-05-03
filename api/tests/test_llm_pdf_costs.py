from unittest.mock import MagicMock, patch

from api.llm.pdf_costs import estimate_pdf_costs


def _fake_response(content: str) -> MagicMock:
    msg = MagicMock(content=content)
    choice = MagicMock(message=msg)
    return MagicMock(choices=[choice])


def _patched_client(payload: str):
    fake_client = MagicMock()
    fake_client.chat.completions.create.return_value = _fake_response(payload)
    return patch("api.llm.pdf_costs.make_client", return_value=fake_client)


def test_estimate_pdf_costs_returns_four_categories():
    payload = (
        '{"currency":"JPY","categories":['
        '{"name":"Lodging","amount":80000},'
        '{"name":"Food","amount":40000},'
        '{"name":"Activities","amount":30000},'
        '{"name":"Transport","amount":15000}'
        "]}"
    )
    with _patched_client(payload):
        out = estimate_pdf_costs(
            destination="Kyoto",
            travel_style="vegetarian, mid budget",
            day_titles=["Arrival", "Temples"],
            day_estimates=[18000, 22000],
            hotel_names=["Hotel Granvia"],
            gbp_rate=0.0052,
        )
    assert out.currency == "JPY"
    assert {c.name for c in out.categories} == {
        "Lodging", "Food", "Activities", "Transport",
    }
    lodging = next(c for c in out.categories if c.name == "Lodging")
    assert lodging.amount == 80000
    assert lodging.gbp_amount == round(80000 * 0.0052)
    assert out.total_local == 80000 + 40000 + 30000 + 15000


def test_estimate_pdf_costs_strips_fences():
    payload = (
        "```json\n"
        '{"currency":"EUR","categories":['
        '{"name":"Lodging","amount":300},'
        '{"name":"Food","amount":150},'
        '{"name":"Activities","amount":100},'
        '{"name":"Transport","amount":40}'
        "]}\n```"
    )
    with _patched_client(payload):
        out = estimate_pdf_costs(
            destination="Lisbon", travel_style="", day_titles=[],
            day_estimates=[], hotel_names=[], gbp_rate=0.85,
        )
    assert out.currency == "EUR"
    assert out.total_local == 590
