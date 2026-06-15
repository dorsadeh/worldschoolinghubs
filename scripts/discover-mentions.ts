// scripts/discover-mentions.ts
/**
 * Planner for the mention-mining channel. For each ACTIVE source, fetch its seedUrls,
 * hash the text, and diff against the per-domain snapshot to find pages needing
 * (re)extraction. Writes data/research/mentions/worklist.json for the controller to
 * dispatch mention-extractor (haiku) agents over.
 *
 * Usage: npm run discover:mentions
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { changedUrls, type SourceRegistry, type Snapshot } from "../lib/intake/mentions";

const RESEARCH = join(process.cwd(), "data", "research", "mentions");
const REGISTRY = join(RESEARCH, "source-registry.json");
const SNAPDIR = join(RESEARCH, "snapshots");
const WORKLIST = join(RESEARCH, "worklist.json");
const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

interface WorkItem { url: string; domain: string; kind: string; contentHash: string }

async function fetchText(url: string): Promise<string | null> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 20_000);
  try {
    const res = await fetch(url, { signal: ctl.signal, headers: { "user-agent": UA, accept: "text/html" } });
    if (!res.ok) return null;
    return await res.text();
  } catch { return null; }
  finally { clearTimeout(timer); }
}

function hashText(html: string): string {
  // Strip scripts/styles/tags so cosmetic markup churn doesn't look like new content.
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return createHash("sha256").update(text).digest("hex");
}

async function main() {
  const registry = JSON.parse(readFileSync(REGISTRY, "utf8")) as SourceRegistry;
  const active = registry.sources.filter((s) => s.status === "active");
  const worklist: WorkItem[] = [];

  for (const src of active) {
    const fresh: Record<string, string> = {};
    for (const url of src.seedUrls) {
      const html = await fetchText(url);
      if (html === null) { console.warn(`  ${src.domain}: fetch failed ${url}`); continue; }
      fresh[url] = hashText(html);
      await new Promise((r) => setTimeout(r, 500));
    }
    const snapPath = join(SNAPDIR, `${src.domain}.json`);
    const prevHashes: Record<string, string> | null = existsSync(snapPath)
      ? Object.fromEntries((JSON.parse(readFileSync(snapPath, "utf8")) as Snapshot).pages.map((p) => [p.url, p.contentHash]))
      : null;
    for (const url of changedUrls(fresh, prevHashes)) {
      worklist.push({ url, domain: src.domain, kind: src.kind, contentHash: fresh[url] });
    }
  }

  writeFileSync(WORKLIST, JSON.stringify({ plannedAt: new Date().toISOString(), items: worklist }, null, 2) + "\n");
  console.log(`worklist: ${worklist.length} pages to extract across ${new Set(worklist.map((w) => w.domain)).size} domains → ${WORKLIST}`);
  console.log(`Next: controller dispatches mention-extractor agents per data/research/mentions/runbook.md`);
}

main().catch((e) => { console.error(e); process.exit(1); });
