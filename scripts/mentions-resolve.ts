// scripts/mentions-resolve.ts
/**
 * Resolve raw place mentions (from snapshots) into canonical, geocoded, deduped places.
 * Geocode proximity is the dedup key. Writes places.json + mention-ledger.json and
 * appends newly-seen outbound domains to source-registry.json as `frontier`.
 *
 * Usage: npm run mentions:resolve
 * Nominatim ToS: ≤1 req/s, must set a User-Agent. Geocode results are cached.
 */
import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  placeId as makePlaceId, findPlaceByCoords, matchExistingHub, upsertPlace, ledgerUpsert,
  nextFrontierDomains, domainOf,
  type Snapshot, type PlacesFile, type LedgerFile, type LedgerMention,
  type SourceRegistry, type SourceEntry, type HubCoord, type SourceKind,
} from "../lib/intake/mentions";

const ROOT = process.cwd();
const MENT = join(ROOT, "data", "research", "mentions");
const SNAPDIR = join(MENT, "snapshots");
const REGISTRY = join(MENT, "source-registry.json");
const PLACES = join(MENT, "places.json");
const LEDGER = join(MENT, "mention-ledger.json");
const DIRJSON = join(ROOT, "public", "directory.json");
const GEOCACHE = join(MENT, "geocode-cache.json");
const UA = "worldschooling-mention-miner/1.0 (dorobm@gmail.com)";
const CLUSTER_KM = 10, EXISTING_HUB_KM = 25;

type GeoHit = { lat: number; lon: number; cc: string; name: string } | null;

async function geocode(query: string): Promise<GeoHit> {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1&addressdetails=1`;
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "en" } });
    if (!res.ok) return null;
    const data = await res.json() as { lat: string; lon: string; address?: { country_code?: string; country?: string } }[];
    if (!data.length) return null;
    const d = data[0];
    return { lat: parseFloat(d.lat), lon: parseFloat(d.lon), cc: d.address?.country_code ?? "", name: d.address?.country ?? "" };
  } catch { return null; }
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface DirHub { id: string; category?: string; categories?: string[]; country?: string; coords?: [number, number] | null }

async function main() {
  const registry = JSON.parse(readFileSync(REGISTRY, "utf8")) as SourceRegistry;
  const kindByDomain = new Map(registry.sources.map((s) => [s.domain, s.kind] as [string, SourceKind]));

  const places: PlacesFile = existsSync(PLACES) ? JSON.parse(readFileSync(PLACES, "utf8")) : { updatedAt: "", places: [] };
  const ledgerFile: LedgerFile = existsSync(LEDGER) ? JSON.parse(readFileSync(LEDGER, "utf8")) : { updatedAt: "", mentions: [] };
  const geoCache: Record<string, GeoHit> = existsSync(GEOCACHE) ? JSON.parse(readFileSync(GEOCACHE, "utf8")) : {};

  // Existing organic directory hubs (for proximity linking).
  const hubs: HubCoord[] = (JSON.parse(readFileSync(DIRJSON, "utf8")) as DirHub[])
    .filter((h) => (h.category === "organic" || h.categories?.includes("organic")) && h.coords)
    .map((h) => ({ id: h.id, coords: h.coords ?? null, country: h.country ?? "" }));

  const today = new Date().toISOString().slice(0, 10);
  const snapFiles = existsSync(SNAPDIR) ? readdirSync(SNAPDIR).filter((f) => f.endsWith(".json")) : [];
  let mentionsSeen = 0, parked = 0;
  const allOutbound: { url: string; anchor: string }[] = [];

  for (const f of snapFiles) {
    const snap = JSON.parse(readFileSync(join(SNAPDIR, f), "utf8")) as Snapshot;
    const kind = kindByDomain.get(snap.domain) ?? "directory";
    for (const page of snap.pages) {
      allOutbound.push(...page.outboundLinks);
      for (const pm of page.placeMentions) {
        mentionsSeen++;
        const query = pm.country ? `${pm.place}, ${pm.country}` : pm.place;
        let hit: GeoHit;
        if (query in geoCache) {
          hit = geoCache[query];
        } else {
          hit = await geocode(query);
          geoCache[query] = hit;
          writeFileSync(GEOCACHE, JSON.stringify(geoCache, null, 2) + "\n");
          await sleep(1100);
        }

        let pid: string;
        if (!hit) {
          // Ambiguous/unresolved → park with null coords (review page flags it).
          pid = makePlaceId(pm.place, "xx");
          upsertPlace(places.places, {
            placeId: pid, canonicalName: pm.place, country: pm.country ?? "", cc: "xx",
            coords: null, aliases: [pm.place], existingHubIds: [], firstSeen: today,
          });
          parked++;
        } else {
          const coords: [number, number] = [hit.lat, hit.lon];
          const existing = findPlaceByCoords(places.places, coords, hit.cc, CLUSTER_KM);
          if (existing) {
            pid = existing.placeId;
            upsertPlace(places.places, { ...existing, aliases: [...existing.aliases, pm.place] });
          } else {
            pid = makePlaceId(pm.place, hit.cc || "xx");
            const existingHubIds = matchExistingHub(coords, hit.name || pm.country || "", hubs, EXISTING_HUB_KM);
            upsertPlace(places.places, {
              placeId: pid, canonicalName: pm.place, country: hit.name || pm.country || "", cc: hit.cc || "xx",
              coords, aliases: [pm.place], existingHubIds, firstSeen: today,
            });
          }
        }

        const m: LedgerMention = {
          placeId: pid, domain: snap.domain, kind, url: page.url,
          snippet: pm.snippet, nestingClaim: pm.nestingClaim,
          date: pm.asOfDate || "unknown", addedAt: today,
        };
        ledgerUpsert(ledgerFile.mentions, m);
      }
    }
  }

  // Append unknown outbound domains as frontier sources.
  const frontier = nextFrontierDomains(allOutbound, registry);
  for (const domain of frontier) {
    if (domainOf(`https://${domain}`) === null) continue;
    const entry: SourceEntry = {
      domain, name: domain, kind: "directory", lang: "en", weight: null,
      status: "frontier", seedUrls: [], addedAt: today,
      notes: "discovered via outbound link — review before crawling",
    };
    registry.sources.push(entry);
  }
  registry.sources.sort((a, b) => a.domain.localeCompare(b.domain));
  registry.updatedAt = new Date().toISOString();

  places.updatedAt = new Date().toISOString();
  ledgerFile.updatedAt = new Date().toISOString();
  writeFileSync(PLACES, JSON.stringify(places, null, 2) + "\n");
  writeFileSync(LEDGER, JSON.stringify(ledgerFile, null, 2) + "\n");
  writeFileSync(REGISTRY, JSON.stringify(registry, null, 2) + "\n");

  console.log(`resolved ${mentionsSeen} mentions → ${places.places.length} places ` +
    `(${parked} parked, no geocode), ${ledgerFile.mentions.length} ledger rows, ` +
    `+${frontier.length} frontier domains.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
