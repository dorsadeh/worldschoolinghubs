import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { HubSchema, type Hub } from "./hub";

const HUBS_DIR = join(process.cwd(), "data", "hubs");

/**
 * Load and validate every hub JSON file. Server-only: the App Router page calls
 * this at build/render time and passes plain data to client components.
 * Invalid files throw loudly — we never want half-broken records on the map.
 */
export function getAllHubs(): Hub[] {
  let files: string[];
  try {
    files = readdirSync(HUBS_DIR).filter((f) => f.endsWith(".json"));
  } catch {
    return []; // no data yet
  }

  return files
    .map((file) => {
      const raw = JSON.parse(readFileSync(join(HUBS_DIR, file), "utf8"));
      const result = HubSchema.safeParse(raw);
      if (!result.success) {
        throw new Error(`Invalid hub file ${file}:\n${result.error.message}`);
      }
      return result.data;
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}
