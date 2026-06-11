// scripts/build-enrichment.ts
/**
 * Merge deep-research enrichment from one or more external-LLM runs into a single
 * canonical map: data/research/enrichment.json (keyed by hub id).
 *
 * Inputs: every data/research/external_llm_researches/*enriched*.json file. Each is an
 * array of records following the enrichment schema (see data/research/enrichment-research-prompt.md).
 * The naming glob deliberately ignores the raw, unrepaired exports and the source directory
 * copy — only files whose name contains "enriched" are read.
 *
 * Merge rule when the same hub id appears in multiple runs: ChatGPT-class runs outrank
 * Gemini (the former genuinely live-researched + normalized the full set). Higher-priority
 * non-empty scalar/object fields win; events, flags, and sourcesRead are concatenated and
 * de-duplicated. Every record records which run(s) it came from in `sources`.
 *
 * Usage: npm run build:enrichment
 */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { HubEnrichment } from "../lib/directory";

const ROOT = process.cwd();
const SRC_DIR = join(ROOT, "data", "research", "external_llm_researches");
const OUT = join(ROOT, "data", "research", "enrichment.json");

type RawRecord = HubEnrichment & { id?: string; name?: string; country?: string };

/** Which research run a file came from, and its merge priority (higher wins). */
function sourceOf(filename: string): { source: string; priority: number } {
  const f = filename.toLowerCase();
  if (f.includes("gemini")) return { source: "gemini", priority: 1 };
  return { source: "chatgpt", priority: 2 }; // default: the richer, genuinely-researched run
}

const isBlank = (v: unknown): boolean =>
  v == null || v === "" || (Array.isArray(v) && v.length === 0) ||
  (typeof v === "object" && !Array.isArray(v) && Object.keys(v as object).length === 0);

const uniq = <T>(xs: T[]): T[] => {
  const seen = new Set<string>();
  return xs.filter((x) => {
    const k = typeof x === "string" ? x : JSON.stringify(x);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
};

function main() {
  const files = readdirSync(SRC_DIR)
    .filter((f) => f.toLowerCase().includes("enriched") && f.endsWith(".json"))
    .sort();

  if (files.length === 0) {
    console.warn(`No *enriched*.json files in ${SRC_DIR} — writing empty enrichment map.`);
  }

  // id -> { record, priority }
  const merged = new Map<string, { rec: HubEnrichment; priority: number }>();

  for (const file of files) {
    const { source, priority } = sourceOf(file);
    let records: RawRecord[];
    try {
      records = JSON.parse(readFileSync(join(SRC_DIR, file), "utf8")) as RawRecord[];
    } catch (err) {
      console.warn(`  skipped ${file}: not valid JSON (${(err as Error).message})`);
      continue;
    }
    if (!Array.isArray(records)) {
      console.warn(`  skipped ${file}: top level is not an array`);
      continue;
    }

    let used = 0;
    for (const r of records) {
      const id = r.id;
      if (!id) continue;
      used++;
      const incoming: HubEnrichment = { ...r, sources: [source] };
      const existing = merged.get(id);
      if (!existing) {
        merged.set(id, { rec: incoming, priority });
      } else {
        merged.set(id, {
          rec: mergeRecord(existing.rec, existing.priority, incoming, priority),
          priority: Math.max(existing.priority, priority),
        });
      }
    }
    console.log(`  ${file} → ${used} records (source: ${source})`);
  }

  const obj = Object.fromEntries([...merged.entries()].map(([id, v]) => [id, v.rec]));
  writeFileSync(OUT, JSON.stringify(obj, null, 2) + "\n");
  console.log(`Wrote ${merged.size} enriched hubs to data/research/enrichment.json`);
}

/** Combine two records for the same id. `hi`/`lo` decided by caller-passed priorities. */
function mergeRecord(
  a: HubEnrichment, ap: number, b: HubEnrichment, bp: number,
): HubEnrichment {
  const [hi, lo] = ap >= bp ? [a, b] : [b, a];
  const pick = <K extends keyof HubEnrichment>(k: K): HubEnrichment[K] =>
    (isBlank(hi[k]) ? lo[k] : hi[k]);

  return {
    events: uniq([...(a.events ?? []), ...(b.events ?? [])]),
    flags: uniq([...(a.flags ?? []), ...(b.flags ?? [])]),
    sourcesRead: uniq([...(a.sourcesRead ?? []), ...(b.sourcesRead ?? [])]),
    sources: uniq([...(a.sources ?? []), ...(b.sources ?? [])]),
    timing: pick("timing"),
    ageRange: pick("ageRange"),
    priceRange: pick("priceRange"),
    exactLocation: pick("exactLocation"),
    extras: pick("extras"),
    researchStatus: pick("researchStatus"),
  };
}

main();
