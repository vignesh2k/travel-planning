/**
 * Curated list of ~170 major international airports for typeahead.
 * IATA code, airport name, city, country. Sorted alphabetically by code.
 *
 * Not exhaustive — regional / smaller airports fall back to free-text in
 * AirportInput (any 3 uppercase chars are accepted as a code).
 */

export interface Airport {
  code: string;     // IATA, 3 chars uppercase
  name: string;
  city: string;
  country: string;
}

export const AIRPORTS: readonly Airport[] = [
  { code: "ABV", name: "Nnamdi Azikiwe Intl", city: "Abuja", country: "Nigeria" },
  { code: "ACC", name: "Kotoka Intl", city: "Accra", country: "Ghana" },
  { code: "ADD", name: "Bole Intl", city: "Addis Ababa", country: "Ethiopia" },
  { code: "AKL", name: "Auckland", city: "Auckland", country: "New Zealand" },
  { code: "AMS", name: "Schiphol", city: "Amsterdam", country: "Netherlands" },
  { code: "ARN", name: "Stockholm Arlanda", city: "Stockholm", country: "Sweden" },
  { code: "ATH", name: "Eleftherios Venizelos", city: "Athens", country: "Greece" },
  { code: "ATL", name: "Hartsfield–Jackson", city: "Atlanta", country: "USA" },
  { code: "AUH", name: "Abu Dhabi Intl", city: "Abu Dhabi", country: "UAE" },
  { code: "BCN", name: "Barcelona–El Prat", city: "Barcelona", country: "Spain" },
  { code: "BER", name: "Berlin Brandenburg", city: "Berlin", country: "Germany" },
  { code: "BHX", name: "Birmingham", city: "Birmingham", country: "UK" },
  { code: "BKK", name: "Suvarnabhumi", city: "Bangkok", country: "Thailand" },
  { code: "BLR", name: "Kempegowda Intl", city: "Bengaluru", country: "India" },
  { code: "BNE", name: "Brisbane", city: "Brisbane", country: "Australia" },
  { code: "BOG", name: "El Dorado Intl", city: "Bogotá", country: "Colombia" },
  { code: "BOM", name: "Chhatrapati Shivaji Maharaj Intl", city: "Mumbai", country: "India" },
  { code: "BOS", name: "Boston Logan", city: "Boston", country: "USA" },
  { code: "BRU", name: "Brussels", city: "Brussels", country: "Belgium" },
  { code: "BSB", name: "Brasília Intl", city: "Brasília", country: "Brazil" },
  { code: "BUD", name: "Budapest Ferenc Liszt", city: "Budapest", country: "Hungary" },
  { code: "CAI", name: "Cairo Intl", city: "Cairo", country: "Egypt" },
  { code: "CCU", name: "Netaji Subhas Chandra Bose Intl", city: "Kolkata", country: "India" },
  { code: "CDG", name: "Charles de Gaulle", city: "Paris", country: "France" },
  { code: "CGK", name: "Soekarno–Hatta", city: "Jakarta", country: "Indonesia" },
  { code: "CMB", name: "Bandaranaike Intl", city: "Colombo", country: "Sri Lanka" },
  { code: "CMN", name: "Mohammed V Intl", city: "Casablanca", country: "Morocco" },
  { code: "CPH", name: "Copenhagen", city: "Copenhagen", country: "Denmark" },
  { code: "CPT", name: "Cape Town Intl", city: "Cape Town", country: "South Africa" },
  { code: "CTS", name: "New Chitose", city: "Sapporo", country: "Japan" },
  { code: "DCA", name: "Reagan National", city: "Washington", country: "USA" },
  { code: "DEL", name: "Indira Gandhi Intl", city: "Delhi", country: "India" },
  { code: "DEN", name: "Denver Intl", city: "Denver", country: "USA" },
  { code: "DFW", name: "Dallas/Fort Worth", city: "Dallas", country: "USA" },
  { code: "DMK", name: "Don Mueang", city: "Bangkok", country: "Thailand" },
  { code: "DOH", name: "Hamad Intl", city: "Doha", country: "Qatar" },
  { code: "DPS", name: "Ngurah Rai", city: "Bali / Denpasar", country: "Indonesia" },
  { code: "DUB", name: "Dublin", city: "Dublin", country: "Ireland" },
  { code: "DXB", name: "Dubai Intl", city: "Dubai", country: "UAE" },
  { code: "EDI", name: "Edinburgh", city: "Edinburgh", country: "UK" },
  { code: "EWR", name: "Newark Liberty", city: "New York", country: "USA" },
  { code: "EZE", name: "Ministro Pistarini", city: "Buenos Aires", country: "Argentina" },
  { code: "FCO", name: "Leonardo da Vinci Fiumicino", city: "Rome", country: "Italy" },
  { code: "FLR", name: "Florence", city: "Florence", country: "Italy" },
  { code: "FRA", name: "Frankfurt", city: "Frankfurt", country: "Germany" },
  { code: "GIG", name: "Galeão", city: "Rio de Janeiro", country: "Brazil" },
  { code: "GLA", name: "Glasgow", city: "Glasgow", country: "UK" },
  { code: "GMP", name: "Gimpo Intl", city: "Seoul", country: "South Korea" },
  { code: "GRU", name: "São Paulo–Guarulhos", city: "São Paulo", country: "Brazil" },
  { code: "GVA", name: "Geneva", city: "Geneva", country: "Switzerland" },
  { code: "HAJ", name: "Hannover", city: "Hannover", country: "Germany" },
  { code: "HAM", name: "Hamburg", city: "Hamburg", country: "Germany" },
  { code: "HAV", name: "José Martí Intl", city: "Havana", country: "Cuba" },
  { code: "HEL", name: "Helsinki-Vantaa", city: "Helsinki", country: "Finland" },
  { code: "HKG", name: "Hong Kong Intl", city: "Hong Kong", country: "Hong Kong" },
  { code: "HND", name: "Tokyo Haneda", city: "Tokyo", country: "Japan" },
  { code: "HNL", name: "Daniel K Inouye Intl", city: "Honolulu", country: "USA" },
  { code: "IAD", name: "Washington Dulles", city: "Washington", country: "USA" },
  { code: "IAH", name: "George Bush Intercontinental", city: "Houston", country: "USA" },
  { code: "ICN", name: "Incheon Intl", city: "Seoul", country: "South Korea" },
  { code: "IST", name: "Istanbul Airport", city: "Istanbul", country: "Türkiye" },
  { code: "ITM", name: "Osaka Itami", city: "Osaka", country: "Japan" },
  { code: "JED", name: "King Abdulaziz Intl", city: "Jeddah", country: "Saudi Arabia" },
  { code: "JFK", name: "John F. Kennedy", city: "New York", country: "USA" },
  { code: "JNB", name: "OR Tambo Intl", city: "Johannesburg", country: "South Africa" },
  { code: "KEF", name: "Keflavík", city: "Reykjavík", country: "Iceland" },
  { code: "KIX", name: "Kansai Intl", city: "Osaka", country: "Japan" },
  { code: "KRK", name: "John Paul II Intl", city: "Kraków", country: "Poland" },
  { code: "KUL", name: "Kuala Lumpur Intl", city: "Kuala Lumpur", country: "Malaysia" },
  { code: "KWI", name: "Kuwait Intl", city: "Kuwait City", country: "Kuwait" },
  { code: "LAS", name: "Harry Reid Intl", city: "Las Vegas", country: "USA" },
  { code: "LAX", name: "Los Angeles Intl", city: "Los Angeles", country: "USA" },
  { code: "LCY", name: "London City", city: "London", country: "UK" },
  { code: "LGA", name: "LaGuardia", city: "New York", country: "USA" },
  { code: "LGW", name: "Gatwick", city: "London", country: "UK" },
  { code: "LHR", name: "Heathrow", city: "London", country: "UK" },
  { code: "LIM", name: "Jorge Chávez Intl", city: "Lima", country: "Peru" },
  { code: "LIS", name: "Humberto Delgado", city: "Lisbon", country: "Portugal" },
  { code: "LOS", name: "Murtala Muhammed Intl", city: "Lagos", country: "Nigeria" },
  { code: "LPA", name: "Gran Canaria", city: "Las Palmas", country: "Spain" },
  { code: "LTN", name: "Luton", city: "London", country: "UK" },
  { code: "LYS", name: "Lyon–Saint-Exupéry", city: "Lyon", country: "France" },
  { code: "MAD", name: "Madrid–Barajas", city: "Madrid", country: "Spain" },
  { code: "MAN", name: "Manchester", city: "Manchester", country: "UK" },
  { code: "MEL", name: "Melbourne", city: "Melbourne", country: "Australia" },
  { code: "MEX", name: "Mexico City Intl", city: "Mexico City", country: "Mexico" },
  { code: "MIA", name: "Miami Intl", city: "Miami", country: "USA" },
  { code: "MLE", name: "Velana Intl", city: "Malé", country: "Maldives" },
  { code: "MNL", name: "Ninoy Aquino Intl", city: "Manila", country: "Philippines" },
  { code: "MRS", name: "Marseille Provence", city: "Marseille", country: "France" },
  { code: "MUC", name: "Munich", city: "Munich", country: "Germany" },
  { code: "MXP", name: "Milan Malpensa", city: "Milan", country: "Italy" },
  { code: "NAN", name: "Nadi Intl", city: "Nadi", country: "Fiji" },
  { code: "NAP", name: "Naples Intl", city: "Naples", country: "Italy" },
  { code: "NBO", name: "Jomo Kenyatta Intl", city: "Nairobi", country: "Kenya" },
  { code: "NCE", name: "Nice Côte d'Azur", city: "Nice", country: "France" },
  { code: "NRT", name: "Tokyo Narita", city: "Tokyo", country: "Japan" },
  { code: "OPO", name: "Porto", city: "Porto", country: "Portugal" },
  { code: "ORD", name: "Chicago O'Hare", city: "Chicago", country: "USA" },
  { code: "ORY", name: "Paris Orly", city: "Paris", country: "France" },
  { code: "OSL", name: "Oslo Gardermoen", city: "Oslo", country: "Norway" },
  { code: "PDX", name: "Portland Intl", city: "Portland", country: "USA" },
  { code: "PEK", name: "Beijing Capital", city: "Beijing", country: "China" },
  { code: "PEN", name: "Penang Intl", city: "Penang", country: "Malaysia" },
  { code: "PER", name: "Perth", city: "Perth", country: "Australia" },
  { code: "PHL", name: "Philadelphia Intl", city: "Philadelphia", country: "USA" },
  { code: "PMI", name: "Palma de Mallorca", city: "Palma", country: "Spain" },
  { code: "PPT", name: "Faaʻa Intl", city: "Papeete (Tahiti)", country: "French Polynesia" },
  { code: "PRG", name: "Václav Havel Prague", city: "Prague", country: "Czechia" },
  { code: "PTY", name: "Tocumen Intl", city: "Panama City", country: "Panama" },
  { code: "PVG", name: "Shanghai Pudong", city: "Shanghai", country: "China" },
  { code: "PVR", name: "Puerto Vallarta", city: "Puerto Vallarta", country: "Mexico" },
  { code: "RUH", name: "King Khalid Intl", city: "Riyadh", country: "Saudi Arabia" },
  { code: "SAN", name: "San Diego Intl", city: "San Diego", country: "USA" },
  { code: "SCL", name: "Arturo Merino Benítez", city: "Santiago", country: "Chile" },
  { code: "SEA", name: "Seattle–Tacoma", city: "Seattle", country: "USA" },
  { code: "SFO", name: "San Francisco Intl", city: "San Francisco", country: "USA" },
  { code: "SGN", name: "Tan Son Nhat", city: "Ho Chi Minh City", country: "Vietnam" },
  { code: "SIN", name: "Singapore Changi", city: "Singapore", country: "Singapore" },
  { code: "SJU", name: "Luis Muñoz Marín Intl", city: "San Juan", country: "Puerto Rico" },
  { code: "STN", name: "Stansted", city: "London", country: "UK" },
  { code: "SVO", name: "Sheremetyevo", city: "Moscow", country: "Russia" },
  { code: "SYD", name: "Sydney Kingsford Smith", city: "Sydney", country: "Australia" },
  { code: "TLL", name: "Tallinn", city: "Tallinn", country: "Estonia" },
  { code: "TLV", name: "Ben Gurion", city: "Tel Aviv", country: "Israel" },
  { code: "TPE", name: "Taoyuan Intl", city: "Taipei", country: "Taiwan" },
  { code: "TXL", name: "Tegel (closed)", city: "Berlin", country: "Germany" },
  { code: "VCE", name: "Marco Polo", city: "Venice", country: "Italy" },
  { code: "VIE", name: "Vienna Intl", city: "Vienna", country: "Austria" },
  { code: "VLC", name: "Valencia", city: "Valencia", country: "Spain" },
  { code: "VNO", name: "Vilnius", city: "Vilnius", country: "Lithuania" },
  { code: "WAW", name: "Warsaw Chopin", city: "Warsaw", country: "Poland" },
  { code: "YHZ", name: "Halifax Stanfield", city: "Halifax", country: "Canada" },
  { code: "YOW", name: "Ottawa Macdonald–Cartier", city: "Ottawa", country: "Canada" },
  { code: "YUL", name: "Montréal–Trudeau", city: "Montréal", country: "Canada" },
  { code: "YVR", name: "Vancouver Intl", city: "Vancouver", country: "Canada" },
  { code: "YYC", name: "Calgary Intl", city: "Calgary", country: "Canada" },
  { code: "YYZ", name: "Toronto Pearson", city: "Toronto", country: "Canada" },
  { code: "ZRH", name: "Zürich", city: "Zürich", country: "Switzerland" },
];

const _BY_CODE: Map<string, Airport> = new Map(
  AIRPORTS.map((a) => [a.code, a]),
);

export function airportByCode(code: string): Airport | null {
  return _BY_CODE.get(code.toUpperCase()) ?? null;
}

/**
 * Filter airports for typeahead. Matches against code, city, and name
 * (case-insensitive substring). Returns up to `limit` results, sorted
 * with code-prefix matches first, then city-prefix, then everything else.
 */
export function searchAirports(query: string, limit = 8): Airport[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const codePrefix: Airport[] = [];
  const cityPrefix: Airport[] = [];
  const other: Airport[] = [];

  for (const a of AIRPORTS) {
    const code = a.code.toLowerCase();
    const city = a.city.toLowerCase();
    const name = a.name.toLowerCase();
    if (code.startsWith(q)) {
      codePrefix.push(a);
    } else if (city.startsWith(q)) {
      cityPrefix.push(a);
    } else if (
      city.includes(q) || name.includes(q) || code.includes(q)
    ) {
      other.push(a);
    }
  }

  return [...codePrefix, ...cityPrefix, ...other].slice(0, limit);
}
