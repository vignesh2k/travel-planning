from api.models import PdfCostCategory, PdfCosts, PdfDay, PdfFoodSpot, PdfPlan, PdfScheduleItem
from api.pdf import _cover_summary_sections, _day_preview, generate_pdf, render_plan_pdf


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


def test_cover_summary_sections_include_route_and_costs() -> None:
    plan = PdfPlan(
        destination="Amsterdam, Netherlands",
        subtitle="2 days · curated by Atlas",
        route=["Canals", "Dunes", "City Lights"],
        days=[
            PdfDay(
                number=1,
                title="Canals",
                label="Day 1",
                schedule=[],
            )
        ],
        costs=PdfCosts(
            currency="EUR",
            gbp_rate=0.86,
            categories=[
                PdfCostCategory(name="Lodging", amount=500, gbp_amount=430),
                PdfCostCategory(name="Food", amount=120, gbp_amount=103),
            ],
            total_local=620,
            total_gbp=533,
        ),
    )

    sections = _cover_summary_sections(plan)

    assert sections[0] == ("ITINERARY", ["2 days · curated by Atlas"])
    assert ("ROUTE", ["Canals → Dunes → City Lights"]) in sections
    assert ("ESTIMATED COST", ["€620 total · £533 GBP"]) in sections


def test_day_preview_uses_schedule_items_in_order() -> None:
    day = PdfDay(
        number=1,
        title="Canals",
        label="Day 1",
        schedule=[
            PdfScheduleItem(time="Morning", activity="Walk the canal belt"),
            PdfScheduleItem(time="Lunch", activity="Pancakes in Jordaan"),
            PdfScheduleItem(time="Evening", activity="Concertgebouw"),
        ],
    )

    assert _day_preview(day) == "Morning: Walk the canal belt · Lunch: Pancakes in Jordaan"


def test_render_plan_pdf_returns_rich_pdf_bytes() -> None:
    plan = PdfPlan(
        destination="Amsterdam, Netherlands",
        subtitle="2 days · curated by Atlas",
        route=["Canals", "Dunes", "City Lights"],
        days=[
            PdfDay(
                number=1,
                title="Canals",
                label="Day 1",
                schedule=[
                    PdfScheduleItem(time="Morning", activity="Walk the canal belt"),
                    PdfScheduleItem(time="Lunch", activity="Pancakes in Jordaan"),
                ],
                food_spots=[
                    PdfFoodSpot(name="Cafe Winkel 43", meal="Lunch", tags=["Book"], notes="Classic apple pie stop."),
                ],
                tips=["Buy tram tickets before the first ride."],
            ),
            PdfDay(
                number=2,
                title="Dunes",
                label="Day 2",
                schedule=[
                    PdfScheduleItem(time="Morning", activity="Train to Zandvoort"),
                ],
            ),
        ],
    )

    out = render_plan_pdf(plan)

    assert out.startswith(b"%PDF-")
    assert len(out) > 4000
