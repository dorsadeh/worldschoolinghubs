/**
 * Validate every hub JSON file against the schema, enforce unique ids, and print
 * dedup warnings for likely same-hub-different-source pairs.
 *
 * Usage: npm run validate
 * Exits non-zero on any schema error or duplicate id (CI-friendly).
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { HubSchema, type Hub } from "../lib/hub";
import { findDuplicateWarnings } from "../lib/dedup";

const HUBS_DIR = join(process.cwd(), "data", "hubs");

function main() {
  const files = readdirSync(HUBS_DIR).filter((f) => f.endsWith(".json"));
  const hubs: Hub[] = [];
  const errors: string[] = [];
  const idToFile = new Map<string, string>();

  for (const file of files) {
    const raw = JSON.parse(readFileSync(join(HUBS_DIR, file), "utf8"));
    const result = HubSchema.safeParse(raw);
    if (!result.success) {
      errors.push(`✗ ${file}\n  ${result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("\n  ")}`);
      continue;
    }
    const hub = result.data;
    if (idToFile.has(hub.id)) {
      errors.push(`✗ ${file}: duplicate id "${hub.id}" (also in ${idToFile.get(hub.id)})`);
      continue;
    }
    idToFile.set(hub.id, file);
    hubs.push(hub);
  }

  console.log(`Checked ${files.length} file(s), ${hubs.length} valid hub(s).`);

  const warnings = findDuplicateWarnings(hubs);
  if (warnings.length > 0) {
    console.log(`\n⚠ ${warnings.length} possible duplicate(s) to review:`);
    for (const w of warnings) console.log(`  - ${w.a} ↔ ${w.b}: ${w.reason}`);
  }

  if (errors.length > 0) {
    console.error(`\n${errors.length} error(s):\n${errors.join("\n")}`);
    process.exit(1);
  }
  console.log("\n✓ All hubs valid.");
}

main();
