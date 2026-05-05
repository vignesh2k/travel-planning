"""Defensive validation on TripDocument — the LLM occasionally hands us a
dict-keyed-by-section instead of a single markdown string, and corrupt rows
from before the validator existed are still in the DB."""

from api.models import TripDocument


def test_document_markdown_accepts_string():
    doc = TripDocument(
        document_markdown="## Day 1\n- Visit Kiyomizu-dera",
        places=[],
    )
    assert doc.document_markdown.startswith("## Day 1")


def test_document_markdown_coerces_dict_with_h2_keys():
    doc = TripDocument(
        document_markdown={
            "## Vegetarian Restaurants": "| A | B | C |\n",
            "## 4-Day Itinerary": "### Day 1: Higashiyama\n**Morning:**\n- Stuff",
        },
        places=[],
    )
    assert "## Vegetarian Restaurants" in doc.document_markdown
    assert "## 4-Day Itinerary" in doc.document_markdown
    assert "### Day 1: Higashiyama" in doc.document_markdown


def test_document_markdown_coerces_dict_without_h2_prefix():
    doc = TripDocument(
        document_markdown={
            "Vegetarian Restaurants": "x",
            "Itinerary": "y",
        },
        places=[],
    )
    # Non-h2 keys get the `## ` prefix added.
    assert "## Vegetarian Restaurants" in doc.document_markdown
    assert "## Itinerary" in doc.document_markdown


def test_trip_document_derives_structured_sections_from_markdown():
    doc = TripDocument(
        document_markdown="""## Vegetarian Restaurants
| Restaurant | Area | Must-Try |
| --- | --- | --- |
| Gion Soy | Gion | Tofu lunch set |

## 2-Day Itinerary
### Day 1: Higashiyama
**Morning:**
- Visit Kiyomizu-dera
- Walk Sannenzaka
**Afternoon:**
- Lunch at Gion Soy
**Evening:**
- Sunset at Yasaka Pagoda

### Day 2: Arashiyama
**Morning:**
- Bamboo Grove early walk
""",
        places=[],
    )

    assert doc.restaurants == [["Gion Soy", "Gion", "Tofu lunch set"]]
    assert [d.number for d in doc.itinerary] == [1, 2]
    assert doc.itinerary[0].title == "Higashiyama"
    assert doc.itinerary[0].bullets[0].time == "Morning"
    assert doc.itinerary[0].bullets[0].items == [
        "Visit Kiyomizu-dera",
        "Walk Sannenzaka",
    ]


# ── User profile ────────────────────────────────────────────────────────────


def test_user_profile_in_accepts_partial():
    from api.models import UserProfileIn

    p = UserProfileIn(diet="vegetarian")
    assert p.diet == "vegetarian"
    assert p.budget is None
    assert p.interests == []


def test_user_profile_in_rejects_invalid_budget():
    import pytest
    from pydantic import ValidationError

    from api.models import UserProfileIn

    with pytest.raises(ValidationError):
        UserProfileIn(budget="luxury")


def test_user_profile_in_accepts_all_fields():
    from api.models import UserProfileIn

    p = UserProfileIn(
        diet="pescatarian",
        budget="mid",
        pace="balanced",
        interests=["food", "photography"],
        notes="Knee injury",
    )
    assert p.budget == "mid"
    assert p.interests == ["food", "photography"]


# ── Budget ──────────────────────────────────────────────────────────────────


def test_budget_item_rejects_negative_amount():
    import pytest
    from pydantic import ValidationError

    from api.models import BudgetItem

    with pytest.raises(ValidationError):
        BudgetItem(name="Spa", amount=-5)


def test_budget_item_rejects_empty_name():
    import pytest
    from pydantic import ValidationError

    from api.models import BudgetItem

    with pytest.raises(ValidationError):
        BudgetItem(name="", amount=10)


def test_budget_day_in_caps_items_at_20():
    import pytest
    from pydantic import ValidationError

    from api.models import BudgetDayIn, BudgetItem

    too_many = [BudgetItem(name=f"x{i}", amount=1) for i in range(21)]
    with pytest.raises(ValidationError):
        BudgetDayIn(items=too_many)


def test_budget_day_in_accepts_null_override():
    from api.models import BudgetDayIn

    d = BudgetDayIn(override=None, items=[])
    assert d.override is None
    assert d.items == []


def test_pdf_costs_categories_are_typed():
    import pytest
    from pydantic import ValidationError

    from api.models import PdfCostCategory

    with pytest.raises(ValidationError):
        PdfCostCategory(name="Souvenirs", amount=100, gbp_amount=1)


def test_pdf_plan_accepts_optional_costs():
    from api.models import PdfPlan

    p = PdfPlan(destination="Kyoto", subtitle="x", days=[])
    assert p.costs is None


def test_parsed_brief_coerces_null_travel_style_to_empty():
    """The LLM returns null for travel_style on terse briefs like
    "5 days in Lisbon". Don't crash the trip stream."""
    from api.models import ParsedBrief

    p = ParsedBrief(destination="Lisbon", days=5, travel_style=None)
    assert p.travel_style == ""


def test_place_coerces_unknown_category_to_logistics():
    """The LLM occasionally invents categories like 'hiking' or 'nature'.
    Don't 500 the trip-fetch route — coerce to logistics."""
    from api.models import Place

    p = Place(name="Kyoto Trail", category="hiking", description="x")
    assert p.category == "logistics"

    p = Place(name="Random Mountain", category="nature", description="x")
    assert p.category == "logistics"


def test_place_aliases_known_synonyms():
    from api.models import Place

    assert Place(name="A", category="neighborhood", description="x").category == "neighbourhood"
    assert Place(name="A", category="cafe", description="x").category == "restaurant"
    assert Place(name="A", category="viewpoint", description="x").category == "photography_spot"
    assert Place(name="A", category="airport", description="x").category == "logistics"


# ── Sharing ─────────────────────────────────────────────────────────────────


def test_share_out_round_trips():
    from api.models import ShareOut

    s = ShareOut(share_url="https://atlas.viggy.dev/s/abc", token="abc")
    assert s.share_url.endswith("/s/abc")
    assert s.token == "abc"


def test_public_trip_excludes_personal_fields():
    from api.models import PublicTrip

    field_names = set(PublicTrip.model_fields.keys())
    assert "user_id" not in field_names
    assert "airport_entry" not in field_names
    assert "airport_exit" not in field_names
    assert "travel_style" not in field_names
    for f in ("slug", "destination", "days", "document"):
        assert f in field_names


def test_trip_full_accepts_optional_share_token():
    from datetime import datetime

    from api.models import TripDocument, TripFull

    t = TripFull(
        id="t1", slug="x-7d-aaa",
        destination="Kyoto", days=7, travel_style="x",
        start_date=None, airport_entry=None, airport_exit=None,
        document=TripDocument(document_markdown="x", places=[], neighborhoods=[]),
        created_at=datetime.now(),
    )
    assert t.share_token is None
