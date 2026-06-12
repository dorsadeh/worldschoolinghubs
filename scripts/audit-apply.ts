/**
 * Merge user decisions (data/research/link-audit-decisions.json) over the audit
 * (data/research/link-audit.json) into data/research/overrides.json, which
 * build_directory.py applies on the next rebuild.
 *
 * Usage: npm run audit:apply
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { applyDecisions, type DecisionsFile, type OverrideEntry } from "../lib/intake/apply";

const RESEARCH = join(process.cwd(), "data", "research");
const AUDIT = join(RESEARCH, "link-audit.json");
const DECISIONS = join(RESEARCH, "link-audit-decisions.json");
const OVERRIDES = join(RESEARCH, "overrides.json");

function main() {
  if (!existsSync(DECISIONS)) {
    console.error(`No ${DECISIONS} — write decisions first (see the audit report's final section).`);
    process.exit(1);
  }
  if (!existsSync(AUDIT)) {
    console.error(`${AUDIT} not found — run \`npm run audit:links\` first.`);
    process.exit(1);
  }
  const audit = JSON.parse(readFileSync(AUDIT, "utf8")) as {
    records: { id: string; proposedUrl?: string | null; proposedUrlType?: "site" | "social"; proposedCategory?: string }[];
  };
  const decisions = JSON.parse(readFileSync(DECISIONS, "utf8")) as DecisionsFile;
  const existing = existsSync(OVERRIDES)
    ? (JSON.parse(readFileSync(OVERRIDES, "utf8")) as Record<string, OverrideEntry>)
    : {};

  const merged = applyDecisions(audit.records, decisions, existing);

  const approvedIds = Object.entries(decisions)
    .filter(([, d]) => d.decision === "approve").map(([id]) => id);
  const noEffect = approvedIds.filter((id) => merged[id] === undefined && existing[id] === undefined);
  if (noEffect.length) {
    console.warn("approved but nothing to apply (no proposed/explicit fields):", noEffect.join(", "));
  }

  const sorted = Object.fromEntries(Object.entries(merged).sort(([a], [b]) => a.localeCompare(b)));
  // Use indent=2 to match the existing overrides.json format (stable round-trip with Python json.dump(indent=2)).
  writeFileSync(OVERRIDES, JSON.stringify(sorted, null, 2) + "\n");
  console.log(`overrides.json now has ${Object.keys(sorted).length} entries ` +
    `(${approvedIds.length} approvals processed). Rebuild with: ` +
    `data/research/make.sh --no-fetch && npm run build:explorer`);
}

main();
