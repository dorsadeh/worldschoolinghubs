// scripts/geocode-directory.ts
/**
 * One-time geocoding script: resolves city-level coordinates for directory
 * entries that lack a match in hubs.json, using the Nominatim API.
 *
 * Output: data/research/geocoded-coords.json  { [id]: [lat, lng] }
 *
 * Usage: npm run geocode   (or: tsx scripts/geocode-directory.ts)
 * Safe to re-run — already-geocoded IDs are skipped.
 *
 * Nominatim ToS: max 1 req/s, must set a User-Agent.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const SRC = join(ROOT, "data", "research", "directory-consolidated-2026-06-09.json");
const HUBS_JSON = join(ROOT, "public", "hubs.json");
const OUT = join(ROOT, "data", "research", "geocoded-coords.json");
const UA = "worldschooling-directory-geocoder/1.0 (dorobm@gmail.com)";
const DELAY_MS = 1100; // Nominatim: 1 req/s

type Coords = [number, number];

function cleanRegion(region: string): string {
  // Remove parenthetical notes: "Pai (northern highlands)" → "Pai"
  return region.replace(/\s*\(.*?\)/g, "").trim();
}

async function geocode(query: string): Promise<Coords | null> {
  const url =
    `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1&addressdetails=0`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, "Accept-Language": "en" },
    });
    if (!res.ok) { console.warn(`  HTTP ${res.status} for "${query}"`); return null; }
    const data = await res.json() as { lat: string; lon: string }[];
    if (data.length === 0) return null;
    return [parseFloat(data[0].lat), parseFloat(data[0].lon)];
  } catch (e) {
    console.warn(`  fetch error for "${query}":`, e);
    return null;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const source = JSON.parse(readFileSync(SRC, "utf8")) as { id: string; region?: string; country?: string }[];
  const hubs = JSON.parse(readFileSync(HUBS_JSON, "utf8")) as { id: string; location: { lat: number | null } }[];
  const preciseIds = new Set(hubs.filter((h) => typeof h.location?.lat === "number").map((h) => h.id));

  const existing: Record<string, Coords | null> = existsSync(OUT)
    ? JSON.parse(readFileSync(OUT, "utf8"))
    : {};

  const toGeocode = source.filter((e) => !preciseIds.has(e.id));
  console.log(`${toGeocode.length} entries to geocode (${Object.keys(existing).length} already cached)`);

  let resolved = 0, failed = 0;

  for (const entry of toGeocode) {
    if (entry.id in existing) continue; // already cached (including null)

    const region = cleanRegion(entry.region ?? "");
    const country = entry.country ?? "";

    let coords: Coords | null = null;

    if (region && country) {
      const q = `${region}, ${country}`;
      process.stdout.write(`  Geocoding: "${q}" ... `);
      coords = await geocode(q);
      if (!coords && region !== entry.region?.trim()) {
        // try original region as fallback
        coords = await geocode(`${entry.region}, ${country}`);
      }
    } else if (country) {
      process.stdout.write(`  Geocoding (country only): "${country}" ... `);
      coords = await geocode(country);
    } else {
      process.stdout.write(`  Skipping "${entry.id}" (no region or country)\n`);
      existing[entry.id] = null;
      continue;
    }

    if (coords) {
      const [lat, lng] = coords;
      console.log(`[${lat.toFixed(4)}, ${lng.toFixed(4)}]`);
      resolved++;
    } else {
      console.log("NOT FOUND");
      failed++;
    }

    existing[entry.id] = coords;
    writeFileSync(OUT, JSON.stringify(existing, null, 2) + "\n");
    await sleep(DELAY_MS);
  }

  console.log(`\nDone: ${resolved} resolved, ${failed} failed`);
  console.log(`Results saved to ${OUT}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
