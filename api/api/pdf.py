"""PDF generator for trip exports.

Style language matches the Atlas D1 visual: warm cream paper, amber accents,
deep brown text. Renders:
  - A cover page (logo glyph, destination, days subtitle, route summary)
  - Section headers (## Foo): amber underline with title
  - Day blocks (### Day N: ...): card-style row with amber accent bar
  - Morning / Afternoon / Evening: small-caps amber labels with bullets
  - Markdown tables: clean two-tone rows, amber heading
  - Bullet lists: indented with amber circle bullet
"""

import os
import re

from fpdf import FPDF, FontFace

# ── Palette (matches atlas D1 theme) ─────────────────────────────────────────
INK = (42, 31, 21)        # #2a1f15 — text body
INK_MUTED = (154, 125, 90)  # #9a7d5a — secondary text
AMBER = (201, 122, 58)    # #c97a3a — primary accent
AMBER_LIGHT = (232, 168, 92)  # #e8a85c — subtle highlight
CREAM_BG = (250, 246, 240)  # #faf6f0 — page background
CARD_BG = (255, 250, 244)   # near-white warm — card background
RULE = (220, 205, 180)      # warm divider lines


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

TIME_OF_DAY_RE = re.compile(
    r"^\*{0,2}(morning|afternoon|evening|lunch|night)\b[\*:]*\s*(.*)?",
    re.IGNORECASE,
)
DAY_HEADING_RE = re.compile(r"^### Day\s+(\d+)\s*:\s*(.+)$", re.IGNORECASE)


def _strip_md(text: str) -> str:
    return re.sub(r"\*{1,2}(.*?)\*{1,2}", r"\1", text)


def _parse_day_titles(document: str) -> list[tuple[int, str]]:
    out: list[tuple[int, str]] = []
    for line in document.split("\n"):
        m = DAY_HEADING_RE.match(line.strip())
        if m:
            out.append((int(m.group(1)), m.group(2).strip()))
    return out


def generate_pdf(document: str, destination: str) -> bytes:
    pdf = FPDF()
    pdf.set_auto_page_break(auto=True, margin=22)
    pdf.set_margins(22, 24, 22)

    if FONT_REGULAR and FONT_BOLD:
        pdf.add_font("body", style="", fname=FONT_REGULAR)
        pdf.add_font("body", style="B", fname=FONT_BOLD)
        reg, bold = "body", "body"
    else:
        reg, bold = "Helvetica", "Helvetica"

    # ── Cover page ──────────────────────────────────────────────────────────
    pdf.add_page()
    _render_cover(pdf, reg, bold, destination, document)

    # ── Body content ────────────────────────────────────────────────────────
    pdf.add_page()
    w = pdf.epw
    indent = 6
    table_buffer: list[str] = []

    def flush_table() -> None:
        if not table_buffer:
            return
        lines = list(table_buffer)
        table_buffer.clear()

        rows: list[list[str]] = []
        for tline in lines:
            tline = tline.strip()
            if re.match(r"^\|[-:| ]+\|$", tline):
                continue
            cells = [_strip_md(c.strip()) for c in tline.strip("|").split("|")]
            if cells:
                rows.append(cells)

        if len(rows) < 2:
            return

        num_cols = max(len(r) for r in rows)
        rows = [r + [""] * (num_cols - len(r)) for r in rows]

        pdf.set_font(reg, "", 10)
        pdf.set_text_color(*INK)
        pdf.set_fill_color(*CARD_BG)
        heading_style = FontFace(
            fill_color=AMBER,
            color=(255, 255, 255),
            emphasis="BOLD",
        )
        try:
            with pdf.table(
                first_row_as_headings=True,
                headings_style=heading_style,
                line_height=7,
                padding=4,
                text_align="LEFT",
                align="LEFT",
                borders_layout="MINIMAL",
            ) as table:
                for row_data in rows:
                    row = table.row()
                    for cell_text in row_data:
                        row.cell(cell_text)
        except Exception:
            for row_data in rows:
                pdf.set_x(pdf.l_margin)
                pdf.multi_cell(w, 6, " | ".join(row_data))
        pdf.ln(6)

    for raw_line in document.split("\n"):
        line = raw_line.strip()

        # Markdown table buffering
        if line.startswith("|"):
            table_buffer.append(line)
            continue
        else:
            flush_table()

        if not line:
            pdf.ln(3)
            continue

        # ## Section heading — amber underline
        if line.startswith("## "):
            title = _strip_md(line[3:]).strip()
            _render_section_heading(pdf, bold, title)
            continue

        # ### Day N: ... — special card-style block
        day_m = DAY_HEADING_RE.match(line)
        if day_m:
            _render_day_heading(pdf, bold, reg, int(day_m.group(1)), day_m.group(2).strip())
            continue

        # ### subheading (non-day)
        if line.startswith("### "):
            title = _strip_md(line[4:]).strip()
            _render_subheading(pdf, bold, title)
            continue

        # **Morning:** / **Afternoon:** / **Evening:** — amber small-caps label
        m = TIME_OF_DAY_RE.match(line)
        if m:
            label = m.group(1).capitalize()
            remainder = _strip_md(m.group(2)).strip() if m.group(2) else ""
            _render_time_label(pdf, bold, label)
            if remainder:
                _render_bullet(pdf, reg, remainder, indent)
            continue

        # - bullet / * bullet
        if line.startswith(("- ", "* ")):
            _render_bullet(pdf, reg, _strip_md(line[2:]), indent)
            continue

        # 1. / 2. numbered list (used in Pre-Trip Checklist style content)
        num_m = re.match(r"^(\d+)\.\s+(.+)$", line)
        if num_m:
            _render_numbered(pdf, reg, bold, num_m.group(1), _strip_md(num_m.group(2)), indent)
            continue

        # Plain paragraph
        pdf.set_x(pdf.l_margin)
        pdf.set_font(reg, "", 11)
        pdf.set_text_color(*INK)
        pdf.multi_cell(w, 6, _strip_md(line))
        pdf.ln(1)

    flush_table()
    return bytes(pdf.output())


# ── Renderers ────────────────────────────────────────────────────────────────


def _render_cover(pdf: FPDF, reg: str, bold: str, destination: str, document: str) -> None:
    """Cover: logo glyph, big destination, subtitle, optional route line."""
    page_h = pdf.h
    center_x = pdf.w / 2

    # Vertical center-ish: place title block at ~38% down
    pdf.set_y(page_h * 0.30)

    # Amber circle "logo" with star glyph
    glyph_diam = 26
    cx, cy = center_x, pdf.get_y() + glyph_diam / 2
    pdf.set_fill_color(*AMBER)
    pdf.ellipse(cx - glyph_diam / 2, cy - glyph_diam / 2, glyph_diam, glyph_diam, "F")
    pdf.set_text_color(255, 255, 255)
    pdf.set_font(bold, "B", 18)
    # Center the glyph text by computing approximate width.
    pdf.set_xy(cx - 5, cy - 5)
    pdf.cell(10, 10, "*", align="C")
    pdf.set_y(cy + glyph_diam / 2 + 12)

    # Destination — big serif-ish bold
    pdf.set_text_color(*INK)
    pdf.set_font(bold, "B", 32)
    pdf.set_x(0)
    pdf.cell(pdf.w, 14, destination, align="C", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(2)

    # Subtitle: day count + tagline
    days = _parse_day_titles(document)
    pdf.set_text_color(*INK_MUTED)
    pdf.set_font(reg, "", 12)
    subtitle = f"{len(days)} days · curated by Atlas" if days else "Curated by Atlas"
    pdf.set_x(0)
    pdf.cell(pdf.w, 7, subtitle, align="C", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(20)

    # Route line: "Day 1 → Day 2 → ..." with day titles
    if days:
        route = "  →  ".join(t for _, t in days[:5])
        if len(days) > 5:
            route += f"  →  …  →  {days[-1][1]}"
        pdf.set_text_color(*INK_MUTED)
        pdf.set_font(reg, "", 10)
        pdf.set_x(pdf.l_margin)
        pdf.multi_cell(pdf.epw, 6, f"Route: {route}", align="C")
        pdf.ln(4)

    # Footer: small dot + brand mark at very bottom
    pdf.set_y(page_h - 22)
    pdf.set_text_color(*AMBER)
    pdf.set_font(bold, "B", 9)
    pdf.set_x(0)
    pdf.cell(pdf.w, 6, "ATLAS", align="C", new_x="LMARGIN", new_y="NEXT")
    pdf.set_text_color(*INK_MUTED)
    pdf.set_font(reg, "", 8)
    pdf.set_x(0)
    pdf.cell(pdf.w, 5, "atlas.viggy.dev", align="C")


def _render_section_heading(pdf: FPDF, bold: str, title: str) -> None:
    """## section — amber title with underline."""
    pdf.ln(6)
    x0 = pdf.l_margin
    y0 = pdf.get_y()
    pdf.set_text_color(*AMBER)
    pdf.set_font(bold, "B", 18)
    pdf.set_x(x0)
    pdf.cell(pdf.epw, 10, title, new_x="LMARGIN", new_y="NEXT")
    # Amber underline beneath
    pdf.set_draw_color(*AMBER)
    pdf.set_line_width(0.6)
    pdf.line(x0, y0 + 11, x0 + 28, y0 + 11)
    pdf.ln(4)
    pdf.set_text_color(*INK)


def _render_subheading(pdf: FPDF, bold: str, title: str) -> None:
    """Non-day ### heading — bold ink, bottom rule."""
    pdf.ln(3)
    pdf.set_text_color(*INK)
    pdf.set_font(bold, "B", 13)
    pdf.set_x(pdf.l_margin)
    pdf.cell(pdf.epw, 8, title, new_x="LMARGIN", new_y="NEXT")
    pdf.set_draw_color(*RULE)
    pdf.set_line_width(0.2)
    pdf.line(pdf.l_margin, pdf.get_y() + 1, pdf.l_margin + pdf.epw, pdf.get_y() + 1)
    pdf.ln(3)


def _render_day_heading(pdf: FPDF, bold: str, reg: str, day_num: int, title: str) -> None:
    """### Day N: Title — card-style row with amber day pill + title."""
    pdf.ln(5)
    x0 = pdf.l_margin
    y0 = pdf.get_y()

    # Amber pill containing "Day N"
    pill_w = 22
    pill_h = 8
    pdf.set_fill_color(*AMBER)
    pdf.rect(x0, y0, pill_w, pill_h, "F")
    pdf.set_text_color(255, 255, 255)
    pdf.set_font(bold, "B", 10)
    pdf.set_xy(x0, y0)
    pdf.cell(pill_w, pill_h, f"Day {day_num}", align="C")

    # Title to the right
    pdf.set_text_color(*INK)
    pdf.set_font(bold, "B", 14)
    pdf.set_xy(x0 + pill_w + 5, y0 - 0.5)
    pdf.cell(pdf.epw - pill_w - 5, pill_h + 1, title)

    pdf.set_y(y0 + pill_h + 4)

    # Thin divider
    pdf.set_draw_color(*RULE)
    pdf.set_line_width(0.2)
    pdf.line(x0, pdf.get_y(), x0 + pdf.epw, pdf.get_y())
    pdf.ln(3)


def _render_time_label(pdf: FPDF, bold: str, label: str) -> None:
    """Morning / Afternoon / Evening — small-caps amber heading."""
    pdf.ln(2)
    pdf.set_text_color(*AMBER)
    pdf.set_font(bold, "B", 9)
    pdf.set_x(pdf.l_margin)
    pdf.cell(pdf.epw, 5, label.upper(), new_x="LMARGIN", new_y="NEXT")
    pdf.ln(0.5)


def _render_bullet(pdf: FPDF, reg: str, text: str, indent: int) -> None:
    pdf.set_font(reg, "", 11)
    pdf.set_text_color(*INK)
    x0 = pdf.l_margin + indent
    y0 = pdf.get_y()
    # Amber bullet dot
    pdf.set_fill_color(*AMBER)
    pdf.ellipse(x0, y0 + 2.4, 1.6, 1.6, "F")
    # Text
    pdf.set_x(x0 + 4)
    pdf.multi_cell(pdf.epw - indent - 4, 6, text)
    pdf.ln(0.5)


def _render_numbered(pdf: FPDF, reg: str, bold: str, n: str, text: str, indent: int) -> None:
    pdf.set_font(bold, "B", 11)
    pdf.set_text_color(*AMBER)
    x0 = pdf.l_margin + indent
    pdf.set_xy(x0, pdf.get_y())
    pdf.cell(7, 6, f"{n}.")
    pdf.set_font(reg, "", 11)
    pdf.set_text_color(*INK)
    pdf.set_xy(x0 + 7, pdf.get_y())
    pdf.multi_cell(pdf.epw - indent - 7, 6, text)
    pdf.ln(0.5)
