import rawImageBlocklist from "../data/image-blocklist.json";
import type { HubMention } from "./intake/mentions";

export type HubCategory =
  | "organic" | "permanent_commercial" | "permanent_community"
  | "popup" | "traveling" | "spanish_immersion" | "summer_camp"
  // Hidden-from-site buckets (kept in the data, never displayed — see HIDDEN_CATEGORIES):
  | "online_communities" | "junk" | "inactive";

export type CostBucket = "free" | "low" | "mid" | "high" | "unlisted";
export type Participation = "family" | "dropoff" | "";

export type Confidence = "high" | "med" | "low";

/** A dated cohort/session/gathering for a hub. Window: now → end of 2027. */
export interface HubEvent {
  title: string;
  type: string; // cohort | session | retreat | popup | festival | conference | meetup | recurring-gathering
  startDate: string | null; // ISO 8601, or null when only a month/season is known
  endDate: string | null;
  recurrence?: string; // "annual" | "one-time"
  ageFocus?: string;
  price?: string;
  url?: string;
  confidence?: Confidence;
  asOf?: string;
}

/** Best / avoid seasonal windows — for hubs with no formal calendar. */
export interface HubTiming {
  bestWindow?: string;
  avoidWindow?: string;
  note?: string;
  source?: string;
  confidence?: Confidence;
}

export interface HubAgeRange {
  value?: string;
  minAge?: number | null;
  maxAge?: number | null;
  audience?: string; // kids | teens | all-ages | adults-too
  source?: string;
  confidence?: Confidence;
}

export interface HubPriceRange {
  value?: string;
  amount?: string | number | null;
  currency?: string;
  basis?: string; // per-family-per-month | per-child-per-program | cost-of-living | free
  source?: string;
  confidence?: Confidence;
}

export interface HubExactLocation {
  address?: string;
  locality?: string;
  region?: string;
  country?: string;
  coords?: [number, number] | null;
  source?: string;
  confidence?: Confidence;
}

export interface HubExtras {
  officialWebsite?: string | null;
  bookingUrl?: string | null;
  nationalitySkew?: string;
  participation?: string;
  languageOfInstruction?: string;
  communitySize?: string;
  legalVisaRisk?: string;
  otherNotes?: string;
}

/** A directory value the research contradicts — surfaced for human review, never auto-applied. */
export interface HubFlag {
  field: string;
  currentValue?: string;
  suggestedValue?: string;
  evidence?: string;
  confidence?: Confidence;
  note?: string;
}

/** Deep-research enrichment attached to a hub by id at build time. Purely additive. */
export interface HubEnrichment {
  events?: HubEvent[];
  timing?: HubTiming | null;
  ageRange?: HubAgeRange | null;
  priceRange?: HubPriceRange | null;
  exactLocation?: HubExactLocation | null;
  extras?: HubExtras | null;
  flags?: HubFlag[];
  researchStatus?: string; // researched | not-found | ambiguous
  sourcesRead?: string[];
  sources?: string[]; // which research run(s) produced this — e.g. ["gemini"]
}

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
  enrichment?: HubEnrichment; // deep-research overlay, attached by id at build time
  mentions?: HubMention[];    // blog/press mentions, attached by placeId at build time (mined organic hubs)
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

/** Label and accent colour per hub type — used by cards, pins, legend, filter pills. */
export const CATEGORY_META: Record<HubCategory, { label: string; color: string }> = {
  organic: { label: "Organic", color: "#16a34a" },
  permanent_commercial: { label: "Commercial", color: "#7c3aed" },
  permanent_community: { label: "Community", color: "#0d9488" },
  popup: { label: "Pop-up", color: "#e11d48" },
  traveling: { label: "Traveling", color: "#2563eb" },
  spanish_immersion: { label: "Spanish", color: "#d97706" },
  // Hidden buckets — present for type-completeness only; filtered out before any UI renders.
  summer_camp: { label: "Summer camp", color: "#b45309" },
  online_communities: { label: "Online community", color: "#7a8699" },
  junk: { label: "Junk", color: "#9aa0a6" },
  inactive: { label: "Inactive (no working link)", color: "#9aa0a6" },
};

/**
 * Categories kept in the data but never shown on the site. `junk` = dead/broken
 * listings parked for the record; `online_communities` = real virtual groups we
 * track but don't surface in the place-based explorer; `inactive` = real hubs
 * with no working link (current and proposed URLs both unreachable) — hidden
 * until a valid link is found; `summer_camp` = seasonal day-camps kept in the
 * data but not surfaced to users for now. Filtered at the data boundary (see
 * app/page.tsx) so no card, pin, tab, filter, or count includes them.
 */
export const HIDDEN_CATEGORIES = new Set<HubCategory>(["online_communities", "junk", "inactive", "summer_camp"]);

/** Categories that actually appear in the UI (filter pills, legend) — hidden ones removed. */
export const DISPLAY_CATEGORIES = (Object.keys(CATEGORY_META) as HubCategory[])
  .filter((c) => !HIDDEN_CATEGORIES.has(c));

/** True when a hub's every category is hidden — i.e. it should not appear on the site at all. */
export const isHiddenHub = (h: DirectoryHub): boolean =>
  hubCategories(h).every((c) => HIDDEN_CATEGORIES.has(c));

export const COST_META: Record<CostBucket, string> = {
  free: "Free", low: "$ budget", mid: "$$ mid", high: "$$$ premium", unlisted: "Price unlisted",
};

/** A hub's category list, falling back to just the primary when none is set. */
export const hubCategories = (h: DirectoryHub): HubCategory[] =>
  h.categories && h.categories.length > 0 ? h.categories : [h.category];

/**
 * "Available anywhere" = no fixed place on the map (no coordinates) — e.g. a
 * traveling program or a hub we couldn't geolocate. Drives the Map vs. Anywhere
 * tab split in the explorer.
 */
export const isAnywhereHub = (h: DirectoryHub): boolean => h.coords === null;

/** Hub ids whose stored image is junk (flag/logo/icon) or missing — render the placeholder instead. */
export const IMAGE_BLOCKLIST: ReadonlySet<string> = new Set(rawImageBlocklist as string[]);

/** The hub's usable card image, or null when absent/blocklisted (→ designed placeholder). */
export function hubImage(h: DirectoryHub, blocklist: ReadonlySet<string> = IMAGE_BLOCKLIST): string | null {
  if (!h.image || blocklist.has(h.id)) return null;
  return h.image;
}

/** Stable partition: hubs with a usable image first, placeholder hubs after. */
export function sortByImagePresence(hubs: DirectoryHub[], blocklist: ReadonlySet<string> = IMAGE_BLOCKLIST): DirectoryHub[] {
  const withImage: DirectoryHub[] = [];
  const without: DirectoryHub[] = [];
  for (const h of hubs) (hubImage(h, blocklist) ? withImage : without).push(h);
  return [...withImage, ...without];
}

/** Number of active facet selections (excludes the search query — it's visible in the header). */
export function countActiveFilters(f: DirectoryFilter): number {
  return (
    (f.monthRange ? 1 : 0) +
    (f.costs?.length ?? 0) +
    (f.categories?.length ?? 0) +
    (f.participation?.length ?? 0) +
    (f.spanishOnly ? 1 : 0) +
    (f.countries?.length ?? 0)
  );
}

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
