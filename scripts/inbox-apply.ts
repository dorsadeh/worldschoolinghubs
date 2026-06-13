/**
 * Apply user decisions over the candidate inbox:
 *  - approved candidates → rows appended to data/research/approved-candidates.csv
 *    (a build_directory.py input), with aggregator-URL enforcement
 *  - rejected candidates → names added to data/research/inbox/rejected.json
 *  - processed candidates removed from the inbox
 *
 * Decisions file: data/research/inbox/inbox-decisions.json
 *   { "<cid>": { "decision": "approve"|"reject",
 *                "name"?, "country"?, "region"?, "categoryGuess"?,
 *                "providerUrl"?, "urlType"?, "notes"? } }
 *
 * Usage: npm run inbox:apply
 */
import { readFileSync, writeFileSync, appendFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  loadInbox, saveInbox, loadRejected, saveRejected, normName,
  candidateToCsvRow, CSV_COLUMNS, type InboxCandidate,
} from "../lib/intake/inbox";
import { loadAggregatorRegistry, isAggregatorUrl } from "../lib/intake/registry";

const RESEARCH = join(process.cwd(), "data", "research");
const DECISIONS = join(RESEARCH, "inbox", "inbox-decisions.json");
const APPROVED_CSV = join(RESEARCH, "approved-candidates.csv");

interface InboxDecision {
  decision: "approve" | "reject";
  name?: string; country?: string; region?: string; categoryGuess?: string;
  providerUrl?: string | null; urlType?: "site" | "social"; notes?: string;
}

function csvEscape(v: string): string {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

function main() {
  if (!existsSync(DECISIONS)) {
    console.error(`No ${DECISIONS} — export decisions from the inbox review page first.`);
    process.exit(1);
  }
  const decisions = JSON.parse(readFileSync(DECISIONS, "utf8")) as Record<string, InboxDecision>;
  const inbox = loadInbox();
  const rejected = loadRejected();
  const registry = loadAggregatorRegistry();
  const byCid = new Map(inbox.candidates.map((c) => [c.cid, c]));

  let approved = 0, rejectedN = 0;
  const csvLines: string[] = [];
  const processed = new Set<string>();

  for (const [cid, d] of Object.entries(decisions)) {
    const c = byCid.get(cid);
    if (!c) { console.warn("decision for unknown cid (skipped):", cid); continue; }
    processed.add(cid);
    if (d.decision === "reject") {
      rejected.names.push(normName(c.name));
      rejectedN++;
      continue;
    }
    // approve — decision fields override candidate fields
    const merged: InboxCandidate = { ...c, ...Object.fromEntries(
      Object.entries(d).filter(([k, v]) => k !== "decision" && v !== undefined)) };
    if (merged.providerUrl && isAggregatorUrl(merged.providerUrl, registry)) {
      console.warn(`aggregator URL stripped from approved candidate ${cid}: ${merged.providerUrl}`);
      merged.providerUrl = null;
    }
    const row = candidateToCsvRow(merged);
    csvLines.push(CSV_COLUMNS.map((col) => csvEscape(row[col])).join(","));
    approved++;
  }

  if (csvLines.length) appendFileSync(APPROVED_CSV, csvLines.join("\n") + "\n");
  inbox.candidates = inbox.candidates.filter((c) => !processed.has(c.cid));
  saveInbox(inbox);
  saveRejected(rejected);
  console.log(`approved ${approved} → approved-candidates.csv | rejected ${rejectedN} → rejected.json ` +
    `| ${inbox.candidates.length} still in inbox. Rebuild: data/research/make.sh --no-fetch && npm run build:explorer`);
}

main();
