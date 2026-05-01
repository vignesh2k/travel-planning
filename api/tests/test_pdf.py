from api.pdf import generate_pdf


def test_generate_pdf_returns_valid_pdf_bytes() -> None:
    md = (
        "## Overview\n\nKyoto in autumn is glorious.\n\n"
        "## Neighbourhoods\n\nGion is the geisha district.\n\n"
        "## 7-Day Itinerary\n\n"
        "### Day 1: Higashiyama\n\n"
        "**Morning:**\n- Visit Kiyomizu-dera\n- Walk Sannenzaka\n\n"
        "**Afternoon:**\n- Lunch in Gion\n\n"
        "**Evening:**\n- Sunset at Yasaka Pagoda\n\n"
        "## Logistics\n\n"
        "| Category | Details |\n"
        "|---|---|\n"
        "| Transit | JR Pass |\n"
    )
    out = generate_pdf(md, "Kyoto, Japan")
    assert isinstance(out, bytes)
    assert out.startswith(b"%PDF-")
    assert len(out) > 1000


def test_generate_pdf_handles_empty_document() -> None:
    out = generate_pdf("", "Nowhere")
    assert out.startswith(b"%PDF-")
