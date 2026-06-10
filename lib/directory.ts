export type HubCategory =
  | "organic" | "permanent_commercial" | "permanent_community"
  | "popup" | "traveling" | "spanish_immersion" | "online";

export type CostBucket = "free" | "low" | "mid" | "high" | "unlisted";
export type Participation = "family" | "dropoff" | "";

export interface DirectoryHub {
  id: string;
  name: string;
  host: string;
  category: HubCategory; // primary category — drives the pin colour and first badge
  categories?: HubCategory[]; // full set incl. primary, for hubs that span more than one (e.g. commercial pop-up)
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
  monthRange?: [number, number]; // [from, to] inclusive, 1-12; wraps the year-end when from > to (e.g. [11, 3] = Nov–Mar)
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

/** A hub's category list, falling back to just the primary when none is set. */
export const hubCategories = (h: DirectoryHub): HubCategory[] =>
  h.categories && h.categories.length > 0 ? h.categories : [h.category];

/**
 * "Available anywhere" = no fixed place on the map. True when a hub has no
 * coordinates OR is an online program (some online hubs carry a country
 * centroid, but pinning them confuses people scanning for real locations).
 * Drives the Map vs. Online & Anywhere tab split in the explorer.
 */
export const isAnywhereHub = (h: DirectoryHub): boolean =>
  h.coords === null || hubCategories(h).includes("online");

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
    if (f.monthRange) {
      const [s, e] = f.monthRange;
      const inRange = (m: number) => (s <= e ? m >= s && m <= e : m >= s || m <= e); // wrap when s > e
      const flexible = h.months.length === 0; // year-round / flexible hubs always pass
      if (!flexible && !h.months.some(inRange)) return false;
    }
    if (f.costs && f.costs.length > 0 && !f.costs.includes(h.costBucket)) return false;
    if (f.categories && f.categories.length > 0) {
      const cats = h.categories && h.categories.length > 0 ? h.categories : [h.category];
      if (!cats.some((c) => f.categories!.includes(c))) return false;
    }
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

const MONTH_NUMS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

/**
 * Returns true only when the season string contains an explicit end date that
 * has already passed — e.g. "March 30 – April 6 2026". Conservative: returns
 * false for ambiguous strings like "Nov–Apr" (no year) or "Year-round".
 */
export function isDirectoryHubPast(h: DirectoryHub, today = new Date()): boolean {
  // Match the trailing end date: "– Month DD YYYY" or "– Month DDth YYYY"
  const m = h.season.match(/[–-]\s*([A-Za-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?\s+(\d{4})\s*$/);
  if (!m) return false;
  const mon = MONTH_NUMS[m[1].toLowerCase().slice(0, 3)];
  if (!mon) return false;
  const end = new Date(parseInt(m[3]), mon - 1, parseInt(m[2]));
  return end < today;
}
