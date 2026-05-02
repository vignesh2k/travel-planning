export type Category = "neighbourhood" | "restaurant" | "photography_spot" | "logistics";

export interface Place {
  name: string;
  category: Category;
  description: string;
  lat: number | null;
  lng: number | null;
}

export interface Hotel {
  name: string;
  description: string;
  booking_url: string;
}

export interface Neighborhood {
  label: string;
  description: string;
  hotels: Hotel[];
}

export interface TripDocument {
  document_markdown: string;
  places: Place[];
  neighborhoods: Neighborhood[];
}

export interface TripSummary {
  id: string;
  slug: string;
  destination: string;
  days: number;
  created_at: string;
}

export interface TripFull extends TripSummary {
  travel_style: string;
  start_date: string | null;
  airport_entry: string | null;
  airport_exit: string | null;
  document: TripDocument;
}

export interface TripBriefIn {
  text: string;
  start_date?: string;
  airport_entry?: string;
  airport_exit?: string;
}

export type TripStreamEvent =
  | { type: "status"; message: string }
  | { type: "progress"; chars: number }
  | { type: "place"; place: Place }
  | { type: "done"; slug: string };
