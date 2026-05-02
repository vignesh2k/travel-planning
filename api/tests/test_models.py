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
