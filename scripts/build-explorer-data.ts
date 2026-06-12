// scripts/build-explorer-data.ts
/**
 * Enrich the consolidated worldschooling directory into a client-ready
 * public/directory.json: derive months[] + costBucket, resolve coords from:
 *   1. data/hubs/*.json precise coords (when id matches)
 *   2. data/research/geocoded-coords.json (Nominatim city-level geocoding)
 *   3. country-centroid table as last resort
 * and copy referenced local images into public/directory-images/.
 *
 * Usage: npm run build:explorer
 */
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync } from "node:fs";
import { join, basename } from "node:path";
import { parseMonths } from "../lib/season";
import { costBucket } from "../lib/cost";
import type { DirectoryHub, HubCategory, HubEnrichment } from "../lib/directory";

const ROOT = process.cwd();
const RESEARCH = join(ROOT, "data", "research");
const SRC = join(RESEARCH, "directory-consolidated-2026-06-09.json");
const CENTROIDS = join(RESEARCH, "country-centroids.json");
const GEOCODED = join(RESEARCH, "geocoded-coords.json");
const ENRICH = join(RESEARCH, "enrichment.json");
const HUBS_JSON = join(ROOT, "public", "hubs.json");
const IMG_OUT = join(ROOT, "public", "directory-images");
const OUT = join(ROOT, "public", "directory.json");

const VALID_CATEGORIES: HubCategory[] = [
  "organic", "permanent_commercial", "permanent_community",
  "popup", "traveling", "spanish_immersion",
  "online_communities", "junk", "inactive",
];

function primaryCountry(raw: string): string {
  return (raw || "").split(/[+,(]/)[0].trim();
}

function main() {
  const raw = JSON.parse(readFileSync(SRC, "utf8")) as Record<string, unknown>[];
  const centroids = JSON.parse(readFileSync(CENTROIDS, "utf8")) as Record<string, [number, number]>;
  const geocoded: Record<string, [number, number] | null> = existsSync(GEOCODED)
    ? JSON.parse(readFileSync(GEOCODED, "utf8"))
    : {};
  const enrichment: Record<string, HubEnrichment> = existsSync(ENRICH)
    ? JSON.parse(readFileSync(ENRICH, "utf8"))
    : {};
  const hubs = JSON.parse(readFileSync(HUBS_JSON, "utf8")) as {
    id: string; location: { lat: number | null; lng: number | null };
  }[];
  const hubCoords = new Map<string, [number, number]>();
  for (const h of hubs) {
    if (typeof h.location?.lat === "number" && typeof h.location?.lng === "number") {
      hubCoords.set(h.id, [h.location.lat, h.location.lng]);
    }
  }

  mkdirSync(IMG_OUT, { recursive: true });

  let placed = 0, copied = 0;
  const out: DirectoryHub[] = raw.map((e) => {
    const id = String(e.id);
    const country = String(e.country ?? "");
    const category = (VALID_CATEGORIES.includes(e.category as HubCategory)
      ? e.category : "organic") as HubCategory;
    // Optional source `categories` lets a hub span more than one type (e.g. a
    // commercial pop-up). Always includes the primary first, de-duplicated.
    const extra = (Array.isArray(e.categories) ? e.categories : [])
      .filter((c): c is HubCategory => VALID_CATEGORIES.includes(c as HubCategory));
    const categories = [...new Set<HubCategory>([category, ...extra])];

    const enrich = enrichment[id];

    let coords: [number, number] | null =
      hubCoords.get(id) ??          // 1. precise coords from curated hubs.json
      geocoded[id] ??               // 2. city-level from Nominatim geocoding
      null;
    if (!coords) {
      // 3. enrichment's exact location — only fills a gap, never replaces precise coords
      const ec = enrich?.exactLocation?.coords;
      if (Array.isArray(ec) && ec.length === 2) coords = [ec[0], ec[1]];
    }
    if (!coords) {
      const c = centroids[primaryCountry(country)]; // 4. country centroid last resort
      if (c) coords = c;
    }
    if (coords) placed++;

    let image = String(e.thumb ?? "");
    const photo = String(e.photo ?? "");
    if (photo && !photo.startsWith("data:")) {
      const srcPath = join(RESEARCH, photo);
      if (existsSync(srcPath)) {
        const file = basename(photo);
        copyFileSync(srcPath, join(IMG_OUT, file));
        image = `/directory-images/${file}`;
        copied++;
      }
    }

    const refs = Array.isArray(e.references)
      ? (e.references as [string, string][])
      : [];

    return {
      id,
      name: String(e.name ?? ""),
      host: String(e.host ?? ""),
      category,
      categories,
      spanish: Boolean(e.spanish),
      participation: (e.participation as DirectoryHub["participation"]) ?? "",
      country,
      region: String(e.region ?? ""),
      season: String(e.season ?? ""),
      months: parseMonths(String(e.season ?? "")),
      price: String(e.price ?? ""),
      costBucket: costBucket(String(e.price ?? "")),
      ages: String(e.ages ?? ""),
      nationality: String(e.nationality ?? ""),
      validity: String(e.validity ?? ""),
      website: String(e.website ?? ""),
      facebook: String(e.facebook ?? ""),
      summary: String(e.summary ?? ""),
      references: refs,
      image,
      coords,
      ...(enrich ? { enrichment: enrich } : {}),
    };
  });

  writeFileSync(OUT, JSON.stringify(out, null, 2) + "\n");
  console.log(`Wrote ${out.length} hubs to public/directory.json`);
  console.log(`  ${placed} placed on map, ${out.length - placed} not placeable`);
  console.log(`  ${copied} images copied to public/directory-images/`);
}

main();
