/**
 * Apply hub-validation verdicts:
 *   - high-confidence (fix/junk/inactive/merge) → merged into data/research/overrides.json
 *   - everything that needed a human (medium/low confidence) → docs/validation-flags-YYYY-MM-DD.md
 *   - high-confidence keep → no action
 * Reuses the existing overrides.json → build_directory.py apply path.
 *
 * Usage: npm run validation:apply
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { loadAggregatorRegistry } from "../lib/intake/registry";
import {
  partitionResults, validationToOverride,
  type ResultsFile, type ValidationResult, type OverrideEntry,
} from "../lib/intake/validation";

const ROOT = process.cwd();
const RESEARCH = join(ROOT, "data", "research");
const RESULTS = join(RESEARCH, "validation", "results.json");
const OVERRIDES = join(RESEARCH, "overrides.json");

function main() {
  if (!existsSync(RESULTS)) {
    console.error(`${RESULTS} not found — run the validator first (see validation/runbook.md).`);
    process.exit(1);
  }
  const results = (JSON.parse(readFileSync(RESULTS, "utf8")) as ResultsFile).results;
  const registry = loadAggregatorRegistry();
  const existing: Record<string, OverrideEntry> = existsSync(OVERRIDES)
    ? JSON.parse(readFileSync(OVERRIDES, "utf8"))
    : {};

  const { apply, flag } = partitionResults(results, registry);

  // merge auto-applies into overrides.json (sorted, indent 2 — matches the committed file)
  const merged: Record<string, OverrideEntry> = { ...existing };
  for (const r of apply) {
    const o = validationToOverride(r, registry)!;
    merged[r.id] = { ...merged[r.id], ...o };
  }
  const sorted = Object.fromEntries(Object.entries(merged).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(OVERRIDES, JSON.stringify(sorted, null, 2) + "\n");

  // flags report for the human-review minority
  const date = new Date().toISOString().slice(0, 10);
  const FLAGS = join(ROOT, "docs", `validation-flags-${date}.md`);
  const cell = (s: unknown) => String(s ?? "—").replace(/[\r\n]+/g, " ").replace(/\|/g, "\\|");
  let md = `# Validation flags — ${date}\n\n${flag.length} hubs need your eyes (medium/low confidence). ` +
    `${apply.length} high-confidence verdicts were auto-applied to overrides.json.\n\n` +
    `| id | status | conf | disposition | dupOf | note | evidence |\n|---|---|---|---|---|---|---|\n`;
  for (const r of flag) {
    md += `| ${cell(r.id)} | ${cell(r.status)} | ${cell(r.confidence)} | ${cell(r.disposition)} | ` +
      `${cell(r.dupOf)} | ${cell(r.note)} | ${cell((r.evidence ?? []).join("; "))} |\n`;
  }
  md += `\n## How to act\nReview each row; to apply one, add its fix to \`data/research/overrides.json\` by hand, ` +
    `then rebuild (\`cd data/research && ./make.sh --no-fetch && cd .. && npm run build:explorer\`).\n`;
  writeFileSync(FLAGS, md);

  console.log(`applied ${apply.length} high-confidence → overrides.json (${Object.keys(sorted).length} total) | ` +
    `flagged ${flag.length} → ${FLAGS}`);
}

main();
