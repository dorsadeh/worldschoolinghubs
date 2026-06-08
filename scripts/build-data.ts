/**
 * Merge all validated hub files into a single public/hubs.json.
 * The app reads hubs directly via lib/hubs.ts, but this combined file is handy
 * for external consumers and the future spreadsheet-export feature.
 *
 * Usage: npm run build:data
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { getAllHubs } from "../lib/hubs";

function main() {
  const hubs = getAllHubs();
  const out = join(process.cwd(), "public", "hubs.json");
  writeFileSync(out, JSON.stringify(hubs, null, 2) + "\n");
  console.log(`Wrote ${hubs.length} hub(s) to public/hubs.json`);
}

main();
