from datetime import date
from unittest.mock import MagicMock, patch

import pytest

from api import fx


@pytest.fixture(autouse=True)
def _clear_cache():
    fx._cache.clear()


def test_gbp_to_gbp_short_circuits():
    rate = fx.get_gbp_rate("GBP")
    assert rate.rate == 1.0
    assert rate.fetched_on == date.today()


def test_fetch_jpy_to_gbp():
    fake = MagicMock()
    fake.json.return_value = {"date": "2026-05-03", "rates": {"GBP": 0.0052}}
    fake.raise_for_status.return_value = None
    with patch("api.fx.httpx.get", return_value=fake) as mock_get:
        rate = fx.get_gbp_rate("JPY")
    assert rate.rate == 0.0052
    assert rate.fetched_on == date(2026, 5, 3)
    mock_get.assert_called_once()
    assert "from=JPY" in mock_get.call_args[0][0]
    assert "to=GBP" in mock_get.call_args[0][0]
    assert mock_get.call_args.kwargs.get("follow_redirects") is True


def test_cache_avoids_second_fetch_within_24h():
    fake = MagicMock()
    fake.json.return_value = {"date": "2026-05-03", "rates": {"GBP": 0.0052}}
    fake.raise_for_status.return_value = None
    with patch("api.fx.httpx.get", return_value=fake) as mock_get:
        fx.get_gbp_rate("JPY")
        fx.get_gbp_rate("JPY")
    assert mock_get.call_count == 1


def test_lowercase_currency_normalised():
    fake = MagicMock()
    fake.json.return_value = {"date": "2026-05-03", "rates": {"GBP": 1.17}}
    fake.raise_for_status.return_value = None
    with patch("api.fx.httpx.get", return_value=fake):
        rate = fx.get_gbp_rate("eur")
    assert rate.rate == 1.17
