import os
import re

from fpdf import FPDF, FontFace


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


def generate_pdf(document: str, destination: str) -> bytes:
    pdf = FPDF()
    pdf.set_auto_page_break(auto=True, margin=20)
    pdf.set_margins(20, 20, 20)

    if FONT_REGULAR and FONT_BOLD:
        pdf.add_font("body", style="", fname=FONT_REGULAR)
        pdf.add_font("body", style="B", fname=FONT_BOLD)
        reg, bold = "body", "body"
    else:
        reg, bold = "Helvetica", "Helvetica"

    pdf.add_page()
    w = pdf.epw

    pdf.set_fill_color(66, 133, 244)
    pdf.set_text_color(255, 255, 255)
    pdf.set_font(bold, "B", 10)
    pdf.cell(w, 7, "TRAVEL GUIDE", align="C", fill=True, new_x="LMARGIN", new_y="NEXT")
    pdf.set_font(bold, "B", 22)
    pdf.multi_cell(w, 13, destination, align="C", fill=True)
    pdf.set_text_color(30, 30, 30)
    pdf.ln(10)

    TIME_OF_DAY = re.compile(
        r"^\*{0,2}(morning|afternoon|evening|lunch|night)\b[\*:]*\s*(.*)?",
        re.IGNORECASE,
    )

    def strip_md(text: str) -> str:
        return re.sub(r"\*{1,2}(.*?)\*{1,2}", r"\1", text)

    indent = 5
    table_buffer: list[str] = []

    def flush_table() -> None:
        if not table_buffer:
            return
        lines = list(table_buffer)
        table_buffer.clear()

        rows = []
        for tline in lines:
            tline = tline.strip()
            if re.match(r"^\|[-:| ]+\|$", tline):
                continue
            cells = [c.strip() for c in tline.strip("|").split("|")]
            if cells:
                rows.append(cells)

        if len(rows) < 2:
            return

        num_cols = max(len(r) for r in rows)
        rows = [r + [""] * (num_cols - len(r)) for r in rows]

        pdf.set_font(reg, "", 10)
        pdf.set_text_color(30, 30, 30)
        pdf.set_fill_color(255, 255, 255)
        heading_style = FontFace(
            fill_color=(80, 80, 80),
            color=(255, 255, 255),
            emphasis="BOLD",
        )
        try:
            with pdf.table(
                first_row_as_headings=True,
                headings_style=heading_style,
                line_height=7,
                padding=3,
                text_align="LEFT",
                align="LEFT",
            ) as table:
                for row_data in rows:
                    row = table.row()
                    for cell_text in row_data:
                        row.cell(cell_text)
        except Exception:
            for row_data in rows:
                pdf.set_x(pdf.l_margin)
                pdf.multi_cell(w, 6, " | ".join(row_data))
        pdf.ln(5)

    for raw_line in document.split("\n"):
        line = raw_line.strip()

        if line.startswith("|"):
            table_buffer.append(line)
            continue
        else:
            flush_table()

        if line.startswith("## "):
            pdf.ln(5)
            pdf.set_fill_color(66, 133, 244)
            pdf.set_text_color(255, 255, 255)
            pdf.set_font(bold, "B", 13)
            pdf.set_x(pdf.l_margin)
            pdf.multi_cell(w, 10, f"  {line[3:].upper()}", fill=True)
            pdf.set_text_color(30, 30, 30)
            pdf.ln(4)

        elif line.startswith("### "):
            pdf.ln(3)
            pdf.set_fill_color(235, 238, 245)
            pdf.set_text_color(30, 30, 30)
            pdf.set_font(bold, "B", 12)
            pdf.set_x(pdf.l_margin)
            pdf.multi_cell(w, 9, f"  {line[4:]}", fill=True)
            pdf.ln(2)

        elif TIME_OF_DAY.match(line):
            m = TIME_OF_DAY.match(line)
            label = m.group(1).capitalize() + ":"
            remainder = strip_md(m.group(2)).strip() if m.group(2) else ""
            pdf.ln(2)
            pdf.set_x(pdf.l_margin)
            pdf.set_text_color(50, 100, 200)
            pdf.set_font(bold, "BU", 11)
            pdf.multi_cell(w, 7, label)
            pdf.set_text_color(30, 30, 30)
            pdf.set_x(pdf.l_margin)
            if remainder:
                pdf.set_font(reg, "", 11)
                pdf.set_x(pdf.l_margin + indent)
                pdf.multi_cell(w - indent, 7, f"•  {remainder}")
                pdf.set_x(pdf.l_margin)

        elif line.startswith(("- ", "* ")):
            pdf.set_font(reg, "", 11)
            pdf.set_x(pdf.l_margin + indent)
            pdf.multi_cell(w - indent, 7, f"•  {strip_md(line[2:])}")
            pdf.set_x(pdf.l_margin)

        elif line:
            pdf.set_x(pdf.l_margin)
            pdf.set_font(reg, "", 11)
            pdf.set_text_color(30, 30, 30)
            pdf.multi_cell(w, 7, strip_md(line))

        else:
            pdf.set_x(pdf.l_margin)
            pdf.ln(3)

    flush_table()
    return bytes(pdf.output())
