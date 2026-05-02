"""Render a PdfPlan into a print-quality PDF in the warm Atlas D1 aesthetic.

Layout:
  • Cover page — amber circle glyph, big destination, subtitle, route summary
  • Per day:
      ─ Day header pill ("Day N · Fri 15 May  —  Title")
      ─ Schedule table (TIME | ACTIVITY) with alternating warm rows
      ─ Food spot cards (🍽️ + name, area pill, tags, notes)
      ─ Photo spot cards (📷 + location, best time, what to shoot)

A small fallback `generate_pdf(markdown, destination)` remains for any caller
that still hands us markdown — it just renders the plain document.
"""

import os
import re

from fpdf import FPDF, FontFace

from api.models import PdfDay, PdfFoodSpot, PdfPhotoSpot, PdfPlan, PdfScheduleItem

# ── Palette (matches atlas D1 theme) ─────────────────────────────────────────
INK = (42, 31, 21)
INK_MUTED = (154, 125, 90)
AMBER = (201, 122, 58)
AMBER_LIGHT = (232, 168, 92)
CARD_BG = (252, 247, 240)
CARD_BORDER = (220, 205, 180)
RULE = (220, 205, 180)
TABLE_ALT = (250, 246, 240)
TAG_BG = (245, 232, 211)


def _find_font(candidates: list[str]) -> str | None:
    for path in candidates:
        if os.path.exists(path):
            return path
    return None


FONT_REGULAR = _find_font([
    "/Library/Fonts/Arial Unicode.ttf",
    "/System/Library/Fonts/Supplemental/Arial.ttf",
    "/System/Library/Fonts/Supplemental/Verdana.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "/usr/share/fonts/dejavu/DejaVuSans.ttf",
])
FONT_BOLD = _find_font([
    "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
    "/System/Library/Fonts/Supplemental/Arial Rounded Bold.ttf",
    "/System/Library/Fonts/Supplemental/Verdana Bold.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf",
])

# ── Public API ───────────────────────────────────────────────────────────────


def render_plan_pdf(plan: PdfPlan) -> bytes:
    pdf = FPDF()
    pdf.set_auto_page_break(auto=True, margin=22)
    pdf.set_margins(22, 24, 22)

    if FONT_REGULAR and FONT_BOLD:
        pdf.add_font("body", style="", fname=FONT_REGULAR)
        pdf.add_font("body", style="B", fname=FONT_BOLD)
        reg, bold = "body", "body"
    else:
        reg, bold = "Helvetica", "Helvetica"

    pdf.add_page()
    _render_cover(pdf, reg, bold, plan)

    for day in plan.days:
        pdf.add_page()
        _render_day(pdf, reg, bold, day)

    return bytes(pdf.output())


def generate_pdf(document: str, destination: str) -> bytes:
    """Legacy markdown renderer. Kept for callers still passing raw markdown."""
    pdf = FPDF()
    pdf.set_auto_page_break(auto=True, margin=22)
    pdf.set_margins(22, 24, 22)
    if FONT_REGULAR and FONT_BOLD:
        pdf.add_font("body", style="", fname=FONT_REGULAR)
        pdf.add_font("body", style="B", fname=FONT_BOLD)
        reg, bold = "body", "body"
    else:
        reg, bold = "Helvetica", "Helvetica"
    pdf.add_page()
    pdf.set_text_color(*INK)
    pdf.set_font(bold, "B", 26)
    pdf.set_x(0)
    pdf.cell(pdf.w, 14, destination, align="C", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(6)
    pdf.set_font(reg, "", 11)
    for raw in document.split("\n"):
        line = re.sub(r"\*{1,2}(.*?)\*{1,2}", r"\1", raw).rstrip()
        if line.startswith("## "):
            pdf.ln(3)
            pdf.set_text_color(*AMBER)
            pdf.set_font(bold, "B", 15)
            pdf.cell(0, 8, line[3:], new_x="LMARGIN", new_y="NEXT")
            pdf.set_text_color(*INK)
            pdf.set_font(reg, "", 11)
        elif line.startswith("### "):
            pdf.ln(2)
            pdf.set_font(bold, "B", 12)
            pdf.cell(0, 7, line[4:], new_x="LMARGIN", new_y="NEXT")
            pdf.set_font(reg, "", 11)
        elif line:
            pdf.multi_cell(pdf.epw, 6, line)
    return bytes(pdf.output())


# ── Cover ────────────────────────────────────────────────────────────────────


def _render_cover(pdf: FPDF, reg: str, bold: str, plan: PdfPlan) -> None:
    page_h = pdf.h
    cx = pdf.w / 2

    pdf.set_y(page_h * 0.28)

    # Amber circle glyph
    diam = 28
    glyph_y = pdf.get_y()
    pdf.set_fill_color(*AMBER)
    pdf.ellipse(cx - diam / 2, glyph_y, diam, diam, "F")
    pdf.set_text_color(255, 255, 255)
    pdf.set_font(bold, "B", 18)
    pdf.set_xy(cx - 10, glyph_y + 6)
    pdf.cell(20, 16, "*", align="C")
    pdf.set_y(glyph_y + diam + 14)

    # Destination
    pdf.set_text_color(*INK)
    pdf.set_font(bold, "B", 32)
    pdf.set_x(0)
    pdf.cell(pdf.w, 14, plan.destination, align="C", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(3)

    # Subtitle
    pdf.set_text_color(*INK_MUTED)
    pdf.set_font(reg, "", 12)
    pdf.set_x(0)
    pdf.cell(pdf.w, 7, plan.subtitle, align="C", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(20)

    # Route line
    if plan.route:
        route = "  →  ".join(plan.route[:5])
        if len(plan.route) > 5:
            route += f"  →  …  →  {plan.route[-1]}"
        pdf.set_text_color(*INK_MUTED)
        pdf.set_font(reg, "", 10)
        pdf.set_x(pdf.l_margin)
        pdf.multi_cell(pdf.epw, 6, f"Route:  {route}", align="C")
        pdf.ln(4)

    # Footer brand
    pdf.set_y(page_h - 22)
    pdf.set_text_color(*AMBER)
    pdf.set_font(bold, "B", 9)
    pdf.set_x(0)
    pdf.cell(pdf.w, 6, "ATLAS", align="C", new_x="LMARGIN", new_y="NEXT")
    pdf.set_text_color(*INK_MUTED)
    pdf.set_font(reg, "", 8)
    pdf.set_x(0)
    pdf.cell(pdf.w, 5, "atlas.viggy.dev", align="C")


# ── Day page ────────────────────────────────────────────────────────────────


def _render_day(pdf: FPDF, reg: str, bold: str, day: PdfDay) -> None:
    _render_day_header(pdf, reg, bold, day)
    pdf.ln(4)

    if day.schedule:
        _render_schedule(pdf, reg, bold, day.schedule)
        pdf.ln(2)

    food_dinner_first = sorted(
        day.food_spots,
        key=lambda f: ["Breakfast", "Coffee", "Snack", "Lunch", "Dinner"].index(f.meal)
        if f.meal in {"Breakfast", "Coffee", "Snack", "Lunch", "Dinner"}
        else 99,
    )
    for food in food_dinner_first:
        _render_food_card(pdf, reg, bold, food)
        pdf.ln(2)

    if day.photo_spots:
        _render_photo_section(pdf, reg, bold, day.photo_spots)


def _render_day_header(pdf: FPDF, reg: str, bold: str, day: PdfDay) -> None:
    """`Day 1 · Fri 15 May  —  Title` styled like Montenegro."""
    x0 = pdf.l_margin
    y0 = pdf.get_y()

    # Small grey "Day 1 · Fri 15 May"
    pdf.set_text_color(*INK_MUTED)
    pdf.set_font(reg, "", 11)
    pdf.set_xy(x0, y0)
    pdf.cell(0, 6, day.label, new_x="LMARGIN", new_y="NEXT")

    # Big amber title
    pdf.set_text_color(*INK)
    pdf.set_font(bold, "B", 20)
    pdf.set_x(x0)
    pdf.cell(0, 10, day.title, new_x="LMARGIN", new_y="NEXT")

    # Amber underline
    pdf.set_draw_color(*AMBER)
    pdf.set_line_width(0.7)
    pdf.line(x0, pdf.get_y() + 1, x0 + 28, pdf.get_y() + 1)
    pdf.ln(3)


def _render_schedule(
    pdf: FPDF, reg: str, bold: str, items: list[PdfScheduleItem]
) -> None:
    if not items:
        return

    # Header: TIME | ACTIVITY
    pdf.set_text_color(*AMBER)
    pdf.set_font(bold, "B", 8)
    x0 = pdf.l_margin
    pdf.set_xy(x0, pdf.get_y())
    pdf.cell(22, 6, "TIME")
    pdf.cell(0, 6, "ACTIVITY", new_x="LMARGIN", new_y="NEXT")

    pdf.set_draw_color(*RULE)
    pdf.set_line_width(0.2)
    pdf.line(x0, pdf.get_y(), x0 + pdf.epw, pdf.get_y())
    pdf.ln(1.5)

    pdf.set_font(reg, "", 11)
    for i, item in enumerate(items):
        # Alternate background tint
        row_y = pdf.get_y()
        # Estimate row height — depends on activity wrap. Use multi_cell trick.
        pdf.set_text_color(*INK_MUTED)
        pdf.set_font(bold, "B", 10)
        pdf.set_xy(x0, row_y + 2)
        pdf.cell(22, 6, item.time)

        pdf.set_text_color(*INK)
        pdf.set_font(reg, "", 11)
        pdf.set_xy(x0 + 22, row_y + 2)
        pdf.multi_cell(pdf.epw - 22, 6, item.activity)

        if item.note:
            pdf.set_text_color(*INK_MUTED)
            pdf.set_font(reg, "", 10)
            pdf.set_x(x0 + 22)
            pdf.multi_cell(pdf.epw - 22, 5, item.note)

        # Subtle row separator
        pdf.set_draw_color(*RULE)
        pdf.set_line_width(0.1)
        pdf.line(x0, pdf.get_y() + 1, x0 + pdf.epw, pdf.get_y() + 1)
        pdf.ln(1.5)


def _render_food_card(pdf: FPDF, reg: str, bold: str, food: PdfFoodSpot) -> None:
    """A small card: emoji + meal-type — name, area, tags, notes."""
    x0 = pdf.l_margin
    y0 = pdf.get_y() + 2

    title_left = f"{food.meal or 'Eat'}  —  {food.name}"
    if food.area:
        title_left += f", {food.area}"

    # Card background — light cream with amber left rule
    # Estimate card height: title (6) + tags (5) + notes (~12) ≈ 24
    notes_lines = 1 + len(food.notes) // 90
    card_h = 18 + 5 * notes_lines

    pdf.set_fill_color(*CARD_BG)
    pdf.set_draw_color(*CARD_BORDER)
    pdf.set_line_width(0.2)
    pdf.rect(x0, y0, pdf.epw, card_h, "DF")
    # Amber left accent
    pdf.set_fill_color(*AMBER)
    pdf.rect(x0, y0, 1.6, card_h, "F")

    inner_x = x0 + 6
    inner_w = pdf.epw - 8

    # Title
    pdf.set_text_color(*INK)
    pdf.set_font(bold, "B", 12)
    pdf.set_xy(inner_x, y0 + 3)
    pdf.cell(inner_w, 6, title_left)

    # Tags row
    pdf.set_xy(inner_x, y0 + 9)
    tag_x = inner_x
    for tag in food.tags[:3]:
        pdf.set_font(bold, "B", 8)
        text_w = pdf.get_string_width(tag) + 5
        pdf.set_fill_color(*TAG_BG)
        pdf.set_text_color(165, 95, 37)
        pdf.rect(tag_x, y0 + 9.5, text_w, 4.5, "F")
        pdf.set_xy(tag_x, y0 + 9.5)
        pdf.cell(text_w, 4.5, tag, align="C")
        tag_x += text_w + 3

    # Notes
    pdf.set_text_color(*INK_MUTED)
    pdf.set_font(reg, "", 10)
    pdf.set_xy(inner_x, y0 + 14.5)
    pdf.multi_cell(inner_w, 5, food.notes)

    # Move cursor below card
    pdf.set_y(y0 + card_h + 1)


def _render_photo_section(
    pdf: FPDF, reg: str, bold: str, spots: list[PdfPhotoSpot]
) -> None:
    pdf.ln(2)
    pdf.set_text_color(*AMBER)
    pdf.set_font(bold, "B", 9)
    pdf.set_x(pdf.l_margin)
    pdf.cell(0, 5, "PHOTO SPOTS", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(0.5)

    pdf.set_draw_color(*RULE)
    pdf.set_line_width(0.2)
    pdf.line(pdf.l_margin, pdf.get_y(), pdf.l_margin + pdf.epw, pdf.get_y())
    pdf.ln(2)

    for spot in spots:
        x0 = pdf.l_margin
        y0 = pdf.get_y()

        pdf.set_text_color(*INK)
        pdf.set_font(bold, "B", 11)
        pdf.set_xy(x0, y0)
        pdf.multi_cell(pdf.epw, 6, spot.location)

        pdf.set_text_color(*AMBER)
        pdf.set_font(bold, "B", 8)
        pdf.set_x(x0)
        pdf.cell(0, 4.5, f"BEST TIME · {spot.best_time.upper()}", new_x="LMARGIN", new_y="NEXT")

        pdf.set_text_color(*INK_MUTED)
        pdf.set_font(reg, "", 10)
        pdf.set_x(x0)
        pdf.multi_cell(pdf.epw, 5, spot.what)
        pdf.ln(2)
