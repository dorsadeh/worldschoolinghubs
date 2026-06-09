export type HubCategory =
  | "organic" | "permanent_commercial" | "permanent_community"
  | "popup" | "traveling" | "spanish_immersion" | "online";

export type CostBucket = "free" | "low" | "mid" | "high" | "unlisted";
export type Participation = "family" | "dropoff" | "";

export interface DirectoryHub {
  id: string;
  name: string;
  host: string;
  category: HubCategory;
  spanish: boolean;
  participation: Participation;
  country: string;
  region: string;
  season: string;
  months: number[];
  price: string;
  costBucket: CostBucket;
  ages: string;
  nationality: string;
  validity: string;
  website: string;
  facebook: string;
  summary: string;
  references: [string, string][];
  image: string;
  coords: [number, number] | null;
}

export interface DirectoryFilter {
  months?: number[];
  costs?: CostBucket[];
  categories?: HubCategory[];
  participation?: Exclude<Participation, "">[]; // only "family" | "dropoff" are selectable
  spanishOnly?: boolean;
  countries?: string[];
  query?: string;
}

/** Label, accent colour, and emoji per hub type — used by cards, pins, legend, filter pills. */
export const CATEGORY_META: Record<HubCategory, { label: string; color: string; emoji: string }> = {
  organic: { label: "Organic", color: "#3f9e57", emoji: "🌳" },
  permanent_commercial: { label: "Commercial", color: "#7b4dff", emoji: "🏫" },
  permanent_community: { label: "Community", color: "#1aa18c", emoji: "🌿" },
  popup: { label: "Pop-up", color: "#ff4d6d", emoji: "🎪" },
  traveling: { label: "Traveling", color: "#4d7dff", emoji: "⛰️" },
  spanish_immersion: { label: "Spanish", color: "#f0a500", emoji: "🗣️" },
  online: { label: "Online", color: "#7a8699", emoji: "💻" },
};

export const COST_META: Record<CostBucket, string> = {
  free: "Free", low: "$", mid: "$$", high: "$$$", unlisted: "Not listed",
};

const searchText = (h: DirectoryHub) =>
  [h.name, h.host, h.summary, h.country, h.region].filter(Boolean).join(" ").toLowerCase();

/** Pure, testable filtering for the explorer UI. AND across facets, OR within. */
export function filterDirectory(hubs: DirectoryHub[], f: DirectoryFilter): DirectoryHub[] {
  const q = f.query?.trim().toLowerCase();
  return hubs.filter((h) => {
    if (f.months && f.months.length > 0) {
      const flexible = h.months.length === 0;
      if (!flexible && !f.months.some((m) => h.months.includes(m))) return false;
    }
    if (f.costs && f.costs.length > 0 && !f.costs.includes(h.costBucket)) return false;
    if (f.categories && f.categories.length > 0 && !f.categories.includes(h.category)) return false;
    if (f.participation && f.participation.length > 0) {
      if (h.participation === "" || !f.participation.includes(h.participation)) return false;
    }
    if (f.spanishOnly && !h.spanish) return false;
    if (f.countries && f.countries.length > 0 && !f.countries.includes(h.country)) return false;
    if (q && !searchText(h).includes(q)) return false;
    return true;
  });
}

/** Sorted, de-duplicated non-empty countries present in the data, for the country filter. */
export function uniqueDirectoryCountries(hubs: DirectoryHub[]): string[] {
  const set = new Set<string>();
  for (const h of hubs) if (h.country) set.add(h.country);
  return [...set].sort((a, b) => a.localeCompare(b));
}
