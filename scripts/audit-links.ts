/**
 * Stage-1 link audit: fetch every directory entry's website URL, classify it
 * against the aggregator/provider source model, write data/research/link-audit.json.
 *
 * Re-runs preserve agent-written resolution fields (proposedUrl etc.) and feed
 * previous verdicts into the two-failures-≥7-days-apart "dead" rule.
 *
 * Usage: npm run audit:links            (all entries)
 *        npm run audit:links -- --limit 10   (smoke test on first 10)
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { loadAggregatorRegistry, normalizeUrl } from "../lib/intake/registry";
import {
  classifyLink, latestYearMentioned, suspectedAggregatorDomains,
  type FetchOutcome, type LinkVerdict, type PrevCheck,
} from "../lib/intake/audit";

const RESEARCH = join(process.cwd(), "data", "research");
const SRC = join(RESEARCH, "directory-consolidated-2026-06-09.json");
const OUT = join(RESEARCH, "link-audit.json");
const CONCURRENCY = 8;
const TIMEOUT_MS = 15_000;

interface Entry { id: string; name: string; category: string; country: string; website: string }

interface AuditRecord {
  id: string; name: string; category: string; country: string;
  url: string | null; status: number | null; finalUrl: string | null;
  verdict: LinkVerdict; latestYear: number | null; checkedAt: string;
  proposedUrl?: string | null; proposedUrlType?: "site" | "social";
  proposedCategory?: "junk"; resolutionNote?: string;
}

interface AuditFile {
  generatedAt: string;
  counts: Record<string, number>;
  suspectedAggregators: string[];
  records: AuditRecord[];
}

async function fetchOutcome(url: string): Promise<FetchOutcome> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: ctl.signal,
      headers: { "user-agent": "Mozilla/5.0 (compatible; worldschooling-directory-audit)" },
    });
    const text = (await res.text()).slice(0, 50_000);
    return { url, status: res.status, finalUrl: res.url, bodyText: text };
  } catch {
    return { url, status: null, finalUrl: null, bodyText: "" };
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  const limitArg = process.argv.indexOf("--limit");
  const limit = limitArg >= 0 ? Number(process.argv[limitArg + 1]) : Infinity;

  const entries = (JSON.parse(readFileSync(SRC, "utf8")) as Entry[]).slice(0, limit);
  const registry = loadAggregatorRegistry();
  const prevById = new Map<string, AuditRecord>();
  if (existsSync(OUT)) {
    for (const r of (JSON.parse(readFileSync(OUT, "utf8")) as AuditFile).records) {
      prevById.set(r.id, r);
    }
  }

  const records: AuditRecord[] = new Array(entries.length);
  let next = 0;
  async function worker() {
    while (next < entries.length) {
      const i = next++;
      const e = entries[i];
      const prev = prevById.get(e.id);
      const url = normalizeUrl(e.website);
      const checkedAt = new Date().toISOString();
      let rec: AuditRecord;
      if (!url) {
        rec = { id: e.id, name: e.name, category: e.category, country: e.country,
          url: null, status: null, finalUrl: null, verdict: "no-url",
          latestYear: null, checkedAt };
      } else {
        const outcome = await fetchOutcome(url);
        const prevCheck: PrevCheck | undefined =
          prev && prev.url === url ? { verdict: prev.verdict, checkedAt: prev.checkedAt } : undefined;
        const verdict = classifyLink(outcome, registry, prevCheck);
        rec = { id: e.id, name: e.name, category: e.category, country: e.country,
          url, status: outcome.status, finalUrl: outcome.finalUrl, verdict,
          latestYear: outcome.bodyText ? latestYearMentioned(outcome.bodyText) : null,
          checkedAt };
      }
      // Agent-written resolution survives re-fetches:
      if (prev?.proposedUrl !== undefined) rec.proposedUrl = prev.proposedUrl;
      if (prev?.proposedUrlType) rec.proposedUrlType = prev.proposedUrlType;
      if (prev?.proposedCategory) rec.proposedCategory = prev.proposedCategory;
      if (prev?.resolutionNote) rec.resolutionNote = prev.resolutionNote;
      records[i] = rec;
      console.log(`${rec.verdict.padEnd(15)} ${e.id}`);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  const counts: Record<string, number> = {};
  for (const r of records) counts[r.verdict] = (counts[r.verdict] ?? 0) + 1;
  const out: AuditFile = {
    generatedAt: new Date().toISOString(),
    counts,
    suspectedAggregators: suspectedAggregatorDomains(
      records.map((r) => r.url).filter((u): u is string => !!u), registry),
    records,
  };
  writeFileSync(OUT, JSON.stringify(out, null, 1) + "\n");
  console.log("\ncounts:", counts);
  console.log("suspected aggregators:", out.suspectedAggregators);
  console.log("wrote", OUT);
}

main();
