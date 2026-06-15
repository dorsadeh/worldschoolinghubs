// lib/intake/mentions.ts
import { slugify } from "./inbox";

export type SourceKind = "personal-blog" | "press" | "directory" | "hub-site" | "forum";
export type SourceStatus = "active" | "frontier" | "rejected";

export interface SourceEntry {
  domain: string;
  name: string;
  kind: SourceKind;
  lang: string;
  weight: number | null;          // null ⇒ use the kind default
  status: SourceStatus;
  seedUrls: string[];
  addedAt: string;
  notes: string;
}
export interface SourceRegistry { updatedAt: string; sources: SourceEntry[] }

export interface PlaceMention {
  place: string;
  country?: string;
  snippet: string;
  nestingClaim: boolean;
  asOfDate: string;               // "YYYY-MM" | "YYYY-MM-DD" | "unknown"
}
export interface OutboundLink { url: string; anchor: string }
export interface SnapshotPage {
  url: string;
  contentHash: string;
  placeMentions: PlaceMention[];
  outboundLinks: OutboundLink[];
}
export interface Snapshot { domain: string; extractedAt: string; pages: SnapshotPage[] }

export interface Place {
  placeId: string;
  canonicalName: string;
  country: string;                // display name, e.g. "Thailand"
  cc: string;                     // ISO2, lowercased, e.g. "th"
  coords: [number, number] | null;
  aliases: string[];
  existingHubIds: string[];
  firstSeen: string;
}
export interface PlacesFile { updatedAt: string; places: Place[] }

export interface LedgerMention {
  placeId: string;
  domain: string;
  kind: SourceKind;
  url: string;
  snippet: string;
  nestingClaim: boolean;
  date: string;                   // "YYYY-MM" | "YYYY-MM-DD" | "unknown"
  addedAt: string;
}
export interface LedgerFile { updatedAt: string; mentions: LedgerMention[] }

export type Tier = "established" | "emerging" | "watch";
export interface ScoredSource { domain: string; kind: SourceKind; url: string; snippet: string; date: string }
export interface ScoredPlace {
  placeId: string;
  canonicalName: string;
  country: string;
  coords: [number, number] | null;
  score: number;
  tier: Tier;
  independentDomains: number;
  matchedExistingHubIds: string[];
  sources: ScoredSource[];
}
export interface ScoredFile { computedAt: string; places: ScoredPlace[] }

export function placeId(canonicalName: string, countryCode: string): string {
  return `${slugify(canonicalName)}--${countryCode.toLowerCase()}`;
}

export const KIND_WEIGHTS: Record<SourceKind, number> = {
  "personal-blog": 1.0, press: 0.9, forum: 0.7, directory: 0.5, "hub-site": 0.2,
};

export function kindWeight(kind: SourceKind, override: number | null = null): number {
  return override ?? KIND_WEIGHTS[kind];
}

/** 1.0 ≤18mo, 0.5 ≤5y, 0.3 older; 0.6 for unknown/unparseable.
 *  Precondition: `date` is "YYYY-MM", "YYYY-MM-DD", or "unknown" (the agent's asOfDate
 *  contract). Other shapes fall through to Date.parse; the NaN→0.6 guard covers garbage. */
export function recencyFactor(date: string, now: string = new Date().toISOString().slice(0, 10)): number {
  if (!date || date === "unknown") return 0.6;
  const norm = date.length === 7 ? `${date}-01` : date;
  const d = Date.parse(norm), n = Date.parse(now);
  if (Number.isNaN(d) || Number.isNaN(n)) return 0.6;
  const months = (n - d) / (30 * 86_400_000);
  if (months <= 18) return 1.0;
  if (months <= 60) return 0.5;
  return 0.3;
}

export function claimFactor(nestingClaim: boolean): number {
  return nestingClaim ? 1.0 : 0.4;
}

/** Keep the first mention per domain (one vote), then sum weighted contributions. */
function dedupeByDomain(mentions: LedgerMention[]): LedgerMention[] {
  const byDomain = new Map<string, LedgerMention>();
  for (const m of mentions) if (!byDomain.has(m.domain)) byDomain.set(m.domain, m);
  return [...byDomain.values()];
}

export function scorePlace(
  mentions: LedgerMention[],
  weightByDomain: Record<string, number | null> = {},
  now: string = new Date().toISOString().slice(0, 10),
): number {
  let sum = 0;
  for (const m of dedupeByDomain(mentions)) {
    sum += kindWeight(m.kind, weightByDomain[m.domain] ?? null) * recencyFactor(m.date, now) * claimFactor(m.nestingClaim);
  }
  return Math.round(sum * 100) / 100;
}

export function independentDomainCount(mentions: LedgerMention[]): number {
  return new Set(mentions.filter((m) => m.kind !== "hub-site").map((m) => m.domain)).size;
}

export function tierOf(independentDomains: number): Tier {
  if (independentDomains >= 6) return "established";
  if (independentDomains >= 3) return "emerging";
  return "watch";
}

/** Upsert by (placeId, domain) — one vote per domain. On collision the incoming `m`
 *  overwrites the stored url/snippet/date (last-write-wins), so callers should process
 *  pages in a consistent order to keep stored evidence deterministic across re-runs. */
export function ledgerUpsert(ledger: LedgerMention[], m: LedgerMention): LedgerMention[] {
  const i = ledger.findIndex((x) => x.placeId === m.placeId && x.domain === m.domain);
  if (i >= 0) ledger[i] = { ...ledger[i], ...m };
  else ledger.push(m);
  return ledger;
}

export function upsertPlace(places: Place[], p: Place): Place[] {
  const i = places.findIndex((x) => x.placeId === p.placeId);
  if (i < 0) { places.push(p); return places; }
  const ex = places[i];
  places[i] = {
    ...ex,
    canonicalName: ex.canonicalName || p.canonicalName,
    coords: ex.coords ?? p.coords,
    aliases: [...new Set([...ex.aliases, ...p.aliases])].sort(),
    existingHubIds: [...new Set([...ex.existingHubIds, ...p.existingHubIds])].sort(),
    firstSeen: ex.firstSeen, // earliest wins
  };
  return places;
}

export function haversineKm(a: [number, number], b: [number, number]): number {
  const R = 6371, toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b[0] - a[0]), dLon = toRad(b[1] - a[1]);
  const s = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/** Same-country place within radius ⇒ the same canonical place (geocode = dedup key). */
export function findPlaceByCoords(
  places: Place[], coords: [number, number], cc: string, radiusKm = 10,
): Place | null {
  for (const p of places) {
    if (p.coords && p.cc.toLowerCase() === cc.toLowerCase() && haversineKm(coords, p.coords) <= radiusKm) return p;
  }
  return null;
}

export interface HubCoord { id: string; coords: [number, number] | null; country: string }

/** Existing directory hubs within radiusKm. Per spec the country acts as a guard only
 *  "when both are known": an empty query country OR an empty hub country skips the check
 *  and falls back to pure proximity (two points ≤25km are the same locale). */
export function matchExistingHub(
  coords: [number, number] | null, country: string, hubs: HubCoord[], radiusKm = 25,
): string[] {
  if (!coords) return [];
  const c = country.trim().toLowerCase();
  return hubs
    .filter((h) => h.coords
      && (!c || !h.country || h.country.trim().toLowerCase() === c)
      && haversineKm(coords, h.coords) <= radiusKm)
    .map((h) => h.id);
}

export function domainOf(url: string): string | null {
  try { return new URL(url).hostname.replace(/^www\./, "").toLowerCase(); }
  catch { return null; }
}

/** Unwrap a markdown-link-wrapped url (`[text](href)`) and validate it. Returns a clean
 *  http(s) URL or null (internal whitespace or non-http ⇒ malformed). */
export function cleanSeedUrl(raw: string): string | null {
  let s = raw.trim();
  const md = s.match(/^\[[^\]]*\]\(([^)]+)\)$/);
  if (md) s = md[1].trim();
  if (/\s/.test(s)) return null;
  if (!/^https?:\/\//i.test(s)) return null;
  return s;
}

/** Extract the first balanced top-level JSON array substring from text, tolerating trailing
 *  content (e.g. an LLM's markdown footnote list after the array). String-aware so brackets
 *  inside string values don't fool the depth counter. Returns the input if no '[' is found. */
export function extractJsonArray(text: string): string {
  const start = text.indexOf("[");
  if (start < 0) return text;
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === "[") depth++;
    else if (ch === "]" && --depth === 0) return text.slice(start, i + 1);
  }
  return text.slice(start);
}

export function nextFrontierDomains(outbound: OutboundLink[], registry: SourceRegistry): string[] {
  const known = new Set(registry.sources.map((s) => s.domain));
  const found = new Set<string>();
  for (const l of outbound) { const d = domainOf(l.url); if (d && !known.has(d)) found.add(d); }
  return [...found].sort();
}

/** URLs whose fresh content hash differs from (or is absent in) the previous snapshot hashes. */
export function changedUrls(fresh: Record<string, string>, prev: Record<string, string> | null): string[] {
  return Object.keys(fresh).filter((u) => !prev || prev[u] !== fresh[u]);
}
