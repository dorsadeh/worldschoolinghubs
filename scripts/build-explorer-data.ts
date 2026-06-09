// scripts/build-explorer-data.ts
/**
 * Enrich the consolidated worldschooling directory into a client-ready
 * public/directory.json: derive months[] + costBucket, resolve coords from a
 * country-centroid table (reusing precise coords from data/hubs/*.json when an id
 * matches), and copy referenced local images into public/directory-images/.
 *
 * Usage: npm run build:explorer
 */
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync } from "node:fs";
import { join, basename } from "node:path";
import { parseMonths } from "../lib/season";
import { costBucket } from "../lib/cost";
import type { DirectoryHub, HubCategory } from "../lib/directory";

const ROOT = process.cwd();
const RESEARCH = join(ROOT, "data", "research");
const SRC = join(RESEARCH, "directory-consolidated-2026-06-09.json");
const CENTROIDS = join(RESEARCH, "country-centroids.json");
const HUBS_JSON = join(ROOT, "public", "hubs.json");
const IMG_OUT = join(ROOT, "public", "directory-images");
const OUT = join(ROOT, "public", "directory.json");

const VALID_CATEGORIES: HubCategory[] = [
  "organic", "permanent_commercial", "permanent_community",
  "popup", "traveling", "spanish_immersion", "online",
];

function primaryCountry(raw: string): string {
  return (raw || "").split(/[+,(]/)[0].trim();
}

function main() {
  const raw = JSON.parse(readFileSync(SRC, "utf8")) as Record<string, unknown>[];
  const centroids = JSON.parse(readFileSync(CENTROIDS, "utf8")) as Record<string, [number, number]>;
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

    let coords: [number, number] | null = hubCoords.get(id) ?? null;
    if (!coords) {
      const c = centroids[primaryCountry(country)];
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
    };
  });

  writeFileSync(OUT, JSON.stringify(out, null, 2) + "\n");
  console.log(`Wrote ${out.length} hubs to public/directory.json`);
  console.log(`  ${placed} placed on map, ${out.length - placed} not placeable`);
  console.log(`  ${copied} images copied to public/directory-images/`);
}

main();
