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

export interface ItineraryBulletGroup {
  time: "Morning" | "Afternoon" | "Evening";
  items: string[];
}

export interface ItineraryDay {
  number: number;
  title: string;
  bullets: ItineraryBulletGroup[];
}

export interface TripDocument {
  document_markdown: string;
  places: Place[];
  neighborhoods: Neighborhood[];
  restaurants: string[][];
  itinerary: ItineraryDay[];
}

export interface TripSummary {
  id: string;
  slug: string;
  destination: string;
  days: number;
  start_date: string | null;
  centroid_lat: number | null;
  centroid_lng: number | null;
  created_at: string;
}

export interface TripFull extends TripSummary {
  travel_style: string;
  airport_entry: string | null;
  airport_exit: string | null;
  document: TripDocument;
  share_token: string | null;
  is_saved: boolean;
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

export type BudgetTier = "cheap" | "mid" | "premium";
export type Pace = "relaxed" | "balanced" | "packed";

export interface UserProfileIn {
  diet?: string | null;
  budget?: BudgetTier | null;
  pace?: Pace | null;
  interests?: string[];
  notes?: string | null;
}

export interface UserProfile extends UserProfileIn {
  updated_at: string;
}

export interface BudgetItem {
  name: string;
  amount: number;
}

export interface BudgetBreakdownLine {
  label: string;
  amount: number;
}

export interface BudgetDay {
  number: number;
  title: string;
  estimated: number;
  breakdown?: BudgetBreakdownLine[];
  override: number | null;
  items: BudgetItem[];
}

export interface Budget {
  trip_id: string;
  currency: string;
  gbp_rate: number;
  gbp_rate_date: string;
  days: BudgetDay[];
  updated_at: string;
}

export interface BudgetDayIn {
  override: number | null;
  items: BudgetItem[];
}

export interface PdfCostCategory {
  name: "Lodging" | "Food" | "Activities" | "Transport";
  amount: number;
  gbp_amount: number;
}

export interface PdfCosts {
  currency: string;
  gbp_rate: number;
  categories: PdfCostCategory[];
  total_local: number;
  total_gbp: number;
}

export interface ShareOut {
  share_url: string;
  token: string;
}

export interface PublicTrip {
  slug: string;
  destination: string;
  days: number;
  start_date: string | null;
  document: TripDocument;
  created_at: string;
}
