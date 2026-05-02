from api.llm.quick_extract import quick_extract


def test_extracts_days_in_destination():
    assert quick_extract("7 days in Kyoto, vegetarian, photography focus") == ("Kyoto", 7)


def test_extracts_destination_for_days():
    assert quick_extract("Lisbon for 4 days, cheap eats") == ("Lisbon", 4)


def test_extracts_through_pattern():
    assert quick_extract("10 days through Vietnam, street food focus") == ("Vietnam", 10)


def test_handles_multi_word_destination():
    dest, days = quick_extract("5 days in New York City")
    assert dest is not None
    assert "New York" in dest
    assert days == 5


def test_weekend_resolves_to_three_days():
    assert quick_extract("A long weekend in Lisbon") == ("Lisbon", 4)


def test_returns_none_for_vague_brief():
    assert quick_extract("Surprise me") == (None, None)


def test_returns_none_for_no_destination():
    assert quick_extract("7 days of relaxation") == (None, None)


def test_rejects_huge_day_count():
    assert quick_extract("365 days in Tokyo") == (None, None)
