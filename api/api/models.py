from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field

CategoryLiteral = Literal["neighbourhood", "restaurant", "photography_spot", "logistics"]


class Place(BaseModel):
    name: str
    category: CategoryLiteral
    description: str
    lat: float | None = None
    lng: float | None = None


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
    travel_style: str
    start_date: date | None = None
    airport_entry: str | None = None
    airport_exit: str | None = None


class Hotel(BaseModel):
    name: str
    description: str
    booking_url: str


class Neighborhood(BaseModel):
    label: str
    description: str
    hotels: list[Hotel]


class TripDocument(BaseModel):
    """JSON shape stored in the `trips.document` jsonb column."""
    document_markdown: str
    places: list[Place]
    neighborhoods: list[Neighborhood] = []


class TripSummary(BaseModel):
    """For the trip list endpoint."""
    id: str
    slug: str
    destination: str
    days: int
    created_at: datetime


class TripFull(TripSummary):
    travel_style: str
    start_date: date | None
    airport_entry: str | None
    airport_exit: str | None
    document: TripDocument


class RefineIn(BaseModel):
    instruction: str = Field(..., min_length=3, max_length=500)
