"""Render a PdfPlan into a print-quality PDF in the Montenegro reference style.

Layout:
  • Cover page — Atlas brand mark, destination, subtitle, compact trip summary
  • Overview page — route and day-by-day preview for quick scanning
  • Per day:
      ─ Single-line red day header with underline
      ─ Dense red-headed schedule table
      ─ Cream recommendation cards with coloured tags
      ─ Compact photo and tips sections

A small fallback `generate_pdf(markdown, destination)` remains for any caller
that still hands us markdown — it just renders the plain document.
"""

import logging
import os
import re

from fpdf import FPDF, FontFace

# fpdf2 logs a warning every time the primary font lacks a glyph, even when
# a fallback font supplies it. The fallback DOES render — the warnings are
# pure noise in our case. Quiet them.
logging.getLogger("fpdf").setLevel(logging.ERROR)

from api.models import (
    PdfCosts,
    PdfDay,
    PdfFoodSpot,
    PdfPhotoSpot,
    PdfPlan,
    PdfScheduleItem,
)

# ── Palette — matched to the Montenegro reference PDF ───────────────────────
INK = (32, 32, 32)
INK_MUTED = (115, 115, 115)
ACCENT = (190, 25, 28)
ORANGE_RULE = (246, 151, 35)
CARD_BG = (255, 247, 224)
CARD_BORDER = (246, 235, 210)
CALLOUT_BG = (255, 249, 235)
CALLOUT_BORDER = (238, 225, 200)
RULE = (226, 226, 226)
TABLE_ALT = (247, 247, 247)
TABLE_HEADER = (190, 25, 28)
TAG_GREEN_BG = (46, 125, 50)
TAG_BLUE_BG = (36, 111, 190)
TAG_DARK_BG = (64, 64, 64)
TAG_RED_BG = (190, 25, 28)
PAPER_TINT = (255, 251, 244)
SAGE = (82, 119, 102)


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
# Symbol/emoji fallback. Used for ☕ 🍽 📷 ☀ 🌙 etc — anything outside
# the BMP-Latin range that DejaVu/Arial don't include.
FONT_SYMBOLS = _find_font([
    # macOS
    "/Library/Fonts/Symbola.ttf",
    "/System/Library/Fonts/Apple Symbols.ttf",
    "/Library/Fonts/Apple Symbols.ttf",
    # Linux (apt: fonts-symbola)
    "/usr/share/fonts/truetype/ancient-scripts/Symbola_hint.ttf",
    "/usr/share/fonts/truetype/symbola/Symbola.ttf",
    "/usr/share/fonts/symbola/Symbola.ttf",
    "/usr/share/fonts/TTF/Symbola.ttf",
])

# Emoji prefixes used across renderers. Falls back to plain typography
# when no symbol font is available (FONT_SYMBOLS is None).
MEAL_EMOJI = {
    "Breakfast": "☕",
    "Coffee": "☕",
    "Snack": "🥐",
    "Lunch": "🍽",
    "Dinner": "🍽",
}
PHOTO_EMOJI = "📷"
TIPS_EMOJI = "💡"

# ── Public API ───────────────────────────────────────────────────────────────


class AtlasPDF(FPDF):
    footer_font = "Helvetica"

    def footer(self) -> None:
        if self.page_no() <= 1:
            return
        self.set_y(-13)
        self.set_draw_color(*RULE)
        self.set_line_width(0.15)
        self.line(self.l_margin, self.get_y(), self.w - self.r_margin, self.get_y())
        self.set_y(-10)
        self.set_font(self.footer_font, "", 7.5)
        self.set_text_color(*INK_MUTED)
        self.cell(0, 5, "ATLAS TRAVEL DESK", align="L")
        self.set_x(self.l_margin)
        self.cell(self.epw, 5, f"Page {self.page_no()}", align="R")


def render_plan_pdf(plan: PdfPlan) -> bytes:
    pdf = AtlasPDF()
    pdf.set_auto_page_break(auto=True, margin=18)
    pdf.set_margins(16, 25, 16)

    if FONT_REGULAR and FONT_BOLD:
        pdf.add_font("body", style="", fname=FONT_REGULAR)
        pdf.add_font("body", style="B", fname=FONT_BOLD)
        reg, bold = "body", "body"
    else:
        reg, bold = "Helvetica", "Helvetica"
    pdf.footer_font = reg

    if FONT_SYMBOLS:
        # Register the symbol font under BOTH styles so the fallback works
        # when the active body style is bold (e.g. food-card titles, photo
        # spot section headers). Symbola itself only ships regular but we
        # alias it as bold here — better a regular emoji glyph than no glyph.
        pdf.add_font("symbols", style="", fname=FONT_SYMBOLS)
        pdf.add_font("symbols", style="B", fname=FONT_SYMBOLS)
        pdf.set_fallback_fonts(["symbols"])

    pdf.add_page()
    _render_cover(pdf, reg, bold, plan)

    if plan.days:
        pdf.add_page()
        _render_overview(pdf, reg, bold, plan)

        pdf.add_page()
        for i, day in enumerate(plan.days):
            if i > 0:
                pdf.ln(8)
            _render_day(pdf, reg, bold, day)

    if plan.costs is not None:
        _render_costs_page(pdf, reg, bold, plan.costs)

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


def _currency_symbol(currency: str) -> str:
    return {"EUR": "€", "GBP": "£", "USD": "$"}.get(currency.upper(), f"{currency} ")


def _cover_summary_sections(plan: PdfPlan) -> list[tuple[str, list[str]]]:
    if plan.cover_sections:
        sections: list[tuple[str, list[str]]] = [
            (section.label.upper(), section.lines)
            for section in plan.cover_sections
            if section.label and section.lines
        ]
    else:
        sections = [("ITINERARY", [plan.subtitle])]

    has_route = any(label == "ROUTE" for label, _ in sections)
    if plan.route and not has_route:
        route = " → ".join(plan.route[:6])
        if len(plan.route) > 6:
            route += f" → … → {plan.route[-1]}"
        sections.append(("ROUTE", [route]))

    if len(plan.days) > 1:
        highlights = [day.title for day in plan.days[:3] if day.title]
        if highlights:
            sections.append(("HIGHLIGHTS", highlights))

    has_costs = any(label == "ESTIMATED COST" for label, _ in sections)
    if plan.costs is not None and not has_costs:
        symbol = _currency_symbol(plan.costs.currency)
        local = f"{symbol}{plan.costs.total_local:,}"
        sections.append(("ESTIMATED COST", [f"{local} total · £{plan.costs.total_gbp:,} GBP"]))

    return sections


def _render_cover(pdf: FPDF, reg: str, bold: str, plan: PdfPlan) -> None:
    page_h = pdf.h
    cx = pdf.w / 2

    pdf.set_fill_color(*PAPER_TINT)
    pdf.rect(0, 0, pdf.w, pdf.h, "F")
    pdf.set_fill_color(255, 255, 255)
    pdf.rect(0, 0, pdf.w, 42, "F")
    pdf.set_fill_color(*ACCENT)
    pdf.rect(0, 0, pdf.w, 2.2, "F")

    pdf.set_y(page_h * 0.16)

    # Atlas brand mark.
    mark_w = 24
    mark_h = 9
    mark_x = cx - mark_w / 2
    mark_y = pdf.get_y()
    pdf.set_draw_color(*ACCENT)
    pdf.set_line_width(0.45)
    pdf.rect(mark_x, mark_y, mark_w, mark_h)
    pdf.set_text_color(*ACCENT)
    pdf.set_font(bold, "B", 8.8)
    pdf.set_xy(mark_x, mark_y + 2.1)
    pdf.cell(mark_w, 4.5, "ATLAS", align="C")
    pdf.set_y(mark_y + mark_h + 15)

    # Destination
    pdf.set_text_color(*ACCENT)
    pdf.set_font(bold, "B", 25)
    pdf.set_x(0)
    pdf.multi_cell(pdf.w, 12, plan.destination, align="C", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(2)

    # Subtitle
    pdf.set_text_color(*INK_MUTED)
    pdf.set_font(reg, "", 11)
    pdf.set_x(0)
    pdf.cell(pdf.w, 7, plan.subtitle, align="C", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(18)

    # Centered trip-info card.
    sections = _cover_summary_sections(plan)
    card_w = min(78, pdf.epw * 0.48)
    card_x = cx - card_w / 2
    pad_x = 7
    pad_y = 6
    row_gap = 4

    body_heights: list[tuple[str, list[str], float]] = []
    total_h = pad_y
    for label, lines in sections:
        label_h = 4.5
        pdf.set_font(reg, "", 9)
        measured = 0.0
        for line in lines:
            wrapped = pdf.multi_cell(
                card_w - pad_x * 2,
                4.4,
                line,
                dry_run=True,
                output="LINES",
            )
            measured += max(1, len(wrapped)) * 4.4
        section_h = label_h + measured + row_gap
        body_heights.append((label, lines, section_h))
        total_h += section_h
    card_h = total_h + pad_y - row_gap

    card_y = pdf.get_y()
    pdf.set_fill_color(255, 255, 255)
    pdf.set_draw_color(*CARD_BORDER)
    pdf.set_line_width(0.35)
    pdf.rect(card_x, card_y, card_w, card_h, "DF")

    y = card_y + pad_y
    for label, lines, _ in body_heights:
        pdf.set_text_color(*ACCENT)
        pdf.set_font(bold, "B", 7.8)
        pdf.set_xy(card_x + pad_x, y)
        pdf.cell(card_w - pad_x * 2, 4.5, label)
        y += 4.6

        pdf.set_text_color(*INK)
        pdf.set_font(reg, "", 9)
        for line in lines:
            pdf.set_xy(card_x + pad_x, y)
            pdf.multi_cell(card_w - pad_x * 2, 4.4, line)
            y = pdf.get_y()
        y += row_gap

    pdf.set_y(card_y + card_h + 22)

    # Route line
    if plan.route:
        route = "  →  ".join(plan.route[:5])
        if len(plan.route) > 5:
            route += f"  →  …  →  {plan.route[-1]}"
        x = pdf.l_margin + 10
        pdf.set_x(x)
        pdf.set_font(bold, "B", 9.5)
        pdf.set_text_color(*ACCENT)
        label_w = pdf.get_string_width("Route: ") + 1
        pdf.cell(label_w, 5, "Route: ")
        pdf.set_text_color(*INK_MUTED)
        pdf.set_font(reg, "", 9.5)
        pdf.multi_cell(pdf.w - x - pdf.r_margin - label_w, 5, route)


def _day_preview(day: PdfDay, limit: int = 2) -> str:
    pieces = [
        f"{item.time}: {item.activity}"
        for item in day.schedule[:limit]
        if item.time and item.activity
    ]
    if pieces:
        return " · ".join(pieces)
    if day.tips:
        return day.tips[0]
    if day.food_spots:
        first = day.food_spots[0]
        return f"{first.meal or 'Food'}: {first.name}"
    return "Details to be confirmed"


def _render_overview(pdf: FPDF, reg: str, bold: str, plan: PdfPlan) -> None:
    pdf.set_fill_color(*PAPER_TINT)
    pdf.rect(0, 0, pdf.w, pdf.h, "F")
    pdf.set_fill_color(255, 255, 255)
    pdf.rect(pdf.l_margin, pdf.t_margin - 5, pdf.epw, pdf.h - pdf.t_margin - pdf.b_margin + 5, "F")

    pdf.set_text_color(*ACCENT)
    pdf.set_font(bold, "B", 18)
    pdf.cell(0, 9, "Trip at a glance", new_x="LMARGIN", new_y="NEXT")
    pdf.set_text_color(*INK_MUTED)
    pdf.set_font(reg, "", 9.5)
    pdf.multi_cell(pdf.epw, 5, f"{plan.destination} · {plan.subtitle}")
    pdf.ln(5)

    if plan.route:
        _render_overview_route(pdf, reg, bold, plan.route)
        pdf.ln(6)

    _render_section_title(pdf, reg, bold, "Daily rhythm")
    for day in plan.days:
        _render_overview_day_row(pdf, reg, bold, day)


def _render_overview_route(pdf: FPDF, reg: str, bold: str, route: list[str]) -> None:
    x0 = pdf.l_margin
    top = pdf.get_y()
    pad = 4
    route_text = "  →  ".join(route[:7])
    if len(route) > 7:
        route_text += f"  →  …  →  {route[-1]}"

    lines = _text_lines(pdf, pdf.epw - pad * 2, 4.7, route_text, reg, "", 9.2)
    box_h = pad * 2 + max(1, len(lines)) * 4.7 + 6
    _ensure_room(pdf, box_h)

    pdf.set_fill_color(*CALLOUT_BG)
    pdf.set_draw_color(*CALLOUT_BORDER)
    pdf.set_line_width(0.18)
    pdf.rect(x0, top, pdf.epw, box_h, "DF")
    pdf.set_text_color(*SAGE)
    pdf.set_font(bold, "B", 7.5)
    pdf.set_xy(x0 + pad, top + pad)
    pdf.cell(0, 4, "ROUTE")
    pdf.set_text_color(*INK)
    pdf.set_font(reg, "", 9.2)
    pdf.set_xy(x0 + pad, top + pad + 5.2)
    pdf.multi_cell(pdf.epw - pad * 2, 4.7, route_text)
    pdf.set_y(top + box_h)


def _render_overview_day_row(pdf: FPDF, reg: str, bold: str, day: PdfDay) -> None:
    x0 = pdf.l_margin
    row_top = pdf.get_y()
    num_w = 17
    pad = 3.2
    text_w = pdf.epw - num_w - pad * 2
    preview = _day_preview(day)
    title = f"{day.label} · {day.title}"
    title_lines = _text_lines(pdf, text_w, 4.9, title, bold, "B", 9.8)
    preview_lines = _text_lines(pdf, text_w, 4.4, preview, reg, "", 8.7)
    row_h = max(14, pad * 2 + len(title_lines) * 4.9 + len(preview_lines) * 4.4 + 1)

    if row_top + row_h > pdf.h - pdf.b_margin:
        pdf.add_page()
        row_top = pdf.get_y()

    pdf.set_fill_color(255, 255, 255)
    pdf.set_draw_color(*RULE)
    pdf.set_line_width(0.15)
    pdf.rect(x0, row_top, pdf.epw, row_h, "D")
    pdf.set_fill_color(*ACCENT)
    pdf.rect(x0, row_top, num_w, row_h, "F")

    pdf.set_text_color(255, 255, 255)
    pdf.set_font(bold, "B", 10)
    pdf.set_xy(x0, row_top + row_h / 2 - 3)
    pdf.cell(num_w, 5, str(day.number), align="C")

    pdf.set_text_color(*INK)
    pdf.set_font(bold, "B", 9.8)
    pdf.set_xy(x0 + num_w + pad, row_top + pad)
    pdf.multi_cell(text_w, 4.9, title)
    pdf.set_text_color(*INK_MUTED)
    pdf.set_font(reg, "", 8.7)
    pdf.set_x(x0 + num_w + pad)
    pdf.multi_cell(text_w, 4.4, preview)
    pdf.set_y(row_top + row_h + 2)


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
    """Single-line reference heading: grey day number, red date/title."""
    x0 = pdf.l_margin

    prefix = day.label
    suffix = day.title
    if "·" in day.label:
        first, rest = [part.strip() for part in day.label.split("·", 1)]
        prefix = f"{first} · "
        suffix = f"{rest} — {day.title}"
    else:
        prefix = f"{day.label} · "

    pdf.set_text_color(*INK_MUTED)
    pdf.set_font(reg, "", 10.5)
    pdf.set_x(x0)
    prefix_w = pdf.get_string_width(prefix) + 2
    pdf.cell(prefix_w, 7, prefix)

    title_size = 13.5
    fits = False
    for size in (13.5, 12.5, 11.5):
        pdf.set_font(bold, "B", size)
        if prefix_w + pdf.get_string_width(suffix) <= pdf.epw:
            title_size = size
            fits = True
            break
    pdf.set_text_color(*ACCENT)
    pdf.set_font(bold, "B", title_size)
    if fits:
        pdf.cell(0, 7, suffix, new_x="LMARGIN", new_y="NEXT")
    else:
        pdf.set_x(x0 + prefix_w)
        for size in (12.5, 11.5, 10.5):
            pdf.set_font(bold, "B", size)
            if pdf.get_string_width(suffix) <= pdf.epw - prefix_w:
                title_size = size
                break
        pdf.set_font(bold, "B", title_size)
        pdf.multi_cell(pdf.epw - prefix_w, title_size * 0.48, suffix, new_x="LMARGIN", new_y="NEXT")

    pdf.set_draw_color(*ACCENT)
    pdf.set_line_width(0.45)
    pdf.line(x0, pdf.get_y() + 1.5, x0 + pdf.epw, pdf.get_y() + 1.5)
    pdf.ln(5)


def _ensure_room(pdf: FPDF, height: float) -> None:
    if pdf.get_y() + height > pdf.h - pdf.b_margin:
        pdf.add_page()


def _text_lines(pdf: FPDF, width: float, line_h: float, text: str, font: str, style: str, size: float) -> list[str]:
    pdf.set_font(font, style, size)
    return pdf.multi_cell(width, line_h, text, dry_run=True, output="LINES")


def _render_section_title(pdf: FPDF, reg: str, bold: str, title: str) -> None:
    _ensure_room(pdf, 13)
    pdf.set_text_color(*ACCENT)
    pdf.set_font(bold, "B", 13)
    pdf.set_x(pdf.l_margin)
    pdf.cell(0, 7, title, new_x="LMARGIN", new_y="NEXT")
    pdf.set_draw_color(*ACCENT)
    pdf.set_line_width(0.45)
    pdf.line(pdf.l_margin, pdf.get_y() + 1, pdf.l_margin + pdf.epw, pdf.get_y() + 1)
    pdf.ln(4)


def _render_schedule(
    pdf: FPDF, reg: str, bold: str, items: list[PdfScheduleItem]
) -> None:
    if not items:
        return

    x0 = pdf.l_margin
    time_col_w = 26
    activity_col_w = pdf.epw - time_col_w
    pad_l = 3.2
    pad_v = 2.1

    _ensure_room(pdf, 15)
    pdf.set_fill_color(*TABLE_HEADER)
    pdf.rect(x0, pdf.get_y(), pdf.epw, 8, "F")
    pdf.set_text_color(255, 255, 255)
    pdf.set_font(bold, "B", 8)
    pdf.set_xy(x0 + pad_l, pdf.get_y() + 1.7)
    pdf.cell(time_col_w - pad_l, 5, "TIME")
    pdf.cell(0, 5, "ACTIVITY", new_x="LMARGIN", new_y="NEXT")
    pdf.set_y(pdf.get_y() + 1.1)

    for i, item in enumerate(items):
        row_top = pdf.get_y()

        activity_lines = _text_lines(
            pdf, activity_col_w - pad_l * 2, 4.8, item.activity, reg, "", 9.6,
        )
        h_activity = max(1, len(activity_lines)) * 4.8

        h_note = 0
        if item.note:
            note_lines = _text_lines(
                pdf, activity_col_w - pad_l * 2, 4.2, item.note, reg, "", 8.6,
            )
            h_note = max(1, len(note_lines)) * 4.2

        row_h = pad_v + h_activity + h_note + pad_v

        if row_top + row_h > pdf.h - pdf.b_margin:
            pdf.add_page()
            row_top = pdf.get_y()

        if i % 2 == 1:
            pdf.set_fill_color(*TABLE_ALT)
            pdf.rect(x0, row_top, pdf.epw, row_h, "F")
        pdf.set_draw_color(*RULE)
        pdf.set_line_width(0.15)
        pdf.line(x0, row_top + row_h, x0 + pdf.epw, row_top + row_h)

        pdf.set_text_color(*ACCENT)
        pdf.set_font(bold, "B", 9.3)
        pdf.set_xy(x0 + pad_l, row_top + pad_v)
        pdf.cell(time_col_w - pad_l, 4.8, item.time)

        pdf.set_text_color(*INK)
        pdf.set_font(reg, "", 9.6)
        pdf.set_xy(x0 + time_col_w + pad_l, row_top + pad_v)
        pdf.multi_cell(activity_col_w - pad_l * 2, 4.8, item.activity)
        if item.note:
            pdf.set_text_color(*INK_MUTED)
            pdf.set_font(reg, "", 8.6)
            pdf.set_x(x0 + time_col_w + pad_l)
            pdf.multi_cell(activity_col_w - pad_l * 2, 4.2, item.note)

        pdf.set_y(row_top + row_h)


def _tag_fill(tag: str) -> tuple[int, int, int]:
    t = tag.lower()
    if "vegan" in t or "vegetarian" in t:
        return TAG_GREEN_BG
    if "book" in t or "reserve" in t:
        return TAG_BLUE_BG
    if "cash" in t:
        return TAG_DARK_BG
    return TAG_RED_BG


def _render_food_card(pdf: FPDF, reg: str, bold: str, food: PdfFoodSpot) -> None:
    x0 = pdf.l_margin
    pad = 3.5
    inner_x = x0 + pad + 3.8
    inner_w = pdf.epw - pad * 2 - 3.8
    card_top = pdf.get_y() + 1.5

    emoji = MEAL_EMOJI.get(food.meal or "", "🍽") if FONT_SYMBOLS else ""
    prefix = f"{emoji}  " if emoji else ""
    title = f"{prefix}{food.meal or 'Eat'}  —  {food.name}"
    if food.area:
        title += f", {food.area}"

    title_lines = _text_lines(pdf, inner_w, 4.8, title, bold, "B", 9.6)
    h_title = max(1, len(title_lines)) * 4.8

    h_tags = 5 if food.tags else 0

    body_lines = _text_lines(pdf, inner_w, 4.35, food.notes, reg, "", 8.8)
    h_body = max(1, len(body_lines)) * 4.35

    card_h = pad + h_title + h_tags + 0.7 + h_body + pad
    if card_top + card_h > pdf.h - pdf.b_margin:
        pdf.add_page()
        card_top = pdf.get_y()

    pdf.set_fill_color(*CARD_BG)
    pdf.set_draw_color(*CARD_BORDER)
    pdf.set_line_width(0.18)
    pdf.rect(x0, card_top, pdf.epw, card_h, "DF")
    pdf.set_fill_color(*ORANGE_RULE)
    pdf.rect(x0, card_top, 1.1, card_h, "F")

    pdf.set_text_color(*ACCENT)
    pdf.set_font(bold, "B", 9.6)
    pdf.set_xy(inner_x, card_top + pad)
    pdf.multi_cell(inner_w, 4.8, title)
    cursor_y = pdf.get_y()

    if food.tags:
        pdf.set_x(inner_x)
        tag_x = inner_x
        tag_y = cursor_y + 0.4
        for tag in food.tags[:4]:
            pdf.set_font(bold, "B", 7.1)
            tw = pdf.get_string_width(tag) + 4.5
            if tag_x + tw > x0 + pdf.epw - pad:
                tag_y += 4.6
                tag_x = inner_x
            pdf.set_fill_color(*_tag_fill(tag))
            pdf.set_text_color(255, 255, 255)
            pdf.rect(tag_x, tag_y, tw, 4.1, "F")
            pdf.set_xy(tag_x, tag_y + 0.1)
            pdf.cell(tw, 3.9, tag, align="C")
            tag_x += tw + 2.2
        cursor_y = tag_y + 4.5

    pdf.set_text_color(*INK)
    pdf.set_font(reg, "", 8.8)
    pdf.set_xy(inner_x, cursor_y + 0.5)
    pdf.multi_cell(inner_w, 4.35, food.notes)

    pdf.set_y(card_top + card_h + 1.2)


def _render_tips_section(pdf: FPDF, reg: str, bold: str, tips: list[str]) -> None:
    x0 = pdf.l_margin
    pad = 3.5
    inner_x = x0 + pad + 3.8
    inner_w = pdf.epw - pad * 2 - 3.8
    card_top = pdf.get_y() + 1.5

    title_h = 4.8
    bullet_total_h = 0
    for tip in tips:
        tip_lines = _text_lines(pdf, inner_w - 4, 4.35, tip, reg, "", 8.8)
        bullet_total_h += max(1, len(tip_lines)) * 4.35
    card_h = pad + title_h + 1.5 + bullet_total_h + pad

    if card_top + card_h > pdf.h - pdf.b_margin:
        pdf.add_page()
        card_top = pdf.get_y()

    pdf.set_fill_color(*CALLOUT_BG)
    pdf.set_draw_color(*CALLOUT_BORDER)
    pdf.set_line_width(0.18)
    pdf.rect(x0, card_top, pdf.epw, card_h, "DF")
    pdf.set_fill_color(*ORANGE_RULE)
    pdf.rect(x0, card_top, 1.1, card_h, "F")

    pdf.set_text_color(*ACCENT)
    pdf.set_font(bold, "B", 9.2)
    pdf.set_xy(inner_x, card_top + pad)
    label = f"{TIPS_EMOJI}  TIPS & LOGISTICS" if FONT_SYMBOLS else "TIPS & LOGISTICS"
    pdf.cell(inner_w, title_h, label)

    pdf.set_y(card_top + pad + title_h + 1.5)
    for tip in tips:
        pdf.set_font(reg, "", 8.8)
        pdf.set_text_color(*INK)
        y_b = pdf.get_y()
        pdf.set_fill_color(*ACCENT)
        pdf.ellipse(inner_x, y_b + 1.7, 1.1, 1.1, "F")
        pdf.set_x(inner_x + 3)
        pdf.multi_cell(inner_w - 4, 4.35, tip)

    pdf.set_y(card_top + card_h + 1.5)


def _render_photo_section(
    pdf: FPDF, reg: str, bold: str, spots: list[PdfPhotoSpot]
) -> None:
    pdf.ln(2)
    label = f"{PHOTO_EMOJI}  PHOTO SPOTS" if FONT_SYMBOLS else "PHOTO SPOTS"
    _render_section_title(pdf, reg, bold, label)

    for spot in spots:
        x0 = pdf.l_margin
        y0 = pdf.get_y()

        pdf.set_text_color(*INK)
        pdf.set_font(bold, "B", 9.5)
        pdf.set_xy(x0, y0)
        pdf.multi_cell(pdf.epw, 4.8, spot.location)

        pdf.set_text_color(*ACCENT)
        pdf.set_font(bold, "B", 7.2)
        pdf.set_x(x0)
        pdf.cell(0, 3.9, f"BEST TIME · {spot.best_time.upper()}", new_x="LMARGIN", new_y="NEXT")

        pdf.set_text_color(*INK_MUTED)
        pdf.set_font(reg, "", 8.7)
        pdf.set_x(x0)
        pdf.multi_cell(pdf.epw, 4.35, spot.what)
        pdf.ln(1.8)


def _render_costs_page(pdf: FPDF, reg: str, bold: str, costs: PdfCosts) -> None:
    pdf.add_page()
    _render_section_title(pdf, reg, bold, "Budget Summary")

    pdf.set_font(reg, "", 10)
    pdf.set_text_color(*INK)
    pdf.cell(
        0, 6,
        f"Estimated totals for the full trip in {costs.currency}, with GBP equivalents:",
        new_x="LMARGIN", new_y="NEXT",
    )
    pdf.ln(4)

    x0 = pdf.l_margin
    category_w = pdf.epw * 0.72
    amount_w = pdf.epw - category_w
    row_h = 9
    symbol = _currency_symbol(costs.currency)

    pdf.set_fill_color(50, 50, 50)
    pdf.rect(x0, pdf.get_y(), pdf.epw, row_h, "F")
    pdf.set_text_color(255, 255, 255)
    pdf.set_font(bold, "B", 9.5)
    pdf.set_xy(x0 + 3, pdf.get_y() + 1.7)
    pdf.cell(category_w - 3, 5, "Category")
    pdf.cell(amount_w - 3, 5, "Total (GBP)", align="R", new_x="LMARGIN", new_y="NEXT")
    pdf.set_y(pdf.get_y() + 1.3)

    for cat in costs.categories:
        y = pdf.get_y()
        pdf.set_font(reg, "", 9.5)
        pdf.set_text_color(*INK)
        pdf.set_x(x0 + 3)
        pdf.cell(category_w - 3, row_h, cat.name)

        pdf.set_font(bold, "B", 9.5)
        pdf.set_text_color(*ACCENT)
        pdf.cell(
            amount_w - 3,
            row_h,
            f"{symbol}{cat.amount:,}  /  £{cat.gbp_amount:,}",
            align="R",
            new_x="LMARGIN",
            new_y="NEXT",
        )
        pdf.set_draw_color(*RULE)
        pdf.set_line_width(0.15)
        pdf.line(x0, y + row_h, x0 + pdf.epw, y + row_h)

    total_y = pdf.get_y()
    pdf.set_fill_color(*CARD_BG)
    pdf.rect(x0, total_y, pdf.epw, row_h, "F")
    pdf.set_draw_color(*ACCENT)
    pdf.set_line_width(0.45)
    pdf.line(x0, total_y, x0 + pdf.epw, total_y)
    pdf.set_xy(x0 + 3, total_y + 1.4)
    pdf.set_font(bold, "B", 10.5)
    pdf.set_text_color(*INK)
    pdf.cell(category_w - 3, 6, "Total estimate")
    pdf.set_text_color(*ACCENT)
    pdf.cell(
        amount_w - 3,
        6,
        f"{symbol}{costs.total_local:,}  /  £{costs.total_gbp:,}",
        align="R",
        new_x="LMARGIN", new_y="NEXT",
    )

    pdf.ln(8)
    pdf.set_font(reg, "", 8)
    pdf.set_text_color(*INK_MUTED)
    pdf.multi_cell(0, 4, f"GBP converted at rate {costs.gbp_rate:.4f}. Actual prices vary.")
