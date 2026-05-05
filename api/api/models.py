from datetime import date, datetime
import re
from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator, model_validator

CategoryLiteral = Literal["neighbourhood", "restaurant", "photography_spot", "logistics"]
TimeOfDayLiteral = Literal["Morning", "Afternoon", "Evening"]

_KNOWN_CATEGORIES: set[str] = {"neighbourhood", "restaurant", "photography_spot", "logistics"}
_CATEGORY_ALIASES: dict[str, str] = {
    "neighborhood": "neighbourhood",
    "food": "restaurant",
    "cafe": "restaurant",
    "bar": "restaurant",
    "viewpoint": "photography_spot",
    "photo": "photography_spot",
    "photo_spot": "photography_spot",
    "transport": "logistics",
    "airport": "logistics",
    "station": "logistics",
}


class Place(BaseModel):
    name: str
    category: CategoryLiteral
    description: str
    lat: float | None = None
    lng: float | None = None

    @field_validator("category", mode="before")
    @classmethod
    def _coerce_category(cls, v: Any) -> str:
        # The research LLM occasionally invents categories like "hiking",
        # "nature", "viewpoint". Coerce known aliases; everything else
        # falls back to "logistics" so a bad place never crashes the trip.
        if not isinstance(v, str):
            return "logistics"
        s = v.strip().lower()
        if s in _KNOWN_CATEGORIES:
            return s
        return _CATEGORY_ALIASES.get(s, "logistics")


class TripBriefIn(BaseModel):
    """Free-form brief from the user, plus any structured fields the UI extracted."""
    text: str = Field(..., min_length=3, max_length=2000)
    start_date: date | None = None
    airport_entry: str | None = None
    airport_exit: str | None = None


class ParsedBrief(BaseModel):
    """Output of the brief-parser LLM."""
    destination: str
    days: int = Field(..., ge=1, le=60)
    travel_style: str = ""
    start_date: date | None = None
    airport_entry: str | None = None
    airport_exit: str | None = None

    @field_validator("travel_style", mode="before")
    @classmethod
    def _none_to_empty(cls, v: Any) -> str:
        # The LLM returns null when the brief doesn't mention style at all
        # (common since the profile feature shrank briefs to "5 days in Lisbon").
        # Treat None as empty so the profile addendum carries the trip.
        return "" if v is None else v


class Hotel(BaseModel):
    name: str
    description: str
    booking_url: str


class Neighborhood(BaseModel):
    label: str
    description: str
    hotels: list[Hotel]


class ItineraryBulletGroup(BaseModel):
    time: TimeOfDayLiteral
    items: list[str]


class ItineraryDay(BaseModel):
    number: int
    title: str
    bullets: list[ItineraryBulletGroup]


def _parse_restaurants(markdown: str) -> list[list[str]]:
    sections = re.split(r"(?=^## )", markdown, flags=re.M)
    section = next((s for s in sections if re.search(r"^##\s+Vegetarian Restaurants", s, re.I | re.M)), "")
    rows: list[list[str]] = []
    for line in section.splitlines():
        t = line.strip()
        if not t.startswith("|") or re.fullmatch(r"\|[-:| ]+\|", t):
            continue
        cells = [c.strip() for c in t.strip("|").split("|")]
        if len(cells) >= 2:
            rows.append(cells)
    return rows[1:]


def _parse_itinerary(markdown: str) -> list[ItineraryDay]:
    days: list[ItineraryDay] = []
    day_blocks = [
        b for b in re.split(r"\n(?=### Day \d+:)", markdown)
        if b.startswith("### Day ")
    ]
    for block in day_blocks:
        header_match = re.match(r"^### Day (\d+):\s*(.+)", block)
        if not header_match:
            continue
        bullets: list[ItineraryBulletGroup] = []
        for time in ("Morning", "Afternoon", "Evening"):
            section_match = re.search(
                rf"\*\*{time}:\*\*([\s\S]*?)(?=\*\*(?:Morning|Afternoon|Evening):\*\*|\n## |\n### Day \d+:|$)",
                block,
            )
            if not section_match:
                continue
            items = [
                re.sub(r"^[-*]\s+", "", line).strip()
                for line in section_match.group(1).splitlines()
            ]
            clean = [
                item for item in items
                if item and not item.startswith("|") and not item.startswith("##") and not item.startswith("###")
            ]
            if clean:
                bullets.append(ItineraryBulletGroup(time=time, items=clean))
        days.append(
            ItineraryDay(
                number=int(header_match.group(1)),
                title=header_match.group(2).strip(),
                bullets=bullets,
            )
        )
    return days


class TripDocument(BaseModel):
    """JSON shape stored in the `trips.document` jsonb column."""
    document_markdown: str
    places: list[Place]
    neighborhoods: list[Neighborhood] = []
    restaurants: list[list[str]] = []
    itinerary: list[ItineraryDay] = []

    @field_validator("document_markdown", mode="before")
    @classmethod
    def _coerce_dict_to_markdown(cls, v: Any) -> Any:
        """LLMs sometimes return the document as a dict keyed by section header
        instead of a single markdown string. Flatten that shape — and tolerate
        already-persisted rows that hit this bug before."""
        if isinstance(v, dict):
            parts: list[str] = []
            for header, body in v.items():
                if not isinstance(header, str) or not isinstance(body, str):
                    continue
                stripped = header.lstrip()
                if stripped.startswith("##"):
                    parts.append(f"{header}\n\n{body}")
                else:
                    parts.append(f"## {header}\n\n{body}")
            return "\n\n".join(parts)
        return v

    @model_validator(mode="after")
    def _derive_structured_sections(self) -> "TripDocument":
        if not self.restaurants:
            self.restaurants = _parse_restaurants(self.document_markdown)
        if not self.itinerary:
            self.itinerary = _parse_itinerary(self.document_markdown)
        return self


class TripSummary(BaseModel):
    """For the trip list endpoint."""
    id: str
    slug: str
    destination: str
    days: int
    start_date: date | None = None
    centroid_lat: float | None = None
    centroid_lng: float | None = None
    created_at: datetime


class TripFull(TripSummary):
    travel_style: str
    start_date: date | None
    airport_entry: str | None
    airport_exit: str | None
    document: TripDocument
    share_token: str | None = None
    is_saved: bool = False


class TripPatch(BaseModel):
    """Partial-update fields for an existing trip. v1 supports start_date only."""
    start_date: date | None = None


class RefineIn(BaseModel):
    instruction: str = Field(..., min_length=3, max_length=500)


# ── PDF deep-dive plan models ───────────────────────────────────────────────


class PdfScheduleItem(BaseModel):
    time: str
    activity: str
    note: str | None = None


class PdfFoodSpot(BaseModel):
    name: str
    area: str | None = None
    meal: str | None = None  # "Breakfast" | "Lunch" | "Dinner" | "Coffee" | "Snack"
    tags: list[str] = []
    notes: str


class PdfPhotoSpot(BaseModel):
    location: str
    best_time: str
    what: str


class PdfDay(BaseModel):
    number: int
    title: str
    label: str  # e.g. "Day 1 · Fri 15 May" or just "Day 1"
    schedule: list[PdfScheduleItem]
    food_spots: list[PdfFoodSpot] = []
    photo_spots: list[PdfPhotoSpot] = []
    tips: list[str] = []


class PdfCostCategory(BaseModel):
    name: Literal["Lodging", "Food", "Activities", "Transport"]
    amount: int = Field(..., ge=0)
    gbp_amount: int = Field(..., ge=0)


class PdfCosts(BaseModel):
    currency: str
    gbp_rate: float
    categories: list[PdfCostCategory]
    total_local: int = Field(..., ge=0)
    total_gbp: int = Field(..., ge=0)


class PdfPlan(BaseModel):
    destination: str
    subtitle: str
    route: list[str] = []
    days: list[PdfDay]
    costs: PdfCosts | None = None


class UserProfileIn(BaseModel):
    """Per-user travel preferences. All fields optional."""
    diet: str | None = None
    budget: Literal["cheap", "mid", "premium"] | None = None
    pace: Literal["relaxed", "balanced", "packed"] | None = None
    interests: list[str] = Field(default_factory=list)
    notes: str | None = None


class UserProfile(UserProfileIn):
    updated_at: datetime


# ── Budget ──────────────────────────────────────────────────────────────────


class BudgetItem(BaseModel):
    name: str = Field(..., min_length=1, max_length=80)
    amount: int = Field(..., ge=0)


class BudgetBreakdownLine(BaseModel):
    """LLM-generated category breakdown for a day's `estimated` total.
    Read-only; user-added items are tracked separately in `items`."""
    label: str = Field(..., min_length=1, max_length=60)
    amount: int = Field(..., ge=0)


class BudgetDayIn(BaseModel):
    override: int | None = Field(None, ge=0)
    items: list[BudgetItem] = Field(default_factory=list, max_length=20)


class BudgetDay(BudgetDayIn):
    number: int
    title: str
    estimated: int
    breakdown: list[BudgetBreakdownLine] = Field(default_factory=list)


class Budget(BaseModel):
    trip_id: str
    currency: str
    gbp_rate: float
    gbp_rate_date: date
    days: list[BudgetDay]
    updated_at: datetime


class BudgetEstimateDay(BaseModel):
    number: int
    estimated: int = Field(..., ge=0)
    breakdown: list[BudgetBreakdownLine] = Field(default_factory=list)


class BudgetEstimateRaw(BaseModel):
    """Wire format from the LLM. Validated, then converted to BudgetDay rows."""
    currency: str
    days: list[BudgetEstimateDay]


# ── Sharing ─────────────────────────────────────────────────────────────────


class ShareOut(BaseModel):
    share_url: str
    token: str


class PublicTrip(BaseModel):
    """Anonymous-readable subset of a trip. Excludes personal fields:
    no user_id, no airport_*, no travel_style (which now carries the
    profile addendum like "Knee injury, light walking")."""
    slug: str
    destination: str
    days: int
    start_date: date | None
    document: TripDocument
    created_at: datetime
