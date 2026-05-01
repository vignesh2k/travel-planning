import json
import os
import re
from datetime import date, timedelta

from openai import OpenAI
import pydeck as pdk
import requests
import streamlit as st
from fpdf import FPDF, FontFace

GEOCODE_CAP = 15
GEOCODE_PRIORITY = ["restaurant", "photography_spot", "neighbourhood", "logistics"]

CATEGORY_RGB = {
    "neighbourhood":    [66,  133, 244, 220],
    "restaurant":       [52,  168, 83,  220],
    "photography_spot": [234, 67,  53,  220],
    "logistics":        [147, 52,  230, 220],
}


SUGGESTION_MODEL = "google/gemini-2.5-flash-lite"
REFINE_MODEL = "deepseek/deepseek-v3.2"
HOTEL_SEGMENT_MODEL = "google/gemini-2.5-flash-lite"

_LOADING_HTML = """
<style>
  @keyframes planeFly {
    0%,100% { transform: translateX(-10px) rotate(-4deg); }
    50%     { transform: translateX(10px)  rotate( 4deg); }
  }
  @keyframes fadeMsg {
    0%     { opacity: 0; transform: translateY(6px);  }
    3.33%  { opacity: 1; transform: translateY(0);    }
    16.67% { opacity: 1; transform: translateY(0);    }
    20%    { opacity: 0; transform: translateY(-6px); }
    100%   { opacity: 0; }
  }
  .lw        { text-align:center; padding:72px 20px; }
  .lw-plane  { font-size:2.8em; display:inline-block;
                animation: planeFly 2.4s ease-in-out infinite; }
  .lw-title  { margin:18px 0 28px; font-size:1.15em;
                font-weight:600; color:#555; }
  .lw-msgs   { position:relative; height:30px; }
  .lm        { position:absolute; left:0; right:0; opacity:0;
                font-size:1em; color:#777;
                animation: fadeMsg 15s ease-in-out infinite; }
</style>
<div class="lw">
  <div class="lw-plane">✈️</div>
  <div class="lw-title">Fill in the form and click Generate to get started</div>
  <div class="lw-msgs">
    <div class="lm" style="animation-delay:0s" >🗺️ Mapping neighbourhoods</div>
    <div class="lm" style="animation-delay:3s" >🍽️ Sourcing vegetarian restaurants</div>
    <div class="lm" style="animation-delay:6s" >📸 Scouting photography spots</div>
    <div class="lm" style="animation-delay:9s" >📅 Planning your daily itinerary</div>
    <div class="lm" style="animation-delay:12s">🧳 Checking transport &amp; logistics</div>
  </div>
</div>
"""


@st.cache_data(show_spinner=False)
def get_suggestions(destination: str, api_key: str) -> list[str]:
    client = OpenAI(api_key=api_key, base_url="https://openrouter.ai/api/v1")
    response = client.chat.completions.create(
        model=SUGGESTION_MODEL,
        max_tokens=300,
        messages=[
            {"role": "system", "content": "Return only a JSON array of strings. No other text or markdown."},
            {"role": "user", "content": (
                f"List 8 must-visit places or experiences in {destination}. "
                "Short phrases only (3–6 words each). JSON array."
            )},
        ],
    )
    raw = response.choices[0].message.content.strip()
    if raw.startswith("```"):
        raw = raw.split("```", 2)[1]
        if raw.startswith("json"):
            raw = raw[4:]
        raw = raw.rsplit("```", 1)[0].strip()
    return json.loads(raw)


@st.cache_data(show_spinner=False)
def get_travel_research(destination: str, trip_length: int, travel_style: str, api_key: str) -> dict:
    client = OpenAI(
        api_key=api_key,
        base_url="https://openrouter.ai/api/v1",
    )

    system_prompt = (
        "You are an expert travel researcher. You provide specific, actionable recommendations "
        "with real place names. For vegetarian restaurants, focus on dedicated vegetarian/vegan "
        "spots or places with outstanding vegetarian menus. Always respond with valid JSON only — "
        "no markdown fences, no extra text."
    )

    user_prompt = f"""Create a comprehensive travel research document for a trip to {destination}.

Trip details:
- Duration: {trip_length} days
- Travel style / preferences: {travel_style}

Return a single JSON object with exactly two keys:

1. "document" — a detailed Markdown string with these sections:
   ## Overview
   ## Where to Base Yourself
   Recommend the smartest accommodation strategy for this trip length: one central base, two bases, or a moving itinerary. Explain why — consider transport links, proximity to key areas, and cost of moving. Keep it to 2–3 sentences with a clear recommendation.
   ## Neighbourhoods  (3–5 key neighbourhoods, prose descriptions)
   ## Vegetarian Restaurants — markdown table with columns: Restaurant | Area | Must-Try / Why Visit
   ## Photography Spots — markdown table with columns: Location | Best Time | What to Photograph
   ## {trip_length}-Day Itinerary
   Structure the days to reflect the basing strategy above (e.g. group days by base location if moving).
   For EVERY day use exactly this structure — no variations:
   ### Day N: Title
   **Morning:**
   - bullet
   - bullet
   **Afternoon:**
   - bullet
   - bullet
   **Evening:**
   - bullet
   - bullet
   ## Logistics — markdown table with columns: Category | Details

2. "places" — an array of objects for every named location in the document:
   - "name": geocodable string, e.g. "Shinjuku Gyoen, Tokyo, Japan"
   - "category": one of "neighbourhood" | "restaurant" | "photography_spot" | "logistics"
   - "description": one sentence about this place

Return ONLY the JSON object."""

    response = client.chat.completions.create(
        model="minimax/minimax-m2.5",
        max_tokens=12000,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
    )

    raw = response.choices[0].message.content.strip()
    if raw.startswith("```"):
        raw = raw.split("```", 2)[1]
        if raw.startswith("json"):
            raw = raw[4:]
        raw = raw.rsplit("```", 1)[0].strip()

    return json.loads(raw)


def geocode_place(place_name: str, api_key: str) -> tuple[float | None, float | None]:
    try:
        resp = requests.get(
            "https://maps.googleapis.com/maps/api/geocode/json",
            params={"address": place_name, "key": api_key},
            timeout=6,
        )
        data = resp.json()
        if data.get("status") == "OK":
            loc = data["results"][0]["geometry"]["location"]
            return loc["lat"], loc["lng"]
    except Exception:
        pass
    return None, None


CATEGORY_LABELS = {
    "neighbourhood": "Neighbourhood",
    "restaurant": "Vegetarian Restaurant",
    "photography_spot": "Photography Spot",
    "logistics": "Logistics",
}


def build_pydeck_map(places: list[dict]) -> tuple[pdk.Deck, list[dict]] | tuple[None, None]:
    data = [
        {
            "lat": p["lat"],
            "lon": p["lng"],
            "name": p["name"],
            "description": p["description"],
            "category": p["category"],
            "color": CATEGORY_RGB.get(p["category"], [255, 152, 0, 220]),
        }
        for p in places
        if p.get("lat") is not None
    ]
    if not data:
        return None, None

    avg_lat = sum(d["lat"] for d in data) / len(data)
    avg_lon = sum(d["lon"] for d in data) / len(data)

    layer = pdk.Layer(
        "ScatterplotLayer",
        id="places",
        data=data,
        get_position=["lon", "lat"],
        get_fill_color="color",
        get_radius=180,
        radius_min_pixels=8,
        radius_max_pixels=18,
        pickable=True,
        auto_highlight=True,
        highlight_color=[255, 255, 255, 200],
    )

    return pdk.Deck(
        layers=[layer],
        initial_view_state=pdk.ViewState(latitude=avg_lat, longitude=avg_lon, zoom=11, pitch=0),
        tooltip={"text": "{name}"},
        map_style="https://basemaps.cartocdn.com/gl/positron-gl-style/style.json",
    ), data


def render_guide(document: str) -> None:
    """Renders the travel guide with every section collapsed into expanders."""
    parts = re.split(r"(?m)(?=^## )", document)
    for part in parts:
        if not part.strip():
            continue
        header, _, body = part.partition("\n")
        title = header.lstrip("#").strip()

        if re.search(r"(?i)itinerary", header):
            # Itinerary: header as plain markdown, then one expander per day
            # (Streamlit doesn't allow nested expanders)
            st.markdown(f"## {title}")
            day_parts = re.split(r"(?m)(?=^### )", body)
            for day in day_parts:
                if not day.strip():
                    continue
                if day.startswith("### "):
                    day_title, _, content = day.partition("\n")
                    with st.expander(day_title[4:]):
                        st.markdown(content)
                else:
                    st.markdown(day)
        else:
            # Title as a proper heading, content in expander below
            st.markdown(f"## {title}")
            expanded = title.lower().startswith("overview")
            with st.expander("Show", expanded=expanded):
                st.markdown(body)


def _find_font(candidates: list[str]) -> str | None:
    for path in candidates:
        if os.path.exists(path):
            return path
    return None


FONT_REGULAR = _find_font([
    # macOS
    "/Library/Fonts/Arial Unicode.ttf",
    "/System/Library/Fonts/Supplemental/Arial.ttf",
    "/System/Library/Fonts/Supplemental/Verdana.ttf",
    # Linux (Streamlit Cloud — installed via packages.txt)
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "/usr/share/fonts/dejavu/DejaVuSans.ttf",
])
FONT_BOLD = _find_font([
    # macOS
    "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
    "/System/Library/Fonts/Supplemental/Arial Rounded Bold.ttf",
    "/System/Library/Fonts/Supplemental/Verdana Bold.ttf",
    # Linux
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

    # ── Cover title ───────────────────────────────────────────────────────────
    pdf.set_fill_color(66, 133, 244)
    pdf.set_text_color(255, 255, 255)
    pdf.set_font(bold, "B", 10)
    pdf.cell(w, 7, "TRAVEL GUIDE", align="C", fill=True, new_x="LMARGIN", new_y="NEXT")
    pdf.set_font(bold, "B", 22)
    pdf.multi_cell(w, 13, destination, align="C", fill=True)
    pdf.set_text_color(30, 30, 30)
    pdf.ln(10)

    # ── Helpers ───────────────────────────────────────────────────────────────
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
                continue  # separator row
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

    # ── Line-by-line render ───────────────────────────────────────────────────
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
                pdf.multi_cell(w - indent, 7, f"\u2022  {remainder}")
                pdf.set_x(pdf.l_margin)

        elif line.startswith(("- ", "* ")):
            pdf.set_font(reg, "", 11)
            pdf.set_x(pdf.l_margin + indent)
            pdf.multi_cell(w - indent, 7, f"\u2022  {strip_md(line[2:])}")
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


def refine_document(document: str, instruction: str, api_key: str) -> str:
    client = OpenAI(api_key=api_key, base_url="https://openrouter.ai/api/v1")
    response = client.chat.completions.create(
        model=REFINE_MODEL,
        max_tokens=8000,
        messages=[
            {
                "role": "system",
                "content": (
                    "You are a travel guide editor. Apply the user's instruction to refine "
                    "the travel guide. Return the complete updated guide in the same Markdown "
                    "structure. Return only the Markdown — no JSON, no extra commentary."
                ),
            },
            {
                "role": "user",
                "content": (
                    f"Travel guide:\n\n{document}\n\n"
                    f"Instruction: {instruction}"
                ),
            },
        ],
    )
    return response.choices[0].message.content.strip()


@st.cache_data(show_spinner=False)
def get_hotel_segments(document: str, destination: str, trip_start: str, trip_length: int, api_key: str) -> list[dict]:
    client = OpenAI(api_key=api_key, base_url="https://openrouter.ai/api/v1")
    response = client.chat.completions.create(
        model=HOTEL_SEGMENT_MODEL,
        max_tokens=600,
        messages=[
            {"role": "system", "content": "Return only a JSON array. No markdown fences, no extra text."},
            {"role": "user", "content": (
                f"This is a {trip_length}-day itinerary for {destination}. Trip starts {trip_start}.\n\n"
                f"{document}\n\n"
                "Identify 1–3 distinct areas or neighbourhoods where the traveller should base themselves, "
                "based on which days are spent in each area. "
                "Return a JSON array where each object has:\n"
                '  "label": short area name (e.g. "Shinjuku"),\n'
                '  "search_query": geocodable string (e.g. "Shinjuku, Tokyo, Japan"),\n'
                '  "checkin": YYYY-MM-DD,\n'
                '  "checkout": YYYY-MM-DD,\n'
                '  "description": one sentence on why to stay here.\n'
                "Dates must be within the trip range. checkout of one area = checkin of the next."
            )},
        ],
    )
    raw = response.choices[0].message.content.strip()
    if raw.startswith("```"):
        raw = raw.split("```", 2)[1]
        if raw.startswith("json"):
            raw = raw[4:]
        raw = raw.rsplit("```", 1)[0].strip()
    return json.loads(raw)


@st.cache_data(show_spinner=False)
def get_destination_id(city: str, rapidapi_key: str) -> tuple[str | None, str | None]:
    url = "https://apidojo-booking-v1.p.rapidapi.com/locations/auto-complete"
    headers = {
        "x-rapidapi-host": "apidojo-booking-v1.p.rapidapi.com",
        "x-rapidapi-key": rapidapi_key,
    }
    resp = requests.get(url, headers=headers, params={"text": city, "languagecode": "en-us"}, timeout=10)
    resp.raise_for_status()
    data = resp.json()
    if not data:
        return None, None
    for item in data:
        dest_type = item.get("dest_type") or item.get("search_type") or item.get("result_type", "")
        if dest_type.lower() in ("city", "district", "region"):
            return str(item.get("dest_id", "")), dest_type
    first = data[0]
    dest_type = first.get("dest_type") or first.get("search_type") or first.get("result_type", "city")
    return str(first.get("dest_id", "")), dest_type


@st.cache_data(show_spinner=False)
def search_hotels(
    dest_id: str,
    dest_type: str,
    checkin: str,
    checkout: str,
    adults: int,
    rapidapi_key: str,
) -> list[dict]:
    url = "https://apidojo-booking-v1.p.rapidapi.com/properties/list"
    headers = {
        "x-rapidapi-host": "apidojo-booking-v1.p.rapidapi.com",
        "x-rapidapi-key": rapidapi_key,
    }
    params = {
        "dest_ids": dest_id,
        "search_type": dest_type,
        "arrival_date": checkin,
        "departure_date": checkout,
        "adults": str(adults),
        "room_qty": "1",
        "page_number": "1",
        "languagecode": "en-us",
        "currency_code": "GBP",
    }
    resp = requests.get(url, headers=headers, params=params, timeout=15)
    resp.raise_for_status()
    data = resp.json()
    hotels = (
        data.get("data", {}).get("hotels")
        or data.get("result")
        or data.get("hotels")
        or []
    )
    return hotels


def _parse_hotel(hotel: dict) -> dict | None:
    prop = hotel.get("property", {})

    name = prop.get("name") or hotel.get("hotel_name") or hotel.get("name", "")
    if not name:
        return None

    stars = int(prop.get("qualityClass") or hotel.get("class") or hotel.get("stars") or 0)

    review_score = prop.get("reviewScore") or hotel.get("review_score") or hotel.get("reviewScore")
    review_word = prop.get("reviewScoreWord") or hotel.get("review_score_word") or hotel.get("reviewScoreWord", "")

    photos = prop.get("photoUrls") or []
    if not photos:
        main = hotel.get("main_photo_url") or hotel.get("main_photo")
        if main:
            photos = [main]
    thumbnail = photos[0] if photos else None

    url = prop.get("url") or hotel.get("url") or hotel.get("hotel_url", "")

    # Try all common price paths
    price = None
    pb = prop.get("priceBreakdown", {})
    gross = pb.get("grossPrice", {})
    if isinstance(gross, dict):
        price = gross.get("value")
    if price is None:
        cpb = hotel.get("composite_price_breakdown", {})
        pn = cpb.get("gross_amount_per_night", {})
        if isinstance(pn, dict):
            price = pn.get("value")
        if price is None:
            ga = cpb.get("gross_amount", {})
            if isinstance(ga, dict):
                price = ga.get("value")
    if price is None:
        price = hotel.get("min_total_price") or hotel.get("price") or hotel.get("price_breakdown", {}).get("gross_price")

    return {
        "name": name,
        "stars": stars,
        "review_score": review_score,
        "review_word": review_word,
        "thumbnail": thumbnail,
        "url": url,
        "price": price,
    }


# ─── Streamlit UI ─────────────────────────────────────────────────────────────

def main():
    st.set_page_config(page_title="AI Travel Research", page_icon="✈️", layout="wide")

    st.title("✈️ AI Travel Research Assistant")
    st.caption("Powered by MiniMax · Google Maps Geocoding")

    anthropic_key = os.environ.get("OPENROUTER_API_KEY") or st.secrets.get("OPENROUTER_API_KEY", "")
    google_key = os.environ.get("GOOGLE_MAPS_API_KEY") or st.secrets.get("GOOGLE_MAPS_API_KEY", "")
    rapidapi_key = os.environ.get("RAPIDAPI_KEY") or st.secrets.get("RAPIDAPI_KEY", "")

    # ── Session state init (must be before sidebar reads it) ──────────────────
    if "result" not in st.session_state:
        st.session_state.result = None
        st.session_state.places = []
    if "suggestions" not in st.session_state:
        st.session_state.suggestions = []
        st.session_state.suggestion_dest = ""
    if "hotel_segments" not in st.session_state:
        st.session_state.hotel_segments = []
        st.session_state.hotel_error = ""
    if "has_submitted" not in st.session_state:
        st.session_state.has_submitted = False

    with st.sidebar:
        st.header("Plan Your Trip")
        destination = st.text_input("Destination", placeholder="e.g. Kyoto, Japan")

        # Clear suggestions if destination changed
        if destination != st.session_state.suggestion_dest:
            st.session_state.suggestions = []
            st.session_state.suggestion_dest = ""

        suggest_clicked = st.button(
            "✨ Suggest activities",
            use_container_width=True,
            disabled=not destination.strip(),
        )
        if suggest_clicked and destination.strip():
            with st.spinner("Getting suggestions…"):
                try:
                    st.session_state.suggestions = get_suggestions(destination, anthropic_key)
                    st.session_state.suggestion_dest = destination
                except Exception:
                    st.session_state.suggestions = []

        # Checkboxes for suggestions
        checked_suggestions = []
        if st.session_state.suggestions:
            st.markdown("**Suggested activities — tick to include:**")
            for s in st.session_state.suggestions:
                if st.checkbox(s, value=True, key=f"sug_{s}"):
                    checked_suggestions.append(s)

        trip_length = st.slider("Trip length (days)", min_value=1, max_value=30, value=7)
        trip_start_date = st.date_input(
            "Trip start date",
            value=date.today() + timedelta(days=30),
            min_value=date.today(),
            key="sidebar_trip_start",
        )

        st.markdown("**Airports**")
        acol1, acol2 = st.columns(2)
        with acol1:
            airport_entry = st.text_input("Entry", placeholder="e.g. LHR", key="airport_entry")
        with acol2:
            airport_exit = st.text_input("Exit", placeholder="e.g. NRT", key="airport_exit")

        extra_prefs = st.text_area(
            "Extra preferences",
            placeholder=(
                "e.g. Photography enthusiast, prefer walkable neighbourhoods, "
                "vegetarian diet, mid-range budget, off-the-beaten-path experiences"
            ),
            height=100,
        )

        # Merge checked suggestions + manual text + airports into travel_style
        parts = []
        if checked_suggestions:
            parts.append("Interested in: " + ", ".join(checked_suggestions))
        if extra_prefs.strip():
            parts.append(extra_prefs.strip())
        airport_parts = []
        if airport_entry.strip():
            airport_parts.append(f"arriving via {airport_entry.strip()}")
        if airport_exit.strip():
            airport_parts.append(f"departing from {airport_exit.strip()}")
        if airport_parts:
            parts.append("Airports: " + ", ".join(airport_parts))
        travel_style = ". ".join(parts)

        submitted = st.button("Generate Travel Research", type="primary", use_container_width=True)

        st.divider()
        st.markdown(
            "**Colour legend**\n"
            "- 🔵 Neighbourhood\n"
            "- 🟢 Vegetarian Restaurant\n"
            "- 🔴 Photography Spot\n"
            "- 🟣 Logistics"
        )

    if submitted:
        if not destination.strip():
            st.error("Please enter a destination.")
            st.stop()
        if not anthropic_key:
            st.error("OPENROUTER_API_KEY environment variable is not set.")
            st.stop()
        if not google_key:
            st.error("GOOGLE_MAPS_API_KEY environment variable is not set.")
            st.stop()

        st.session_state.result = None
        st.session_state.places = []
        st.session_state.has_submitted = True

        with st.spinner(f"✨ Researching {destination} with AI…"):
            try:
                result = get_travel_research(destination, trip_length, travel_style, anthropic_key)
            except json.JSONDecodeError as exc:
                st.error(f"Could not parse Claude's response as JSON: {exc}")
                st.stop()
            except Exception as exc:
                st.error(f"API error: {exc}")
                st.stop()

        all_places = result.get("places", [])
        places_to_geocode = sorted(
            all_places,
            key=lambda p: GEOCODE_PRIORITY.index(p.get("category", "logistics"))
            if p.get("category") in GEOCODE_PRIORITY else len(GEOCODE_PRIORITY),
        )[:GEOCODE_CAP]

        progress = st.progress(0, text="Geocoding places…")
        places_with_coords = []
        for i, place in enumerate(places_to_geocode):
            lat, lng = geocode_place(place["name"], google_key)
            places_with_coords.append({**place, "lat": lat, "lng": lng})
            progress.progress((i + 1) / GEOCODE_CAP, text=f"Geocoding: {place['name']}")
        progress.empty()

        result["destination"] = destination
        result["trip_length"] = trip_length
        result["trip_start_date"] = trip_start_date.isoformat()
        st.session_state.result = result
        st.session_state.hotel_segments = []
        st.session_state.hotel_error = ""
        st.session_state.places = places_with_coords

    # ── Always-visible tabs ───────────────────────────────────────────────────
    geocoded = sum(1 for p in st.session_state.places if p.get("lat") is not None)
    map_label = f"🗺️ Map ({geocoded} pins)" if geocoded else "🗺️ Map"
    tab_guide, tab_map, tab_hotels = st.tabs(["📄 Travel Guide", map_label, "🏨 Hotels"])

    with tab_guide:
        if st.session_state.result:
            doc = st.session_state.result.get("document", "")
            dest = st.session_state.result.get("destination", "Trip")

            # ── Refine bar ────────────────────────────────────────────────────
            rcol1, rcol2 = st.columns([5, 1])
            with rcol1:
                refine_instruction = st.text_input(
                    "refine",
                    placeholder="e.g. Add more budget tips · Focus on coastal areas · Swap Day 3 for a day trip",
                    label_visibility="collapsed",
                )
            with rcol2:
                refine_btn = st.button("✨ Refine", use_container_width=True)

            if refine_btn and refine_instruction.strip():
                with st.spinner("✨ Refining with AI…"):
                    try:
                        refined = refine_document(doc, refine_instruction, anthropic_key)
                        st.session_state.result["document"] = refined
                        st.rerun()
                    except Exception as exc:
                        st.error(f"Refine failed: {exc}")

            st.divider()

            pdf_bytes = generate_pdf(doc, dest)
            st.download_button(
                label="Export as PDF",
                data=pdf_bytes,
                file_name=f"{dest.replace(' ', '_')}_travel_guide.pdf",
                mime="application/pdf",
            )
            render_guide(doc)
        elif st.session_state.has_submitted:
            st.markdown(_LOADING_HTML, unsafe_allow_html=True)
        else:
            st.info("Fill in the form on the left and click **Generate Travel Research** to get started.")

    with tab_map:
        if st.session_state.result:
            places = st.session_state.places
            deck, map_data = build_pydeck_map(places)
            if deck:
                event = st.pydeck_chart(
                    deck,
                    on_select="rerun",
                    selection_mode="single-object",
                    use_container_width=True,
                )
                selected_indices = (
                    event.selection.get("indices", {}).get("places", [])
                    if event and event.selection else []
                )
                if selected_indices and map_data:
                    place = map_data[selected_indices[0]]
                    label = CATEGORY_LABELS.get(place["category"], place["category"])
                    st.info(
                        f"**{place['name']}**  \n"
                        f"{place['description']}  \n"
                        f"*{label} — see {place['category'].replace('_', ' ')} section in Travel Guide*"
                    )
                if geocoded < len(places):
                    st.caption(f"{len(places) - geocoded} place(s) could not be geocoded.")
            else:
                st.info("No places could be mapped.")
        elif st.session_state.has_submitted:
            st.markdown(_LOADING_HTML, unsafe_allow_html=True)
        else:
            st.info("Fill in the form on the left and click **Generate Travel Research** to get started.")

    with tab_hotels:
        if not rapidapi_key:
            st.warning("Add **RAPIDAPI_KEY** to your Streamlit secrets to enable hotel search.")
        elif not st.session_state.result:
            st.info("Generate travel research first — hotel suggestions are based on your itinerary.")
        else:
            doc = st.session_state.result.get("document", "")
            dest = st.session_state.result.get("destination", "")
            trip_length = st.session_state.result.get("trip_length", 7)

            today = date.today()
            saved_start = st.session_state.result.get("trip_start_date")
            default_start = date.fromisoformat(saved_start) if saved_start else today + timedelta(days=7)
            fcol1, fcol2, fcol3 = st.columns([2, 1, 2])
            with fcol1:
                trip_start = st.date_input("Trip start date", value=default_start, min_value=today, key="hotel_trip_start")
            with fcol2:
                hotel_adults = st.number_input("Adults", min_value=1, max_value=10, value=2, key="hotel_adults")
            with fcol3:
                max_price = st.slider("Max price per night (£)", min_value=25, max_value=1000, value=300, step=25, key="hotel_max_price")

            find_btn = st.button("Find Hotels from Itinerary", type="primary", use_container_width=True, key="hotel_find_btn")

            if find_btn:
                st.session_state.hotel_segments = []
                st.session_state.hotel_error = ""
                with st.spinner("Analysing itinerary for hotel areas…"):
                    try:
                        segments = get_hotel_segments(doc, dest, trip_start.isoformat(), trip_length, anthropic_key)
                        st.session_state.hotel_segments = [{**seg, "hotels": None, "seg_error": ""} for seg in segments]
                    except Exception as exc:
                        st.session_state.hotel_error = f"Could not analyse itinerary: {exc}"

                for i, seg in enumerate(st.session_state.hotel_segments):
                    with st.spinner(f"Searching hotels in {seg['label']}…"):
                        try:
                            dest_id, dest_type = get_destination_id(seg["search_query"], rapidapi_key)
                            if not dest_id:
                                st.session_state.hotel_segments[i]["seg_error"] = f"Could not find location: {seg['label']}"
                            else:
                                st.session_state.hotel_segments[i]["hotels"] = search_hotels(
                                    dest_id, dest_type or "city",
                                    seg["checkin"], seg["checkout"],
                                    int(hotel_adults), rapidapi_key,
                                )
                        except requests.HTTPError as exc:
                            st.session_state.hotel_segments[i]["seg_error"] = f"API error ({exc.response.status_code})"
                        except Exception as exc:
                            st.session_state.hotel_segments[i]["seg_error"] = f"Search failed: {exc}"

            if st.session_state.hotel_error:
                st.error(st.session_state.hotel_error)

            for seg in st.session_state.hotel_segments:
                checkin_str = seg.get("checkin", "")
                checkout_str = seg.get("checkout", "")
                try:
                    nights = (date.fromisoformat(checkout_str) - date.fromisoformat(checkin_str)).days
                except Exception:
                    nights = 0

                st.markdown(f"### {seg['label']}")
                st.caption(
                    f"{checkin_str} → {checkout_str}  ·  {nights} night{'s' if nights != 1 else ''}"
                    + (f"  ·  {seg['description']}" if seg.get("description") else "")
                )

                if seg.get("seg_error"):
                    st.error(seg["seg_error"])
                elif seg["hotels"] is None:
                    st.caption("Loading…")
                else:
                    parsed = [h for h in (_parse_hotel(r) for r in seg["hotels"]) if h is not None]
                    filtered = [h for h in parsed if h["price"] is None or h["price"] <= max_price]
                    filtered.sort(key=lambda h: (h["price"] is None, h["price"] or 0))
                    hotels_to_show = filtered[:20]

                    if not hotels_to_show:
                        st.info("No hotels found in this area within your price range. Try raising the max price.")
                    else:
                        for hotel in hotels_to_show:
                            with st.container(border=True):
                                img_col, info_col = st.columns([1, 3])
                                with img_col:
                                    if hotel["thumbnail"]:
                                        try:
                                            st.image(hotel["thumbnail"], use_container_width=True)
                                        except Exception:
                                            st.caption("(no image)")
                                    else:
                                        st.caption("(no image)")
                                with info_col:
                                    stars_str = "★" * hotel["stars"] + "☆" * max(0, 5 - hotel["stars"]) if hotel["stars"] else ""
                                    st.markdown(f"**{hotel['name']}** {stars_str}")
                                    if hotel["review_score"]:
                                        st.caption(f"⭐ {hotel['review_score']:.1f} · {hotel['review_word']}")
                                    if hotel["price"] is not None:
                                        total = hotel["price"] * nights
                                        st.markdown(f"**£{hotel['price']:.0f}** / night · £{total:.0f} total ({nights} night{'s' if nights != 1 else ''})")
                                    else:
                                        st.caption("Price unavailable")
                                    if hotel["url"]:
                                        st.link_button("View on Booking.com", hotel["url"])

                st.divider()


if __name__ == "__main__":
    main()
