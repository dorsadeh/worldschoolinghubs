// scripts/mentions-ingest-sources.ts
/**
 * Ingest LLM blog/source-discovery output into the mention-mining source registry.
 *
 * Reads every `data/research/*blogs*.{txt,json}` file (the JSON produced by the
 * blog-discovery prompt — tolerant of trailing markdown footnotes and markdown-wrapped
 * URLs), normalizes + dedups the candidates against each other and the existing registry,
 * and appends genuinely-new domains as `active` sources. Re-runnable and idempotent:
 * already-known domains are skipped.
 *
 * Usage: npm run mentions:ingest-sources
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  extractJsonArray, cleanSeedUrl, domainOf,
  type SourceRegistry, type SourceEntry, type SourceKind,
} from "../lib/intake/mentions";

const ROOT = process.cwd();
const RESEARCH = join(ROOT, "data", "research");
const REGISTRY = join(RESEARCH, "mentions", "source-registry.json");
const KINDS = new Set<SourceKind>(["personal-blog", "press", "directory", "forum", "hub-site"]);

interface RawCandidate {
  name?: string; domain?: string; kind?: string; lang?: string;
  seedUrls?: string[]; examplePlaces?: string[]; why?: string; asOf?: string;
}
interface Merged {
  domain: string; name: string; kind: SourceKind; lang: string;
  seedUrls: string[]; examplePlaces: string[]; why: string; asOf: string; llms: Set<string>;
}

function normDomain(d: string): string {
  const s = d.trim().toLowerCase();
  if (/^https?:\/\//.test(s)) return domainOf(s) ?? s;
  return s.replace(/^www\./, "").replace(/\/.*$/, "");
}

function main() {
  const files = existsSync(RESEARCH)
    ? readdirSync(RESEARCH).filter((f) => /blogs/i.test(f) && /\.(txt|json)$/i.test(f)).sort()
    : [];
  if (files.length === 0) {
    console.error(`No *blogs*.{txt,json} files found in ${RESEARCH}.`);
    process.exit(1);
  }

  const merged = new Map<string, Merged>();
  for (const file of files) {
    let arr: RawCandidate[];
    try {
      arr = JSON.parse(extractJsonArray(readFileSync(join(RESEARCH, file), "utf8"))) as RawCandidate[];
    } catch (e) {
      console.warn(`  ${file}: could not parse JSON array — skipped (${e instanceof Error ? e.message : e})`);
      continue;
    }
    let parsed = 0;
    for (const raw of arr) {
      if (!raw.domain) continue;
      const domain = normDomain(raw.domain);
      if (!domain) continue;
      parsed++;
      const kind: SourceKind = KINDS.has(raw.kind as SourceKind) ? (raw.kind as SourceKind) : "directory";
      const seedUrls = (raw.seedUrls ?? []).map(cleanSeedUrl).filter((u): u is string => u !== null);
      const ex = merged.get(domain);
      if (ex) {
        ex.seedUrls = [...new Set([...ex.seedUrls, ...seedUrls])];
        ex.examplePlaces = [...new Set([...ex.examplePlaces, ...(raw.examplePlaces ?? [])])];
        ex.llms.add(file);
        if (!ex.why && raw.why) ex.why = raw.why;
      } else {
        merged.set(domain, {
          domain, name: raw.name?.trim() || domain, kind, lang: raw.lang?.trim() || "en",
          seedUrls, examplePlaces: raw.examplePlaces ?? [], why: raw.why ?? "",
          asOf: raw.asOf ?? "unknown", llms: new Set([file]),
        });
      }
    }
    console.log(`  ${file}: ${parsed} candidates`);
  }

  const registry: SourceRegistry = JSON.parse(readFileSync(REGISTRY, "utf8"));
  const known = new Set(registry.sources.map((s) => s.domain));
  const today = new Date().toISOString().slice(0, 10);

  let added = 0, noSeed = 0;
  const skippedKnown: string[] = [];
  for (const c of [...merged.values()].sort((a, b) => a.domain.localeCompare(b.domain))) {
    if (known.has(c.domain)) { skippedKnown.push(c.domain); continue; }
    // A source with no usable post URL still gets its homepage so the planner can crawl it.
    const seedUrls = c.seedUrls.length ? c.seedUrls : [`https://${c.domain}/`];
    if (!c.seedUrls.length) noSeed++;
    const why = c.why.replace(/\s*\(\[[^\]]*\]\[[0-9]+\]\)/g, "").trim(); // strip [name][n] citation tokens
    const places = c.examplePlaces.slice(0, 8).join(", ");
    const note = `LLM-discovered (${[...c.llms].join(", ")}; asOf ${c.asOf})`
      + (places ? `; places: ${places}` : "")
      + (why ? ` — ${why}` : "");
    const entry: SourceEntry = {
      domain: c.domain, name: c.name, kind: c.kind, lang: c.lang, weight: null,
      status: "active", seedUrls, addedAt: today, notes: note.slice(0, 400),
    };
    registry.sources.push(entry);
    known.add(c.domain);
    added++;
  }

  registry.sources.sort((a, b) => a.domain.localeCompare(b.domain));
  registry.updatedAt = new Date().toISOString();
  writeFileSync(REGISTRY, JSON.stringify(registry, null, 2) + "\n");

  console.log(`\ningested ${merged.size} distinct candidate domains → +${added} new sources ` +
    `(${skippedKnown.length} already known, ${noSeed} added with homepage-only seed). ` +
    `Registry now ${registry.sources.length} sources.`);
  if (skippedKnown.length) console.log(`  already known: ${skippedKnown.join(", ")}`);
}

main();
