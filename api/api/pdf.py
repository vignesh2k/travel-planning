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

# ── Palette — mirrors the Montenegro reference style ────────────────────────
INK = (26, 26, 26)            # near-black body text
INK_MUTED = (110, 110, 110)   # secondary text / labels
ACCENT = (196, 74, 68)        # brick red — accent rules, headers, tag text
ACCENT_LIGHT = (230, 130, 120)
CARD_BG = (253, 245, 240)     # very light peach — restaurant cards
CARD_BORDER = (230, 215, 205)
CALLOUT_BG = (243, 243, 243)  # cool light grey — heads-up / tips callouts
CALLOUT_BORDER = (220, 220, 220)
RULE = (225, 220, 215)
TABLE_ALT = (249, 247, 244)   # very subtle warm grey for alternating rows
TAG_BG = (252, 232, 228)      # pale red — tag pill background
TAG_TEXT = (160, 50, 45)      # darker red — tag pill text


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

    pdf.add_page()
    for i, day in enumerate(plan.days):
        if i > 0:
            pdf.ln(8)
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
            pdf.set_text_color(*ACCENT)
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
    pdf.set_fill_color(*ACCENT)
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

    # Footer brand — keep above the auto-break margin (22mm) so it doesn't
    # trigger an empty page-2 with just the brand mark.
    pdf.set_y(page_h - 38)
    pdf.set_text_color(*ACCENT)
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

    if day.food_spots:
        food_ordered = sorted(
            day.food_spots,
            key=lambda f: ["Breakfast", "Coffee", "Snack", "Lunch", "Dinner"].index(f.meal)
            if f.meal in {"Breakfast", "Coffee", "Snack", "Lunch", "Dinner"}
            else 99,
        )
        for food in food_ordered:
            _render_food_card(pdf, reg, bold, food)
            pdf.ln(2)

    if day.photo_spots:
        _render_photo_section(pdf, reg, bold, day.photo_spots)

    if day.tips:
        _render_tips_section(pdf, reg, bold, day.tips)


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
    pdf.set_draw_color(*ACCENT)
    pdf.set_line_width(0.7)
    pdf.line(x0, pdf.get_y() + 1, x0 + 28, pdf.get_y() + 1)
    pdf.ln(3)


def _render_schedule(
    pdf: FPDF, reg: str, bold: str, items: list[PdfScheduleItem]
) -> None:
    if not items:
        return

    x0 = pdf.l_margin
    time_col_w = 24
    activity_col_w = pdf.epw - time_col_w
    activity_x = x0 + time_col_w
    pad_l = 2
    pad_v = 2.5

    # Header row: red small-caps TIME / ACTIVITY
    pdf.set_text_color(*ACCENT)
    pdf.set_font(bold, "B", 8)
    pdf.set_xy(x0 + pad_l, pdf.get_y())
    pdf.cell(time_col_w, 6, "TIME")
    pdf.cell(0, 6, "ACTIVITY", new_x="LMARGIN", new_y="NEXT")
    pdf.set_draw_color(*RULE)
    pdf.set_line_width(0.3)
    pdf.line(x0, pdf.get_y(), x0 + pdf.epw, pdf.get_y())

    for i, item in enumerate(items):
        row_top = pdf.get_y()

        # Pass 1 (dry run) — measure height by running multi_cell with
        # dry_run=True so nothing is actually drawn.
        pdf.set_font(reg, "", 11)
        pdf.set_xy(activity_x + pad_l, row_top + pad_v)
        pdf.multi_cell(
            activity_col_w - pad_l * 2,
            6,
            item.activity,
            dry_run=True,
            output="LINES",
        )
        height_after_activity = pdf.get_y()
        if item.note:
            pdf.set_font(reg, "", 10)
            pdf.set_x(activity_x + pad_l)
            pdf.multi_cell(
                activity_col_w - pad_l * 2,
                5,
                item.note,
                dry_run=True,
                output="LINES",
            )
            row_bottom = pdf.get_y() + pad_v
        else:
            row_bottom = height_after_activity + pad_v

        row_h = row_bottom - row_top

        # If this row would page-break, manually advance so the alt fill
        # renders on the new page rather than orphaning the backdrop.
        if row_top + row_h > pdf.h - pdf.b_margin:
            pdf.add_page()
            row_top = pdf.get_y()

        # Pass 2 — draw the alt-row backdrop, then the real text on top.
        if i % 2 == 1:
            pdf.set_fill_color(*TABLE_ALT)
            pdf.rect(x0, row_top, pdf.epw, row_h, "F")

        pdf.set_text_color(*INK_MUTED)
        pdf.set_font(bold, "B", 10)
        pdf.set_xy(x0 + pad_l, row_top + pad_v)
        pdf.cell(time_col_w, 6, item.time)

        pdf.set_text_color(*INK)
        pdf.set_font(reg, "", 11)
        pdf.set_xy(activity_x + pad_l, row_top + pad_v)
        pdf.multi_cell(activity_col_w - pad_l * 2, 6, item.activity)
        if item.note:
            pdf.set_text_color(*INK_MUTED)
            pdf.set_font(reg, "", 10)
            pdf.set_x(activity_x + pad_l)
            pdf.multi_cell(activity_col_w - pad_l * 2, 5, item.note)

        pdf.set_y(row_top + row_h)


def _render_food_card(pdf: FPDF, reg: str, bold: str, food: PdfFoodSpot) -> None:
    """Restaurant card matching the reference: cream bg, red left rule,
    bold title, red tag badges, body text. Sequential-flow so auto-page-
    break can split cleanly between cards."""
    x0 = pdf.l_margin
    pad = 4
    inner_x = x0 + pad + 4  # +4 for the left rule width
    inner_w = pdf.epw - pad * 2 - 4
    card_top = pdf.get_y() + 1

    title = f"{food.meal or 'Eat'}  —  {food.name}"
    if food.area:
        title += f", {food.area}"

    # Pre-measure card height with dry-runs so we can fill the cream bg first.
    pdf.set_xy(inner_x, card_top + pad)
    pdf.set_font(bold, "B", 12)
    pdf.multi_cell(inner_w, 6, title, dry_run=True, output="LINES")
    h_title = pdf.get_y() - (card_top + pad)

    h_tags = 0
    if food.tags:
        # Tags occupy a single row of ~5 height.
        h_tags = 6

    pdf.set_xy(inner_x, card_top + pad + h_title + h_tags + 1)
    pdf.set_font(reg, "", 10)
    pdf.multi_cell(inner_w, 5, food.notes, dry_run=True, output="LINES")
    h_body = pdf.get_y() - (card_top + pad + h_title + h_tags + 1)

    card_h = pad + h_title + h_tags + 1 + h_body + pad
    if card_top + card_h > pdf.h - pdf.b_margin:
        pdf.add_page()
        card_top = pdf.get_y()

    # Cream background + faint border + thicker red left rule
    pdf.set_fill_color(*CARD_BG)
    pdf.set_draw_color(*CARD_BORDER)
    pdf.set_line_width(0.2)
    pdf.rect(x0, card_top, pdf.epw, card_h, "DF")
    pdf.set_fill_color(*ACCENT)
    pdf.rect(x0, card_top, 2.4, card_h, "F")

    # Title
    pdf.set_text_color(*INK)
    pdf.set_font(bold, "B", 12)
    pdf.set_xy(inner_x, card_top + pad)
    pdf.multi_cell(inner_w, 6, title)
    cursor_y = pdf.get_y()

    # Tag pills
    if food.tags:
        pdf.set_x(inner_x)
        tag_x = inner_x
        tag_y = cursor_y + 0.5
        for tag in food.tags[:4]:
            pdf.set_font(bold, "B", 8)
            tw = pdf.get_string_width(tag) + 5
            if tag_x + tw > x0 + pdf.epw - pad:
                tag_y += 5.5
                tag_x = inner_x
            pdf.set_fill_color(*TAG_BG)
            pdf.set_text_color(*TAG_TEXT)
            pdf.rect(tag_x, tag_y, tw, 4.5, "F")
            pdf.set_xy(tag_x, tag_y)
            pdf.cell(tw, 4.5, tag, align="C")
            tag_x += tw + 3
        cursor_y = tag_y + 5

    # Body
    pdf.set_text_color(*INK_MUTED)
    pdf.set_font(reg, "", 10)
    pdf.set_xy(inner_x, cursor_y + 0.5)
    pdf.multi_cell(inner_w, 5, food.notes)

    pdf.set_y(card_top + card_h + 2)


def _render_tips_section(pdf: FPDF, reg: str, bold: str, tips: list[str]) -> None:
    """Heads-up callout: light grey bg, red left rule, bold red title,
    bullet tips below. Mirrors the Montenegro reference 'heads-up' boxes."""
    x0 = pdf.l_margin
    pad = 4
    inner_x = x0 + pad + 4
    inner_w = pdf.epw - pad * 2 - 4
    card_top = pdf.get_y() + 2

    # Pre-measure
    title_h = 6
    pdf.set_xy(inner_x, card_top + pad + title_h + 1)
    bullet_total_h = 0
    for tip in tips:
        pdf.set_font(reg, "", 11)
        pdf.multi_cell(inner_w - 4, 5.5, tip, dry_run=True, output="LINES")
        bullet_total_h = pdf.get_y() - (card_top + pad + title_h + 1)
    card_h = pad + title_h + 1 + bullet_total_h + pad

    if card_top + card_h > pdf.h - pdf.b_margin:
        pdf.add_page()
        card_top = pdf.get_y()

    # Background + left rule
    pdf.set_fill_color(*CALLOUT_BG)
    pdf.set_draw_color(*CALLOUT_BORDER)
    pdf.set_line_width(0.2)
    pdf.rect(x0, card_top, pdf.epw, card_h, "DF")
    pdf.set_fill_color(*ACCENT)
    pdf.rect(x0, card_top, 2.4, card_h, "F")

    # Title
    pdf.set_text_color(*ACCENT)
    pdf.set_font(bold, "B", 9)
    pdf.set_xy(inner_x, card_top + pad)
    pdf.cell(inner_w, title_h, "TIPS & LOGISTICS")

    # Bullet tips
    pdf.set_y(card_top + pad + title_h + 1)
    for tip in tips:
        pdf.set_font(reg, "", 11)
        pdf.set_text_color(*INK)
        y_b = pdf.get_y()
        pdf.set_fill_color(*ACCENT)
        pdf.ellipse(inner_x, y_b + 2.2, 1.4, 1.4, "F")
        pdf.set_x(inner_x + 3)
        pdf.multi_cell(inner_w - 4, 5.5, tip)

    pdf.set_y(card_top + card_h + 2)


def _render_photo_section(
    pdf: FPDF, reg: str, bold: str, spots: list[PdfPhotoSpot]
) -> None:
    pdf.ln(2)
    pdf.set_text_color(*ACCENT)
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

        pdf.set_text_color(*ACCENT)
        pdf.set_font(bold, "B", 8)
        pdf.set_x(x0)
        pdf.cell(0, 4.5, f"BEST TIME · {spot.best_time.upper()}", new_x="LMARGIN", new_y="NEXT")

        pdf.set_text_color(*INK_MUTED)
        pdf.set_font(reg, "", 10)
        pdf.set_x(x0)
        pdf.multi_cell(pdf.epw, 5, spot.what)
        pdf.ln(2)
