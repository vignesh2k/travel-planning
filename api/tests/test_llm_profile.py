from datetime import datetime, timezone

from api.llm.profile import profile_addendum
from api.models import UserProfile


def _profile(**overrides) -> UserProfile:
    base = {
        "diet": None,
        "budget": None,
        "pace": None,
        "interests": [],
        "notes": None,
        "updated_at": datetime.now(timezone.utc),
    }
    base.update(overrides)
    return UserProfile(**base)


def test_empty_profile_returns_empty_string():
    assert profile_addendum(None) == ""
    assert profile_addendum(_profile()) == ""


def test_diet_only():
    assert profile_addendum(_profile(diet="vegetarian")) == "vegetarian"


def test_full_profile_renders_all_fields():
    out = profile_addendum(_profile(
        diet="vegan",
        budget="mid",
        pace="balanced",
        interests=["food", "photography"],
        notes="Knee injury, light walking",
    ))
    assert "vegan" in out
    assert "mid budget" in out
    assert "balanced pace" in out
    assert "Interests: food, photography" in out
    assert "Knee injury" in out


def test_partial_profile_omits_missing_fields():
    out = profile_addendum(_profile(budget="cheap", interests=["hiking"]))
    assert out == "cheap budget. Interests: hiking"
