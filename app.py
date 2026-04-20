import json
import os
import re

import anthropic
import pydeck as pdk
import requests
import streamlit as st
from fpdf import FPDF

GEOCODE_CAP = 15
GEOCODE_PRIORITY = ["restaurant", "photography_spot", "neighbourhood", "logistics"]

CATEGORY_RGB = {
    "neighbourhood":    [66,  133, 244, 220],
    "restaurant":       [52,  168, 83,  220],
    "photography_spot": [234, 67,  53,  220],
    "logistics":        [147, 52,  230, 220],
}


@st.cache_data(show_spinner=False)
def get_travel_research(destination: str, trip_length: int, travel_style: str, api_key: str) -> dict:
    client = anthropic.Anthropic(api_key=api_key)

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
   ## Neighbourhoods  (3–5 key neighbourhoods)
   ## Vegetarian Restaurants  (6–8 specific restaurants)
   ## Photography Spots  (6–8 specific locations)
   ## {trip_length}-Day Itinerary
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
   ## Logistics  (transport, accommodation areas, practical tips)

2. "places" — an array of objects for every named location in the document:
   - "name": geocodable string, e.g. "Shinjuku Gyoen, Tokyo, Japan"
   - "category": one of "neighbourhood" | "restaurant" | "photography_spot" | "logistics"
   - "description": one sentence about this place

Return ONLY the JSON object."""

    response = client.messages.create(
        model="claude-sonnet-4-5",
        max_tokens=8000,
        thinking={"type": "enabled", "budget_tokens": 1024},
        system=[{"type": "text", "text": system_prompt, "cache_control": {"type": "ephemeral"}}],
        messages=[{"role": "user", "content": user_prompt}],
    )

    raw = next(b.text for b in response.content if b.type == "text").strip()
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
    pdf.set_auto_page_break(auto=True, margin=18)
    pdf.set_margins(20, 18, 20)

    if FONT_REGULAR and FONT_BOLD:
        pdf.add_font("body", style="",  fname=FONT_REGULAR)
        pdf.add_font("body", style="B", fname=FONT_BOLD)
        reg, bold = "body", "body"
    else:
        reg, bold = "Helvetica", "Helvetica"

    pdf.add_page()
    w = pdf.epw  # effective page width (page minus both margins)

    pdf.set_font(bold, "B", 22)
    pdf.multi_cell(w, 11, f"Travel Guide: {destination}", align="C")
    pdf.ln(8)

    TIME_OF_DAY = re.compile(
        r"^\*{0,2}(morning|afternoon|evening|lunch|night)\b[\*:]*\s*(.*)?",
        re.IGNORECASE,
    )
    indent = 4

    for raw_line in document.split("\n"):
        line = raw_line.strip()

        if line.startswith("## "):
            pdf.set_x(pdf.l_margin)
            pdf.ln(3)
            pdf.set_fill_color(230, 242, 255)
            pdf.set_font(bold, "B", 15)
            pdf.multi_cell(w, 9, line[3:], fill=True)
            pdf.ln(2)

        elif line.startswith("### "):
            pdf.set_x(pdf.l_margin)
            pdf.set_font(bold, "B", 12)
            pdf.multi_cell(w, 7, line[4:])
            pdf.ln(1)

        elif TIME_OF_DAY.match(line):
            # Extract just the label (e.g. "Morning:") and any trailing content
            m = TIME_OF_DAY.match(line)
            label = m.group(1).capitalize() + ":"
            remainder = re.sub(r"\*{1,2}(.*?)\*{1,2}", r"\1", m.group(2)).strip() if m.group(2) else ""
            pdf.set_x(pdf.l_margin)
            pdf.ln(1)
            pdf.set_font(bold, "BU", 11)
            pdf.multi_cell(w, 7, label)
            pdf.set_x(pdf.l_margin)
            if remainder:
                text = "\u2022  " + remainder
                pdf.set_font(reg, "", 11)
                pdf.set_x(pdf.l_margin + indent)
                pdf.multi_cell(w - indent, 6, text)
                pdf.set_x(pdf.l_margin)

        elif line.startswith(("- ", "* ")):
            text = "\u2022  " + re.sub(r"\*\*(.*?)\*\*", r"\1", line[2:])
            pdf.set_font(reg, "", 11)
            pdf.set_x(pdf.l_margin + indent)
            pdf.multi_cell(w - indent, 6, text)
            pdf.set_x(pdf.l_margin)

        elif line:
            text = re.sub(r"\*\*(.*?)\*\*", r"\1", line)
            pdf.set_x(pdf.l_margin)
            pdf.set_font(reg, "", 11)
            pdf.multi_cell(w, 6, text)

        else:
            pdf.set_x(pdf.l_margin)
            pdf.ln(3)

    return bytes(pdf.output())


# ─── Streamlit UI ─────────────────────────────────────────────────────────────

def main():
    st.set_page_config(page_title="AI Travel Research", page_icon="✈️", layout="wide")

    st.title("✈️ AI Travel Research Assistant")
    st.caption("Powered by Claude · Google Maps Geocoding")

    anthropic_key = os.environ.get("ANTHROPIC_API_KEY") or st.secrets.get("ANTHROPIC_API_KEY", "")
    google_key = os.environ.get("GOOGLE_MAPS_API_KEY") or st.secrets.get("GOOGLE_MAPS_API_KEY", "")

    with st.sidebar:
        st.header("Plan Your Trip")
        destination = st.text_input("Destination", placeholder="e.g. Kyoto, Japan")
        trip_length = st.number_input("Trip length (days)", min_value=1, max_value=30, value=7)
        travel_style = st.text_area(
            "Travel style & preferences",
            placeholder=(
                "e.g. Photography enthusiast, prefer walkable neighbourhoods, "
                "vegetarian diet, mid-range budget, off-the-beaten-path experiences"
            ),
            height=130,
        )
        submitted = st.button("Generate Travel Research", type="primary", use_container_width=True)

        st.divider()
        st.markdown(
            "**Colour legend**\n"
            "- 🔵 Neighbourhood\n"
            "- 🟢 Vegetarian Restaurant\n"
            "- 🔴 Photography Spot\n"
            "- 🟣 Logistics"
        )

    if "result" not in st.session_state:
        st.session_state.result = None
        st.session_state.places = []

    if submitted:
        if not destination.strip():
            st.error("Please enter a destination.")
            st.stop()
        if not anthropic_key:
            st.error("ANTHROPIC_API_KEY environment variable is not set.")
            st.stop()
        if not google_key:
            st.error("GOOGLE_MAPS_API_KEY environment variable is not set.")
            st.stop()

        st.session_state.result = None
        st.session_state.places = []

        with st.spinner(f"Researching {destination} with Claude…"):
            try:
                result = get_travel_research(destination, trip_length, travel_style, anthropic_key)
            except json.JSONDecodeError as exc:
                st.error(f"Could not parse Claude's response as JSON: {exc}")
                st.stop()
            except anthropic.APIError as exc:
                st.error(f"Anthropic API error: {exc}")
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
        st.session_state.result = result
        st.session_state.places = places_with_coords

    if st.session_state.result:
        doc = st.session_state.result.get("document", "")
        places = st.session_state.places
        geocoded = sum(1 for p in places if p.get("lat") is not None)

        tab_guide, tab_map = st.tabs(["📄 Travel Guide", f"🗺️ Map ({geocoded} pins)"])

        with tab_guide:
            dest = st.session_state.result.get("destination", "Trip")
            pdf_bytes = generate_pdf(doc, dest)
            st.download_button(
                label="Export as PDF",
                data=pdf_bytes,
                file_name=f"{dest.replace(' ', '_')}_travel_guide.pdf",
                mime="application/pdf",
            )
            render_guide(doc)

        with tab_map:
            deck, map_data = build_pydeck_map(places)
            if deck:
                event = st.pydeck_chart(
                    deck,
                    on_select="rerun",
                    selection_mode="single-object",
                    use_container_width=True,
                )
                # Show place detail card on pin click
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
    else:
        st.info("Fill in the form on the left and click **Generate Travel Research** to get started.")


if __name__ == "__main__":
    main()
