/**
 * Aggregator-diff discovery channel: fetch each configured aggregator's listing
 * index, extract listing slugs, diff against the previous snapshot, and append
 * genuinely-new candidates to the inbox (dedupe-checked against the directory,
 * the rejected list, and the inbox itself).
 *
 * Aggregators are DISCOVERY-ONLY: the listing url goes into evidence, never
 * into providerUrl (the resolution step finds the first-party link later).
 *
 * Usage: npm run discover:aggregators
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import {
  loadInbox, saveInbox, loadRejected, isRejected, dedupeVerdict, candidateCid,
  type DirEntry, type InboxCandidate,
} from "../lib/intake/inbox";
import { extractSlugs, slugToName, diffListings, type ScrapeSiteConfig, type Listings }
  from "../lib/intake/scrape";

const RESEARCH = join(process.cwd(), "data", "research");
const CONFIG = join(RESEARCH, "aggregator-scrape-config.json");
const DIRJSON = join(RESEARCH, "directory-consolidated-2026-06-09.json");
const SNAPDIR = join(RESEARCH, "snapshots");
const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

async function fetchPage(url: string): Promise<string | null> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 20_000);
  try {
    const res = await fetch(url, { signal: ctl.signal,
      headers: { "user-agent": UA, accept: "text/html" } });
    if (!res.ok) return null;
    return await res.text();
  } catch { return null; }
  finally { clearTimeout(timer); }
}

async function collectListings(domain: string, cfg: ScrapeSiteConfig): Promise<Listings> {
  const all: Listings = {};
  for (const index of cfg.index ?? []) {
    let prevCount = -1;
    for (let n = 1; n <= (cfg.maxPages ?? 10); n++) {
      const url = n === 1 ? index
        : (cfg.paginate ?? "{index}page/{n}/").replace("{index}", index).replace("{n}", String(n));
      const html = await fetchPage(url);
      if (html === null) break;
      Object.assign(all, extractSlugs(html, cfg.linkPattern!));
      const count = Object.keys(all).length;
      if (count === prevCount) break;   // page added nothing new → done
      prevCount = count;
    }
  }
  console.log(`${domain}: ${Object.keys(all).length} listings`);
  return all;
}

async function main() {
  const config = JSON.parse(readFileSync(CONFIG, "utf8")) as Record<string, ScrapeSiteConfig>;
  const dir = (JSON.parse(readFileSync(DIRJSON, "utf8")) as { id: string; name: string; country: string }[])
    .map((e): DirEntry => ({ id: e.id, name: e.name, country: e.country }));
  const inbox = loadInbox();
  const rejected = loadRejected();
  const inboxCids = new Set(inbox.candidates.map((c) => c.cid));
  mkdirSync(SNAPDIR, { recursive: true });

  let added = 0;
  for (const [domain, cfg] of Object.entries(config)) {
    try {
      if (cfg.unsupported || !cfg.linkPattern) {
        console.log(`${domain}: skipped (${cfg.unsupported ?? "no linkPattern"})`);
        continue;
      }
      const current = await collectListings(domain, cfg);
      if (Object.keys(current).length === 0) {
        console.warn(`${domain}: 0 listings fetched — NOT updating snapshot (likely a fetch problem)`);
        continue;
      }
      const snapPath = join(SNAPDIR, `${domain}.json`);
      const prev: Listings | null = existsSync(snapPath)
        ? (JSON.parse(readFileSync(snapPath, "utf8")) as { listings: Listings }).listings
        : null;
      const fresh = diffListings(current, prev);

      const channel = `aggregator-diff:${domain}`;
      const now = new Date().toISOString();
      for (const [slug, url] of Object.entries(fresh)) {
        const name = slugToName(slug);
        if (isRejected(name, rejected)) continue;
        const verdict = dedupeVerdict(name, undefined, dir);
        if (verdict === "known") continue;
        const cid = candidateCid(name, channel);
        if (inboxCids.has(cid)) continue;
        const cand: InboxCandidate = {
          cid, name, evidence: [{ url, asOf: now.slice(0, 10) }],
          sourceChannel: channel, dedupe: verdict, addedAt: now,
          notes: `auto-extracted from ${domain} listing index; name derived from slug`,
        };
        inbox.candidates.push(cand);
        inboxCids.add(cid);
        added++;
      }
      writeFileSync(snapPath, JSON.stringify({ fetchedAt: now, listings: current }, null, 1) + "\n");
      saveInbox(inbox);
    } catch (err) {
      console.warn(`${domain}: error — skipped`, err instanceof Error ? err.message : err);
      continue;
    }
  }
  console.log(`added ${added} new candidates → inbox (${inbox.candidates.length} total). ` +
    `Review with: npm run inbox:review`);
}

main().catch((err) => { console.error(err); process.exit(1); });
