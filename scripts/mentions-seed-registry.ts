// scripts/mentions-seed-registry.ts
/**
 * Build data/research/mentions/source-registry.json from the reference domains in
 * public/directory.json. Re-runnable: existing entries are preserved (status, kind,
 * notes you have edited), only NEW domains are appended. Seed URLs are the reference
 * URLs already on file for each domain (capped).
 *
 * Usage: npm run mentions:seed-registry
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { domainOf, type SourceRegistry, type SourceEntry, type SourceKind } from "../lib/intake/mentions";

const ROOT = process.cwd();
const DIRJSON = join(ROOT, "public", "directory.json");
const OUTDIR = join(ROOT, "data", "research", "mentions");
const OUT = join(OUTDIR, "source-registry.json");
const SEED_CAP = 8;

// Starter classification for the domains we already know (everything else defaults to
// directory+frontier, or hub-site when the domain is a hub's own website).
const KIND_MAP: Record<string, SourceKind> = {
  "worldschooly.com": "directory", "worldlytribe.com": "directory",
  "theworldschoolatlas.com": "directory", "wanderworks.life": "directory",
  "famunity.net": "directory", "blog.worldschoolhubs.com": "directory",
  "remotefamily.com": "directory", "linkease.app": "directory",
  "parentingandpassports.com": "personal-blog", "heathandalyssa.com": "personal-blog",
  "nobackhome.com": "personal-blog", "worldtravelambitions.com": "personal-blog",
  "thinkingnomads.com": "personal-blog", "vitalandomer.co.il": "personal-blog",
  "trvbox.co.il": "personal-blog",
  "bangkokpost.com": "press", "scandasia.com": "press", "educationnext.in": "press",
  "ynet.co.il": "press", "mako.co.il": "press", "tabletmag.com": "press",
  "timesofisrael.com": "press",
};
const LANG_HE = new Set(["vitalandomer.co.il", "trvbox.co.il", "ynet.co.il", "mako.co.il"]);
const SOCIAL = new Set(["facebook.com", "instagram.com", "youtube.com", "twitter.com", "x.com", "linkedin.com"]);

interface DirHub { website?: string; facebook?: string; references?: [string, string][] }

function main() {
  const hubs = JSON.parse(readFileSync(DIRJSON, "utf8")) as DirHub[];

  // Domains that are some hub's own first-party site ⇒ hub-site.
  const hubSiteDomains = new Set<string>();
  for (const h of hubs) {
    for (const u of [h.website, h.facebook]) {
      const d = u ? domainOf(u) : null;
      if (d && !SOCIAL.has(d)) hubSiteDomains.add(d);
    }
  }

  // Collect reference URLs per domain.
  const urlsByDomain = new Map<string, Set<string>>();
  for (const h of hubs) {
    for (const [, url] of h.references ?? []) {
      const d = domainOf(url);
      if (!d) continue;
      (urlsByDomain.get(d) ?? urlsByDomain.set(d, new Set()).get(d)!).add(url);
    }
  }

  mkdirSync(OUTDIR, { recursive: true });
  const existing: SourceRegistry = existsSync(OUT)
    ? JSON.parse(readFileSync(OUT, "utf8"))
    : { updatedAt: "", sources: [] };
  const byDomain = new Map(existing.sources.map((s) => [s.domain, s]));

  const today = new Date().toISOString().slice(0, 10);
  let added = 0;
  for (const [domain, urls] of [...urlsByDomain.entries()].sort()) {
    if (byDomain.has(domain)) continue; // preserve hand-edited entries
    const isSocial = SOCIAL.has(domain);
    const isHub = hubSiteDomains.has(domain);
    const kind: SourceKind = isHub ? "hub-site" : (KIND_MAP[domain] ?? "directory");
    const known = isHub || domain in KIND_MAP;
    const entry: SourceEntry = {
      domain,
      name: domain,
      kind,
      lang: LANG_HE.has(domain) ? "he" : "en",
      weight: null,
      status: isSocial ? "rejected" : (known ? "active" : "frontier"),
      seedUrls: [...urls].slice(0, SEED_CAP),
      addedAt: today,
      notes: known ? "" : "auto-added (unknown domain) — review kind/status before crawling",
    };
    byDomain.set(domain, entry);
    added++;
  }

  const out: SourceRegistry = {
    updatedAt: new Date().toISOString(),
    sources: [...byDomain.values()].sort((a, b) => a.domain.localeCompare(b.domain)),
  };
  writeFileSync(OUT, JSON.stringify(out, null, 2) + "\n");
  console.log(`wrote ${OUT}: ${out.sources.length} sources (${added} new). ` +
    `active=${out.sources.filter((s) => s.status === "active").length}, ` +
    `frontier=${out.sources.filter((s) => s.status === "frontier").length}`);
}

main();
