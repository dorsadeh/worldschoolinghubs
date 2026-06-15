// scripts/mentions-to-directory.ts
/**
 * Emit the new-organic-town build inputs from the mention-mining results:
 *  - rows appended to data/research/approved-candidates.csv (type=organic)
 *  - precise coords merged into data/research/geocoded-coords.json
 *  - an id→placeId map at data/research/mentions/new-organic-map.json (consumed by build-explorer)
 *
 * Re-runnable: rows/coords/map for these ids are replaced, not duplicated.
 * Usage: npm run mentions:to-directory
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { CSV_COLUMNS, type CsvRow } from "../lib/intake/inbox";
import type { ScoredPlace, ScoredFile } from "../lib/intake/mentions";

export interface SeedTown { canonical: string; country: string; newName: string; newId: string; region: string }

export const SEED_TOWNS: SeedTown[] = [
  { canonical: "Bali", country: "Indonesia", newName: "Bali", newId: "bali", region: "Bali" },
  { canonical: "Oaxaca", country: "Mexico", newName: "Oaxaca", newId: "oaxaca", region: "Oaxaca" },
  { canonical: "San Miguel de Allende", country: "Mexico", newName: "San Miguel de Allende", newId: "san-miguel-de-allende", region: "San Miguel de Allende" },
  { canonical: "Luxor", country: "Egypt", newName: "Luxor", newId: "luxor", region: "Luxor" },
  { canonical: "Cusco", country: "Peru", newName: "Cusco", newId: "cusco", region: "Cusco" },
  { canonical: "Krabi", country: "Thailand", newName: "Krabi", newId: "krabi", region: "Krabi" },
  { canonical: "La Barra", country: "Uruguay", newName: "La Barra", newId: "la-barra", region: "La Barra" },
  { canonical: "La Herradura", country: "Spain", newName: "La Herradura", newId: "la-herradura", region: "La Herradura" },
  { canonical: "Antigua", country: "Guatemala", newName: "Antigua, Guatemala", newId: "antigua-guatemala", region: "Antigua" },
  { canonical: "Playa del Carmen", country: "Mexico", newName: "Playa del Carmen", newId: "playa-del-carmen", region: "Playa del Carmen" },
];

export interface BuildResult {
  rows: CsvRow[];
  coords: Record<string, [number, number]>;
  idToPlaceId: Record<string, string>;
  collisions: string[];   // newIds that clash with an existing directory id
  missing: string[];      // seed canonicals not found in the scored data
}

export function buildNewOrganic(seeds: SeedTown[], places: ScoredPlace[], existingIds: Set<string>): BuildResult {
  const rows: CsvRow[] = [];
  const coords: Record<string, [number, number]> = {};
  const idToPlaceId: Record<string, string> = {};
  const collisions: string[] = [];
  const missing: string[] = [];
  for (const s of seeds) {
    if (existingIds.has(s.newId)) collisions.push(s.newId);
    const place = places.find((p) => p.canonicalName === s.canonical && p.country === s.country)
      ?? places.find((p) => p.canonicalName === s.canonical);
    if (!place) { missing.push(s.canonical); continue; }
    rows.push({
      name: s.newName, type: "organic", country: s.country, region_city: s.region,
      season_dates: "", ages: "", price: "", website: "", facebook_instagram: "", host: "",
      source_directory: "mention-mining", confidence: "mention-mining", dedup_status: "NEW",
      notes: `Organic place surfaced by mention-mining (${place.independentDomains} independent sources)`,
    });
    if (place.coords) coords[s.newId] = place.coords;
    idToPlaceId[s.newId] = place.placeId;
  }
  return { rows, coords, idToPlaceId, collisions, missing };
}

function toCsvLine(row: CsvRow): string {
  return CSV_COLUMNS.map((c) => {
    const v = row[c] ?? "";
    return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
  }).join(",");
}

function main() {
  const ROOT = process.cwd();
  const RESEARCH = join(ROOT, "data", "research");
  const SCORED = join(RESEARCH, "mentions", "organic-places-scored.json");
  const CSV = join(RESEARCH, "approved-candidates.csv");
  const GEO = join(RESEARCH, "geocoded-coords.json");
  const MAP = join(RESEARCH, "mentions", "new-organic-map.json");
  const DIRJSON = join(ROOT, "public", "directory.json");

  const places = (JSON.parse(readFileSync(SCORED, "utf8")) as ScoredFile).places;
  const existingIds = new Set((JSON.parse(readFileSync(DIRJSON, "utf8")) as { id: string }[]).map((h) => h.id));
  const r = buildNewOrganic(SEED_TOWNS, places, existingIds);
  if (r.collisions.length) { console.error(`ID COLLISION with existing directory ids: ${r.collisions.join(", ")} — pick distinct newIds.`); process.exit(1); }
  if (r.missing.length) { console.error(`MISSING from scored data: ${r.missing.join(", ")}`); process.exit(1); }

  // append/replace CSV rows for our ids (idempotent by name)
  const newNames = new Set(SEED_TOWNS.map((s) => s.newName));
  const lines = readFileSync(CSV, "utf8").split("\n");
  const header = lines[0];
  const kept = lines.slice(1).filter((l) => l.trim() && !newNames.has(l.split(",")[0].replace(/^"|"$/g, "")));
  const out = [header, ...kept, ...r.rows.map(toCsvLine)].join("\n") + "\n";
  writeFileSync(CSV, out);

  const geo: Record<string, [number, number] | null> = existsSync(GEO) ? JSON.parse(readFileSync(GEO, "utf8")) : {};
  Object.assign(geo, r.coords);
  writeFileSync(GEO, JSON.stringify(geo, null, 2) + "\n");

  writeFileSync(MAP, JSON.stringify(r.idToPlaceId, null, 2) + "\n");
  console.log(`emitted ${r.rows.length} organic rows, ${Object.keys(r.coords).length} coords, ${Object.keys(r.idToPlaceId).length} map entries.`);
}

if (process.argv[1] && process.argv[1].endsWith("mentions-to-directory.ts")) main();
