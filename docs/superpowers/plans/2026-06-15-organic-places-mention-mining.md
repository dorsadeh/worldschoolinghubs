# Organic-Places Mention Mining Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a discovery pipeline that ranks organic family-nesting *places* by weighted independent mentions across blogs/directories/press, deduping by geocode, and outputs a ranked dataset + a self-contained review page + a reusable source registry.

**Architecture:** A cheap read-only LLM agent (`mention-extractor`, Haiku) reads source pages and returns context-aware place mentions as strict JSON. Node scripts do the deterministic work: a planner fetches+hashes seed pages (diff to skip unchanged), a resolver geocodes mentions and dedups them into canonical places (geocode proximity is the dedup key), a scorer computes weighted-independent-mention scores, and a renderer emits the review HTML. Pure logic lives in `lib/intake/mentions.ts` and is unit-tested; scripts orchestrate I/O.

**Tech Stack:** TypeScript + tsx (scripts), Vitest (tests), Node fetch + Nominatim (geocoding), Claude subagents (Haiku) dispatched by a controller per a runbook. Mirrors the existing `lib/intake/*` + `scripts/discover-*` + `*-review-page.ts` patterns.

**Spec:** `docs/superpowers/specs/2026-06-15-organic-places-mention-mining-design.md`

---

## File Structure

- Create: `lib/intake/mentions.ts` — types + pure functions (placeId, scoring, dedup, geo, frontier). The one place tunable constants live.
- Create: `test/intake-mentions.test.ts` — unit tests for all pure functions.
- Create: `.claude/agents/mention-extractor.md` — the Haiku read-only extraction agent.
- Create: `scripts/mentions-seed-registry.ts` — builds `source-registry.json` from the directory's reference domains. npm: `mentions:seed-registry`.
- Create: `scripts/discover-mentions.ts` — planner: fetch+hash seed pages, diff, write worklist. npm: `discover:mentions`.
- Create: `scripts/mentions-resolve.ts` — geocode + dedup + ledger + places + frontier. npm: `mentions:resolve`.
- Create: `scripts/mentions-score.ts` — weighted scoring → scored JSON. npm: `mentions:score`.
- Create: `scripts/mentions-review-page.ts` — render review HTML. npm: `mentions:review`.
- Create: `data/research/mentions/runbook.md` — controller orchestration procedure.
- Generated (committed): `data/research/mentions/source-registry.json`, `snapshots/<domain>.json`, `places.json`, `mention-ledger.json`, `organic-places-scored.json`, `organic-places-review.html`.
- Modify: `package.json` — add the five npm scripts (one per task that creates a script).

Reused as-is: `slugify` from `lib/intake/inbox.ts`; the Nominatim/UA pattern from `scripts/geocode-directory.ts`; the HTML reviewer skeleton from `scripts/inbox-review-page.ts`.

---

## Task 1: Types + `placeId` scaffold

**Files:**
- Create: `lib/intake/mentions.ts`
- Test: `test/intake-mentions.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// test/intake-mentions.test.ts
import { describe, it, expect } from "vitest";
import { placeId } from "../lib/intake/mentions";

describe("placeId", () => {
  it("slugifies name and lowercases the country code", () => {
    expect(placeId("Pai", "TH")).toBe("pai--th");
    expect(placeId("Chiang Mai", "th")).toBe("chiang-mai--th");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/intake-mentions.test.ts`
Expected: FAIL — "Failed to resolve import ... lib/intake/mentions".

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/intake/mentions.ts
import { slugify } from "./inbox";

export type SourceKind = "personal-blog" | "press" | "directory" | "hub-site" | "forum";
export type SourceStatus = "active" | "frontier" | "rejected";

export interface SourceEntry {
  domain: string;
  name: string;
  kind: SourceKind;
  lang: string;
  weight: number | null;          // null ⇒ use the kind default
  status: SourceStatus;
  seedUrls: string[];
  addedAt: string;
  notes: string;
}
export interface SourceRegistry { updatedAt: string; sources: SourceEntry[] }

export interface PlaceMention {
  place: string;
  country?: string;
  snippet: string;
  nestingClaim: boolean;
  asOfDate: string;               // "YYYY-MM" | "YYYY-MM-DD" | "unknown"
}
export interface OutboundLink { url: string; anchor: string }
export interface SnapshotPage {
  url: string;
  contentHash: string;
  placeMentions: PlaceMention[];
  outboundLinks: OutboundLink[];
}
export interface Snapshot { domain: string; extractedAt: string; pages: SnapshotPage[] }

export interface Place {
  placeId: string;
  canonicalName: string;
  country: string;                // display name, e.g. "Thailand"
  cc: string;                     // ISO2, lowercased, e.g. "th"
  coords: [number, number] | null;
  aliases: string[];
  existingHubIds: string[];
  firstSeen: string;
}
export interface PlacesFile { updatedAt: string; places: Place[] }

export interface LedgerMention {
  placeId: string;
  domain: string;
  kind: SourceKind;
  url: string;
  snippet: string;
  nestingClaim: boolean;
  date: string;                   // "YYYY-MM" | "YYYY-MM-DD" | "unknown"
  addedAt: string;
}
export interface LedgerFile { updatedAt: string; mentions: LedgerMention[] }

export type Tier = "established" | "emerging" | "watch";
export interface ScoredSource { domain: string; kind: SourceKind; url: string; snippet: string; date: string }
export interface ScoredPlace {
  placeId: string;
  canonicalName: string;
  country: string;
  coords: [number, number] | null;
  score: number;
  tier: Tier;
  independentDomains: number;
  matchedExistingHubIds: string[];
  sources: ScoredSource[];
}
export interface ScoredFile { computedAt: string; places: ScoredPlace[] }

export function placeId(canonicalName: string, countryCode: string): string {
  return `${slugify(canonicalName)}--${countryCode.toLowerCase()}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/intake-mentions.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/intake/mentions.ts test/intake-mentions.test.ts
git commit -m "feat(mentions): types + placeId for organic-places mining"
```

---

## Task 2: Scoring functions

**Files:**
- Modify: `lib/intake/mentions.ts`
- Test: `test/intake-mentions.test.ts`

- [ ] **Step 1: Write the failing tests** (append to the test file)

```ts
import {
  kindWeight, recencyFactor, claimFactor, scorePlace,
  independentDomainCount, tierOf, type LedgerMention,
} from "../lib/intake/mentions";

const NOW = "2026-06-15";
function m(over: Partial<LedgerMention>): LedgerMention {
  return { placeId: "pai--th", domain: "blog.example", kind: "personal-blog",
    url: "https://x", snippet: "", nestingClaim: true, date: "2026-01", addedAt: NOW, ...over };
}

describe("kindWeight", () => {
  it("uses kind defaults", () => {
    expect(kindWeight("personal-blog")).toBe(1.0);
    expect(kindWeight("hub-site")).toBe(0.2);
  });
  it("honors a per-source override", () => {
    expect(kindWeight("directory", 0.9)).toBe(0.9);
  });
});

describe("recencyFactor", () => {
  it("full weight within 18 months", () => {
    expect(recencyFactor("2025-06", NOW)).toBe(1.0);
  });
  it("decays past 18 months and past 5 years", () => {
    expect(recencyFactor("2023-06", NOW)).toBe(0.5);
    expect(recencyFactor("2018-01", NOW)).toBe(0.3);
  });
  it("mild penalty for unknown dates", () => {
    expect(recencyFactor("unknown", NOW)).toBe(0.6);
  });
});

describe("claimFactor", () => {
  it("discounts non-nesting travel mentions", () => {
    expect(claimFactor(true)).toBe(1.0);
    expect(claimFactor(false)).toBe(0.4);
  });
});

describe("scorePlace", () => {
  it("sums kind*recency*claim over DISTINCT domains", () => {
    const score = scorePlace([
      m({ domain: "a.blog", kind: "personal-blog", date: "2026-01", nestingClaim: true }),  // 1.0*1.0*1.0
      m({ domain: "b.press", kind: "press", date: "2026-01", nestingClaim: true }),          // 0.9*1.0*1.0
    ], {}, NOW);
    expect(score).toBe(1.9);
  });
  it("counts a repeated domain only once", () => {
    const score = scorePlace([
      m({ domain: "a.blog", kind: "personal-blog" }),
      m({ domain: "a.blog", kind: "personal-blog" }),
    ], {}, NOW);
    expect(score).toBe(1.0);
  });
});

describe("independentDomainCount / tierOf", () => {
  it("excludes hub-site domains from the independent count", () => {
    const n = independentDomainCount([
      m({ domain: "a.blog", kind: "personal-blog" }),
      m({ domain: "b.press", kind: "press" }),
      m({ domain: "own.site", kind: "hub-site" }),
    ]);
    expect(n).toBe(2);
  });
  it("tiers by independent-domain count", () => {
    expect(tierOf(6)).toBe("established");
    expect(tierOf(3)).toBe("emerging");
    expect(tierOf(2)).toBe("watch");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run test/intake-mentions.test.ts`
Expected: FAIL — exports not defined.

- [ ] **Step 3: Implement** (append to `lib/intake/mentions.ts`)

```ts
export const KIND_WEIGHTS: Record<SourceKind, number> = {
  "personal-blog": 1.0, press: 0.9, forum: 0.7, directory: 0.5, "hub-site": 0.2,
};

export function kindWeight(kind: SourceKind, override: number | null = null): number {
  return override ?? KIND_WEIGHTS[kind];
}

/** 1.0 ≤18mo, 0.5 ≤5y, 0.3 older; 0.6 for unknown/unparseable. */
export function recencyFactor(date: string, now: string = new Date().toISOString().slice(0, 10)): number {
  if (!date || date === "unknown") return 0.6;
  const norm = date.length === 7 ? `${date}-01` : date;
  const d = Date.parse(norm), n = Date.parse(now);
  if (Number.isNaN(d) || Number.isNaN(n)) return 0.6;
  const months = (n - d) / (30 * 86_400_000);
  if (months <= 18) return 1.0;
  if (months <= 60) return 0.5;
  return 0.3;
}

export function claimFactor(nestingClaim: boolean): number {
  return nestingClaim ? 1.0 : 0.4;
}

/** Keep the first mention per domain (one vote), then sum weighted contributions. */
function dedupeByDomain(mentions: LedgerMention[]): LedgerMention[] {
  const byDomain = new Map<string, LedgerMention>();
  for (const m of mentions) if (!byDomain.has(m.domain)) byDomain.set(m.domain, m);
  return [...byDomain.values()];
}

export function scorePlace(
  mentions: LedgerMention[],
  weightByDomain: Record<string, number | null> = {},
  now: string = new Date().toISOString().slice(0, 10),
): number {
  let sum = 0;
  for (const m of dedupeByDomain(mentions)) {
    sum += kindWeight(m.kind, weightByDomain[m.domain] ?? null) * recencyFactor(m.date, now) * claimFactor(m.nestingClaim);
  }
  return Math.round(sum * 100) / 100;
}

export function independentDomainCount(mentions: LedgerMention[]): number {
  return new Set(mentions.filter((m) => m.kind !== "hub-site").map((m) => m.domain)).size;
}

export function tierOf(independentDomains: number): Tier {
  if (independentDomains >= 6) return "established";
  if (independentDomains >= 3) return "emerging";
  return "watch";
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run test/intake-mentions.test.ts`
Expected: PASS (all scoring describes green).

- [ ] **Step 5: Commit**

```bash
git add lib/intake/mentions.ts test/intake-mentions.test.ts
git commit -m "feat(mentions): weighted-independent-mention scoring"
```

---

## Task 3: Dedup store helpers (`ledgerUpsert`, `upsertPlace`)

**Files:**
- Modify: `lib/intake/mentions.ts`
- Test: `test/intake-mentions.test.ts`

- [ ] **Step 1: Write the failing tests** (append)

```ts
import { ledgerUpsert, upsertPlace, type Place } from "../lib/intake/mentions";

function place(over: Partial<Place>): Place {
  return { placeId: "pai--th", canonicalName: "Pai", country: "Thailand", cc: "th",
    coords: [19.36, 98.44], aliases: ["Pai"], existingHubIds: [], firstSeen: NOW, ...over };
}

describe("ledgerUpsert", () => {
  it("adds a new (placeId,domain) row", () => {
    const out = ledgerUpsert([], m({ domain: "a.blog" }));
    expect(out).toHaveLength(1);
  });
  it("is idempotent for the same (placeId,domain) — one vote", () => {
    let l: LedgerMention[] = [];
    l = ledgerUpsert(l, m({ domain: "a.blog", snippet: "first" }));
    l = ledgerUpsert(l, m({ domain: "a.blog", snippet: "second" }));
    expect(l).toHaveLength(1);
    expect(l[0].snippet).toBe("second"); // updates in place
  });
});

describe("upsertPlace", () => {
  it("merges aliases and existingHubIds, preserves firstSeen, fills null coords", () => {
    let ps = upsertPlace([], place({ aliases: ["Pai"], firstSeen: "2026-01-01" }));
    ps = upsertPlace(ps, place({ aliases: ["Pai Thailand"], existingHubIds: ["pai"], firstSeen: "2026-06-15" }));
    expect(ps).toHaveLength(1);
    expect(ps[0].aliases).toEqual(["Pai", "Pai Thailand"]);
    expect(ps[0].existingHubIds).toEqual(["pai"]);
    expect(ps[0].firstSeen).toBe("2026-01-01");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run test/intake-mentions.test.ts`
Expected: FAIL — exports not defined.

- [ ] **Step 3: Implement** (append to `lib/intake/mentions.ts`)

```ts
export function ledgerUpsert(ledger: LedgerMention[], m: LedgerMention): LedgerMention[] {
  const i = ledger.findIndex((x) => x.placeId === m.placeId && x.domain === m.domain);
  if (i >= 0) ledger[i] = { ...ledger[i], ...m };
  else ledger.push(m);
  return ledger;
}

export function upsertPlace(places: Place[], p: Place): Place[] {
  const i = places.findIndex((x) => x.placeId === p.placeId);
  if (i < 0) { places.push(p); return places; }
  const ex = places[i];
  places[i] = {
    ...ex,
    canonicalName: ex.canonicalName || p.canonicalName,
    coords: ex.coords ?? p.coords,
    aliases: [...new Set([...ex.aliases, ...p.aliases])].sort(),
    existingHubIds: [...new Set([...ex.existingHubIds, ...p.existingHubIds])].sort(),
    firstSeen: ex.firstSeen, // earliest wins
  };
  return places;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run test/intake-mentions.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/intake/mentions.ts test/intake-mentions.test.ts
git commit -m "feat(mentions): idempotent ledger + place upsert (domain-dedup)"
```

---

## Task 4: Geo dedup + frontier helpers

**Files:**
- Modify: `lib/intake/mentions.ts`
- Test: `test/intake-mentions.test.ts`

- [ ] **Step 1: Write the failing tests** (append)

```ts
import {
  haversineKm, findPlaceByCoords, matchExistingHub,
  domainOf, nextFrontierDomains, type SourceRegistry,
} from "../lib/intake/mentions";

describe("haversineKm", () => {
  it("≈0 for identical points and ~hundreds of km apart", () => {
    expect(haversineKm([19.36, 98.44], [19.36, 98.44])).toBeCloseTo(0, 3);
    expect(haversineKm([19.36, 98.44], [13.75, 100.50])).toBeGreaterThan(600); // Pai→Bangkok
  });
});

describe("findPlaceByCoords", () => {
  const places = [place({ placeId: "pai--th", coords: [19.36, 98.44], cc: "th" })];
  it("matches a nearby same-country place (cluster radius)", () => {
    expect(findPlaceByCoords(places, [19.37, 98.45], "th", 10)?.placeId).toBe("pai--th");
  });
  it("does not match a far point", () => {
    expect(findPlaceByCoords(places, [13.75, 100.50], "th", 10)).toBeNull();
  });
  it("does not match across country codes", () => {
    expect(findPlaceByCoords(places, [19.36, 98.44], "la", 10)).toBeNull();
  });
});

describe("matchExistingHub", () => {
  const hubs = [
    { id: "pai", coords: [19.36, 98.44] as [number, number], country: "Thailand" },
    { id: "bansko", coords: [41.83, 23.48] as [number, number], country: "Bulgaria" },
  ];
  it("links hubs within 25km of the same country", () => {
    expect(matchExistingHub([19.40, 98.40], "Thailand", hubs, 25)).toEqual(["pai"]);
  });
  it("returns [] for null coords", () => {
    expect(matchExistingHub(null, "Thailand", hubs, 25)).toEqual([]);
  });
});

describe("domainOf / nextFrontierDomains", () => {
  it("strips www and lowercases", () => {
    expect(domainOf("https://www.Example.com/x")).toBe("example.com");
    expect(domainOf("not a url")).toBeNull();
  });
  it("returns only unknown outbound domains", () => {
    const reg: SourceRegistry = { updatedAt: NOW, sources: [
      { domain: "known.com", name: "K", kind: "directory", lang: "en", weight: null,
        status: "active", seedUrls: [], addedAt: NOW, notes: "" },
    ] };
    const out = nextFrontierDomains(
      [{ url: "https://known.com/a", anchor: "" }, { url: "https://new.blog/b", anchor: "" }],
      reg,
    );
    expect(out).toEqual(["new.blog"]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run test/intake-mentions.test.ts`
Expected: FAIL — exports not defined.

- [ ] **Step 3: Implement** (append to `lib/intake/mentions.ts`)

```ts
export function haversineKm(a: [number, number], b: [number, number]): number {
  const R = 6371, toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b[0] - a[0]), dLon = toRad(b[1] - a[1]);
  const s = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/** Same-country place within radius ⇒ the same canonical place (geocode = dedup key). */
export function findPlaceByCoords(
  places: Place[], coords: [number, number], cc: string, radiusKm = 10,
): Place | null {
  for (const p of places) {
    if (p.coords && p.cc.toLowerCase() === cc.toLowerCase() && haversineKm(coords, p.coords) <= radiusKm) return p;
  }
  return null;
}

export interface HubCoord { id: string; coords: [number, number] | null; country: string }

export function matchExistingHub(
  coords: [number, number] | null, country: string, hubs: HubCoord[], radiusKm = 25,
): string[] {
  if (!coords) return [];
  const c = country.trim().toLowerCase();
  return hubs
    .filter((h) => h.coords
      && (!c || !h.country || h.country.trim().toLowerCase() === c)
      && haversineKm(coords, h.coords) <= radiusKm)
    .map((h) => h.id);
}

export function domainOf(url: string): string | null {
  try { return new URL(url).hostname.replace(/^www\./, "").toLowerCase(); }
  catch { return null; }
}

export function nextFrontierDomains(outbound: OutboundLink[], registry: SourceRegistry): string[] {
  const known = new Set(registry.sources.map((s) => s.domain));
  const found = new Set<string>();
  for (const l of outbound) { const d = domainOf(l.url); if (d && !known.has(d)) found.add(d); }
  return [...found].sort();
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run test/intake-mentions.test.ts`
Expected: PASS (whole `intake-mentions` suite green).

- [ ] **Step 5: Commit**

```bash
git add lib/intake/mentions.ts test/intake-mentions.test.ts
git commit -m "feat(mentions): geocode-proximity dedup + frontier helpers"
```

---

## Task 5: The `mention-extractor` agent

**Files:**
- Create: `.claude/agents/mention-extractor.md`

- [ ] **Step 1: Write the agent definition**

```markdown
---
name: mention-extractor
description: Reads ONE source page (blog/directory/press) and returns the family-worldschool *nesting places* it mentions, plus outbound links, as strict JSON. Read-only; dispatched one per URL. Cheapest model.
model: haiku
tools: WebFetch, Read
---

You extract worldschooling **nesting-place mentions** from ONE web page and return
STRICT JSON as your final message. READ-ONLY: never modify files.

## Input (in the dispatch prompt)
- `url`: the page to read.
- `kind`: the source kind (personal-blog | press | directory | hub-site | forum) — context only.

## What counts as a place mention
Return a place ONLY when the page frames it as a destination where worldschooling /
digital-nomad **families gather, nest, or base themselves** (for a season or longer).

- INCLUDE: "families nest in Pai over winter", "Bansko has become a worldschooling hub",
  a directory row for a town/region families gather in.
- EXCLUDE: a place merely passed through or sightseen ("we spent a weekend in Paris"),
  countries named only in passing, generic travel tips with no family-gathering claim.

Set `nestingClaim: true` when the family-gathering framing is explicit; `false` when the
place is relevant but the framing is weak/ambiguous (still returned, scored lower later).

## Rules
- Read the ONE page only. Do NOT browse onward (outbound links are RECORDED, not followed).
- NEVER invent. If the page yields no qualifying place, return an empty `placeMentions` array.
- `country`: the country of the place when stated/clear, else omit.
- `snippet`: ≤200 chars quoting/paraphrasing the family-gathering claim.
- `asOfDate`: the page's own publish/updated date as "YYYY-MM" or "YYYY-MM-DD" if visible, else "unknown".
- `outboundLinks`: external links on the page that point to OTHER sites (blogs/directories/
  hub sites) — these seed future discovery. Skip nav/social-share/ad links. Cap ~20.

## Output — return EXACTLY this JSON object, nothing around it
{ "sourceUrl": "<the url>",
  "placeMentions": [
    { "place": "Pai", "country": "Thailand",
      "snippet": "families nest here Nov–Feb for the cool season",
      "nestingClaim": true, "asOfDate": "2025-03" } ],
  "outboundLinks": [ { "url": "https://...", "anchor": "Bansko worldschooling group" } ] }
```

- [ ] **Step 2: Verify the agent is registered**

Run: `ls .claude/agents/` — Expected: `hub-validator.md` and `mention-extractor.md` listed.

- [ ] **Step 3: Commit**

```bash
git add .claude/agents/mention-extractor.md
git commit -m "feat(mentions): mention-extractor agent (haiku, read-only)"
```

---

## Task 6: Seed the source registry

Builds `source-registry.json` from the directory's reference domains: classify each domain
(hub-site if it is a hub's own website; else a known kind from `KIND_MAP`; else default
`directory` + `status: frontier`), with `seedUrls` = the exact reference URLs already on file
for that domain (capped, to bound tokens). Social domains are marked `rejected`.

**Files:**
- Create: `scripts/mentions-seed-registry.ts`
- Modify: `package.json` (scripts)

- [ ] **Step 1: Write the script**

```ts
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
```

- [ ] **Step 2: Add the npm script**

In `package.json` `"scripts"`, add:

```json
"mentions:seed-registry": "tsx scripts/mentions-seed-registry.ts",
```

- [ ] **Step 3: Run it and verify output**

Run: `npm run mentions:seed-registry`
Expected: prints `wrote .../source-registry.json: N sources (N new). active=… frontier=…` with N ≈ the number of distinct reference domains (~40+). Then:

Run: `node -e 'const r=require("./data/research/mentions/source-registry.json"); const k={}; for(const s of r.sources) k[s.kind]=(k[s.kind]||0)+1; console.log(k); console.log("active personal-blog sample:", r.sources.find(s=>s.kind==="personal-blog").domain)'`
Expected: a kind breakdown including `directory`, `personal-blog`, `press`, `hub-site`, and a sample personal-blog domain (e.g. `parentingandpassports.com`).

- [ ] **Step 4: Commit**

```bash
git add scripts/mentions-seed-registry.ts package.json data/research/mentions/source-registry.json
git commit -m "feat(mentions): seed source registry from directory references"
```

---

## Task 7: Planner — `discover:mentions`

Reads the registry (status `active`), fetches each `seedUrl`, computes a content hash, diffs
against the existing snapshot, and writes a worklist of pages that need (re)extraction.

**Files:**
- Modify: `lib/intake/mentions.ts` (add pure `changedUrls`)
- Modify: `test/intake-mentions.test.ts`
- Create: `scripts/discover-mentions.ts`
- Modify: `package.json`

- [ ] **Step 1: Write the failing test for `changedUrls`** (append to test file)

```ts
import { changedUrls } from "../lib/intake/mentions";

describe("changedUrls", () => {
  it("returns urls whose hash is new or changed", () => {
    const fresh = { "u1": "h1", "u2": "h2new", "u3": "h3" };
    const prev = { "u1": "h1", "u2": "h2old" };
    expect(changedUrls(fresh, prev).sort()).toEqual(["u2", "u3"]);
  });
  it("treats no previous snapshot as all-changed", () => {
    expect(changedUrls({ a: "x" }, null)).toEqual(["a"]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run test/intake-mentions.test.ts`
Expected: FAIL — `changedUrls` not defined.

- [ ] **Step 3: Implement `changedUrls`** (append to `lib/intake/mentions.ts`)

```ts
/** URLs whose fresh content hash differs from (or is absent in) the previous snapshot hashes. */
export function changedUrls(fresh: Record<string, string>, prev: Record<string, string> | null): string[] {
  return Object.keys(fresh).filter((u) => !prev || prev[u] !== fresh[u]);
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run test/intake-mentions.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the planner script**

```ts
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
```

- [ ] **Step 6: Add the npm script**

In `package.json` `"scripts"`, add:

```json
"discover:mentions": "tsx scripts/discover-mentions.ts",
```

- [ ] **Step 7: Run it and verify output**

Run: `mkdir -p data/research/mentions/snapshots && npm run discover:mentions`
Expected: prints `worklist: N pages to extract across M domains → …/worklist.json` (N>0 on first run since no snapshots exist). Confirm the file:

Run: `node -e 'const w=require("./data/research/mentions/worklist.json"); console.log(w.items.length, "items; sample:", w.items[0])'`
Expected: a positive count and a sample `{ url, domain, kind, contentHash }`.

- [ ] **Step 8: Commit**

```bash
git add lib/intake/mentions.ts test/intake-mentions.test.ts scripts/discover-mentions.ts package.json data/research/mentions/worklist.json
git commit -m "feat(mentions): discover:mentions planner (fetch+hash+diff worklist)"
```

---

## Task 8: Controller runbook

**Files:**
- Create: `data/research/mentions/runbook.md`

- [ ] **Step 1: Write the runbook**

```markdown
# Mention-mining orchestration runbook

The controller (main session) drives extraction in batches. Dispatching agents is not
scriptable; the planner, resolve, score, and review steps ARE scripted.

## Cycle
1. `npm run mentions:seed-registry` — refresh the source registry from the directory
   (only appends new domains; preserves your edits). Review any `status: frontier`
   entries and promote good ones to `active` (set the correct `kind`).
2. `npm run discover:mentions` — writes `worklist.json` (pages needing extraction).
3. **Dispatch extraction agents.** Read `worklist.json`. In batches of ~10 items,
   dispatch the `mention-extractor` agent (Haiku, set by the agent's frontmatter) IN
   PARALLEL — one Agent call per item, all in one message — passing `url` and `kind`.
   Each returns strict JSON `{ sourceUrl, placeMentions[], outboundLinks[] }`.
4. **Write snapshots.** For each agent result, write/replace its page in
   `snapshots/<domain>.json` (shape: `{ domain, extractedAt, pages: [{ url, contentHash,
   placeMentions, outboundLinks }] }`). Use the `contentHash` from the matching
   worklist item (the agent does not compute hashes). Merge by `url` within the domain.
5. `npm run mentions:resolve` — geocodes mentions, dedups into canonical places, updates
   the ledger, links existing directory hubs, and appends new outbound domains to the
   registry as `frontier`.
6. `npm run mentions:score` — writes `organic-places-scored.json`.
7. `npm run mentions:review` — writes `organic-places-review.html`. Open it (file://),
   Approve/Reject, export `organic-places-decisions.json` to ~/Downloads.
8. Commit the cycle (registry + snapshots + places + ledger + scored + html).

## Discipline
- Agents are READ-ONLY and never followed past one page; outbound links are recorded
  as `frontier` and never crawled until you promote them to `active`.
- Geocode is the dedup key — never merge two places by name alone.
- Nothing here edits the directory / overrides.json. Approved decisions are the input to
  a SEPARATE later ingestion step (out of scope for this pipeline).
- Keep batches small so a bad batch is easy to discard (snapshots are per-domain files).
```

- [ ] **Step 2: Commit**

```bash
git add data/research/mentions/runbook.md
git commit -m "docs(mentions): controller orchestration runbook"
```

---

## Task 9: Resolver — `mentions:resolve`

Reads all snapshots, geocodes each mention (Nominatim, cached, rate-limited), clusters by
coords into canonical places (geocode = dedup key), links existing directory organic hubs,
upserts the ledger (one vote per domain), and appends new outbound domains as `frontier`.

**Files:**
- Create: `scripts/mentions-resolve.ts`
- Modify: `package.json`

- [ ] **Step 1: Write the script**

```ts
// scripts/mentions-resolve.ts
/**
 * Resolve raw place mentions (from snapshots) into canonical, geocoded, deduped places.
 * Geocode proximity is the dedup key. Writes places.json + mention-ledger.json and
 * appends newly-seen outbound domains to source-registry.json as `frontier`.
 *
 * Usage: npm run mentions:resolve
 * Nominatim ToS: ≤1 req/s, must set a User-Agent. Geocode results are cached.
 */
import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { slugify } from "../lib/intake/inbox";
import {
  placeId as makePlaceId, findPlaceByCoords, matchExistingHub, upsertPlace, ledgerUpsert,
  nextFrontierDomains, domainOf,
  type Snapshot, type Place, type PlacesFile, type LedgerFile, type LedgerMention,
  type SourceRegistry, type SourceEntry, type HubCoord, type SourceKind,
} from "../lib/intake/mentions";

const ROOT = process.cwd();
const MENT = join(ROOT, "data", "research", "mentions");
const SNAPDIR = join(MENT, "snapshots");
const REGISTRY = join(MENT, "source-registry.json");
const PLACES = join(MENT, "places.json");
const LEDGER = join(MENT, "mention-ledger.json");
const DIRJSON = join(ROOT, "public", "directory.json");
const GEOCACHE = join(MENT, "geocode-cache.json");
const UA = "worldschooling-mention-miner/1.0 (dorobm@gmail.com)";
const CLUSTER_KM = 10, EXISTING_HUB_KM = 25;

type GeoHit = { lat: number; lon: number; cc: string; name: string } | null;

async function geocode(query: string): Promise<GeoHit> {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1&addressdetails=1`;
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "en" } });
    if (!res.ok) return null;
    const data = await res.json() as { lat: string; lon: string; address?: { country_code?: string; country?: string } }[];
    if (!data.length) return null;
    const d = data[0];
    return { lat: parseFloat(d.lat), lon: parseFloat(d.lon), cc: d.address?.country_code ?? "", name: d.address?.country ?? "" };
  } catch { return null; }
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface DirHub { id: string; category?: string; categories?: string[]; country?: string; coords?: [number, number] | null }

async function main() {
  const registry = JSON.parse(readFileSync(REGISTRY, "utf8")) as SourceRegistry;
  const kindByDomain = new Map(registry.sources.map((s) => [s.domain, s.kind] as [string, SourceKind]));

  const places: PlacesFile = existsSync(PLACES) ? JSON.parse(readFileSync(PLACES, "utf8")) : { updatedAt: "", places: [] };
  const ledgerFile: LedgerFile = existsSync(LEDGER) ? JSON.parse(readFileSync(LEDGER, "utf8")) : { updatedAt: "", mentions: [] };
  const geoCache: Record<string, GeoHit> = existsSync(GEOCACHE) ? JSON.parse(readFileSync(GEOCACHE, "utf8")) : {};

  // Existing organic directory hubs (for proximity linking).
  const hubs: HubCoord[] = (JSON.parse(readFileSync(DIRJSON, "utf8")) as DirHub[])
    .filter((h) => (h.category === "organic" || h.categories?.includes("organic")) && h.coords)
    .map((h) => ({ id: h.id, coords: h.coords ?? null, country: h.country ?? "" }));

  const today = new Date().toISOString().slice(0, 10);
  const snapFiles = existsSync(SNAPDIR) ? readdirSync(SNAPDIR).filter((f) => f.endsWith(".json")) : [];
  let mentionsSeen = 0, parked = 0;
  const allOutbound: { url: string; anchor: string }[] = [];

  for (const f of snapFiles) {
    const snap = JSON.parse(readFileSync(join(SNAPDIR, f), "utf8")) as Snapshot;
    const kind = kindByDomain.get(snap.domain) ?? "directory";
    for (const page of snap.pages) {
      allOutbound.push(...page.outboundLinks);
      for (const pm of page.placeMentions) {
        mentionsSeen++;
        const query = pm.country ? `${pm.place}, ${pm.country}` : pm.place;
        let hit: GeoHit;
        if (query in geoCache) {
          hit = geoCache[query];
        } else {
          hit = await geocode(query);
          geoCache[query] = hit;
          writeFileSync(GEOCACHE, JSON.stringify(geoCache, null, 2) + "\n");
          await sleep(1100);
        }

        let pid: string;
        if (!hit) {
          // Ambiguous/unresolved → park with null coords (review page flags it).
          pid = makePlaceId(pm.place, "xx");
          upsertPlace(places.places, {
            placeId: pid, canonicalName: pm.place, country: pm.country ?? "", cc: "xx",
            coords: null, aliases: [pm.place], existingHubIds: [], firstSeen: today,
          });
          parked++;
        } else {
          const coords: [number, number] = [hit.lat, hit.lon];
          const existing = findPlaceByCoords(places.places, coords, hit.cc, CLUSTER_KM);
          if (existing) {
            pid = existing.placeId;
            upsertPlace(places.places, { ...existing, aliases: [...existing.aliases, pm.place] });
          } else {
            pid = makePlaceId(pm.place, hit.cc || "xx");
            const existingHubIds = matchExistingHub(coords, hit.name || pm.country || "", hubs, EXISTING_HUB_KM);
            upsertPlace(places.places, {
              placeId: pid, canonicalName: pm.place, country: hit.name || pm.country || "", cc: hit.cc || "xx",
              coords, aliases: [pm.place], existingHubIds, firstSeen: today,
            });
          }
        }

        const m: LedgerMention = {
          placeId: pid, domain: snap.domain, kind, url: page.url,
          snippet: pm.snippet, nestingClaim: pm.nestingClaim,
          date: pm.asOfDate || "unknown", addedAt: today,
        };
        ledgerUpsert(ledgerFile.mentions, m);
      }
    }
  }

  // Append unknown outbound domains as frontier sources.
  const frontier = nextFrontierDomains(allOutbound, registry);
  for (const domain of frontier) {
    if (domainOf(`https://${domain}`) === null) continue;
    const entry: SourceEntry = {
      domain, name: domain, kind: "directory", lang: "en", weight: null,
      status: "frontier", seedUrls: [], addedAt: today,
      notes: "discovered via outbound link — review before crawling",
    };
    registry.sources.push(entry);
  }
  registry.sources.sort((a, b) => a.domain.localeCompare(b.domain));
  registry.updatedAt = new Date().toISOString();

  places.updatedAt = new Date().toISOString();
  ledgerFile.updatedAt = new Date().toISOString();
  writeFileSync(PLACES, JSON.stringify(places, null, 2) + "\n");
  writeFileSync(LEDGER, JSON.stringify(ledgerFile, null, 2) + "\n");
  writeFileSync(REGISTRY, JSON.stringify(registry, null, 2) + "\n");

  console.log(`resolved ${mentionsSeen} mentions → ${places.places.length} places ` +
    `(${parked} parked, no geocode), ${ledgerFile.mentions.length} ledger rows, ` +
    `+${frontier.length} frontier domains.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Add the npm script**

In `package.json` `"scripts"`, add:

```json
"mentions:resolve": "tsx scripts/mentions-resolve.ts",
```

- [ ] **Step 3: Smoke-test with a fixture snapshot**

Create a throwaway snapshot so resolve has input without waiting on agents:

```bash
mkdir -p data/research/mentions/snapshots
cat > data/research/mentions/snapshots/parentingandpassports.com.json <<'JSON'
{ "domain": "parentingandpassports.com", "extractedAt": "2026-06-15T00:00:00Z",
  "pages": [ { "url": "https://parentingandpassports.com/worldschooling-community-bansko-bulgaria/",
    "contentHash": "deadbeef",
    "placeMentions": [ { "place": "Bansko", "country": "Bulgaria",
      "snippet": "a worldschooling hub families nest in for the ski season",
      "nestingClaim": true, "asOfDate": "2024-11" } ],
    "outboundLinks": [ { "url": "https://newdiscovery.blog/x", "anchor": "more" } ] } ] }
JSON
npm run mentions:resolve
```

Expected: prints `resolved 1 mentions → 1 places (0 parked …) … +1 frontier domains.` Verify:

Run: `node -e 'const p=require("./data/research/mentions/places.json").places[0]; console.log(p.canonicalName, p.cc, p.coords, "existingHubIds:", p.existingHubIds)'`
Expected: `Bansko bg [ ~41.8, ~23.4 ] existingHubIds: [ "bansko-town-base-city" ]` (the existing Bansko organic hub linked by proximity).

Run: `node -e 'const r=require("./data/research/mentions/source-registry.json"); console.log(r.sources.find(s=>s.domain==="newdiscovery.blog"))'`
Expected: an entry with `status: "frontier"`.

- [ ] **Step 4: Remove the fixture snapshot**

```bash
rm data/research/mentions/snapshots/parentingandpassports.com.json
git checkout data/research/mentions/places.json data/research/mentions/mention-ledger.json data/research/mentions/source-registry.json 2>/dev/null || true
rm -f data/research/mentions/places.json data/research/mentions/mention-ledger.json data/research/mentions/geocode-cache.json
```

(Then re-run `npm run mentions:seed-registry` if the registry was deleted, so a clean registry is committed.)

- [ ] **Step 5: Commit**

```bash
git add scripts/mentions-resolve.ts package.json
git commit -m "feat(mentions): mentions:resolve — geocode dedup + ledger + frontier"
```

---

## Task 10: Scorer — `mentions:score`

**Files:**
- Create: `scripts/mentions-score.ts`
- Modify: `package.json`

- [ ] **Step 1: Write the script**

```ts
// scripts/mentions-score.ts
/**
 * Score canonical places by weighted independent mentions and write
 * organic-places-scored.json (sorted by score desc).
 *
 * Usage: npm run mentions:score
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  scorePlace, independentDomainCount, tierOf,
  type PlacesFile, type LedgerFile, type SourceRegistry, type ScoredFile, type ScoredPlace,
} from "../lib/intake/mentions";

const MENT = join(process.cwd(), "data", "research", "mentions");
const PLACES = join(MENT, "places.json");
const LEDGER = join(MENT, "mention-ledger.json");
const REGISTRY = join(MENT, "source-registry.json");
const OUT = join(MENT, "organic-places-scored.json");

function main() {
  if (!existsSync(PLACES) || !existsSync(LEDGER)) {
    console.error("Run mentions:resolve first (places.json / mention-ledger.json missing).");
    process.exit(1);
  }
  const places = (JSON.parse(readFileSync(PLACES, "utf8")) as PlacesFile).places;
  const ledger = (JSON.parse(readFileSync(LEDGER, "utf8")) as LedgerFile).mentions;
  const registry = JSON.parse(readFileSync(REGISTRY, "utf8")) as SourceRegistry;
  const weightByDomain = Object.fromEntries(registry.sources.map((s) => [s.domain, s.weight]));

  const byPlace = new Map<string, typeof ledger>();
  for (const m of ledger) (byPlace.get(m.placeId) ?? byPlace.set(m.placeId, []).get(m.placeId)!).push(m);

  const scored: ScoredPlace[] = places.map((p) => {
    const ms = byPlace.get(p.placeId) ?? [];
    const independentDomains = independentDomainCount(ms);
    return {
      placeId: p.placeId, canonicalName: p.canonicalName, country: p.country, coords: p.coords,
      score: scorePlace(ms, weightByDomain),
      tier: tierOf(independentDomains),
      independentDomains,
      matchedExistingHubIds: p.existingHubIds,
      sources: [...new Map(ms.map((m) => [m.domain, m])).values()]
        .map((m) => ({ domain: m.domain, kind: m.kind, url: m.url, snippet: m.snippet, date: m.date })),
    };
  }).sort((a, b) => b.score - a.score || b.independentDomains - a.independentDomains);

  const out: ScoredFile = { computedAt: new Date().toISOString(), places: scored };
  writeFileSync(OUT, JSON.stringify(out, null, 2) + "\n");
  const surf = scored.filter((s) => s.tier !== "watch").length;
  console.log(`scored ${scored.length} places → ${OUT} (${surf} above the ≥3-independent-domain threshold).`);
}

main();
```

- [ ] **Step 2: Add the npm script**

In `package.json` `"scripts"`, add:

```json
"mentions:score": "tsx scripts/mentions-score.ts",
```

- [ ] **Step 3: Verify (after re-creating a fixture or on real data)**

Recreate the Task 9 fixture snapshot, run resolve, then:

Run: `npm run mentions:score`
Expected: `scored 1 places → …/organic-places-scored.json (0 above the ≥3-independent-domain threshold).` (one blog ⇒ watch tier, correctly below threshold). Then:

Run: `node -e 'const s=require("./data/research/mentions/organic-places-scored.json").places[0]; console.log(s.canonicalName, "score", s.score, "tier", s.tier, "indep", s.independentDomains)'`
Expected: `Bansko score 0.9 tier watch indep 1` (personal-blog 1.0 × recency 0.9 for a 2024-11 date × claim 1.0).

Then clean up the fixture again (as in Task 9 Step 4).

- [ ] **Step 4: Commit**

```bash
git add scripts/mentions-score.ts package.json
git commit -m "feat(mentions): mentions:score — ranked organic-places dataset"
```

---

## Task 11: Review page — `mentions:review`

A self-contained HTML reviewer (data embedded, file://-safe, localStorage state) listing
ranked places with score/tier/sources and an "already in directory" badge; Approve/Reject;
exports `organic-places-decisions.json`. Mirrors `scripts/inbox-review-page.ts`.

**Files:**
- Create: `scripts/mentions-review-page.ts`
- Modify: `package.json`

- [ ] **Step 1: Write the script**

```ts
// scripts/mentions-review-page.ts
/**
 * Generate data/research/mentions/organic-places-review.html — self-contained review of
 * scored organic places. Approve/Reject per place; exports organic-places-decisions.json.
 *
 * Usage: npm run mentions:review
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const MENT = join(process.cwd(), "data", "research", "mentions");
const SCORED = join(MENT, "organic-places-scored.json");
const OUT = join(MENT, "organic-places-review.html");

function escapeJson(json: string): string { return json.replace(/<\//g, "<\\/"); }

function buildHtml(safeJson: string): string {
  return `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Organic-places review</title>
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{color-scheme:light;--green:#0e7a5f;--red:#b3261e;--amber:#b45309;
--zinc-50:#fafafa;--zinc-100:#f4f4f5;--zinc-200:#e4e4e7;--zinc-300:#d4d4d8;
--zinc-400:#a1a1aa;--zinc-500:#71717a;--zinc-600:#52525b;--zinc-800:#27272a;--zinc-900:#18181b}
body{font-family:ui-sans-serif,system-ui,-apple-system,sans-serif;font-size:14px;line-height:1.5;color:var(--zinc-800);background:var(--zinc-50)}
a{color:var(--green)} .page{max-width:880px;margin:0 auto;padding:24px 16px 64px}
.header h1{font-size:20px;font-weight:700;color:var(--zinc-900)} .header .meta{font-size:12px;color:var(--zinc-500);margin-top:2px}
.progress-stats{display:flex;gap:16px;margin:10px 0 16px;font-size:12px;color:var(--zinc-600)}
.stat-approved{color:var(--green);font-weight:600} .stat-rejected{color:var(--red);font-weight:600}
.filter-row{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:16px}
.chip{border:1px solid var(--zinc-300);background:#fff;border-radius:999px;padding:3px 12px;font-size:12px;cursor:pointer;color:var(--zinc-600)}
.chip.active{background:var(--zinc-800);border-color:var(--zinc-800);color:#fff}
.card{background:#fff;border:1px solid var(--zinc-200);border-radius:8px;padding:14px 16px;margin-bottom:10px}
.card.decided-approve{border-color:var(--green);background:#f0fdf4} .card.decided-reject{border-color:var(--red);background:#fff5f5}
.card.hidden{display:none}
.card-head{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap}
.card-name{font-size:15px;font-weight:600;color:var(--zinc-900);flex:1 1 0;min-width:180px}
.score{font-size:18px;font-weight:700;color:var(--zinc-900)} .indep{font-size:12px;color:var(--zinc-500)}
.badge{font-size:11px;font-weight:600;padding:2px 8px;border-radius:4px;color:#fff;white-space:nowrap}
.tier-established{background:#0e7a5f} .tier-emerging{background:#2563eb} .tier-watch{background:#6b7280}
.indir{background:var(--amber)}
.sources{margin-top:8px;font-size:12px;color:var(--zinc-600)} .src{margin-top:3px;padding-left:10px}
.src .k{color:var(--zinc-400);margin-right:5px} .src .snip{color:var(--zinc-500)}
.controls{display:flex;gap:8px;margin-top:12px}
.btn{font-family:inherit;font-size:12px;font-weight:600;cursor:pointer;padding:5px 14px;border-radius:5px;border:1px solid transparent}
.btn-approve{background:#fff;color:var(--green);border-color:var(--green)} .btn-approve.active{background:var(--green);color:#fff}
.btn-reject{background:#fff;color:var(--red);border-color:var(--red)} .btn-reject.active{background:var(--red);color:#fff}
.export{margin-top:28px;padding:16px;background:#fff;border:1px solid var(--zinc-200);border-radius:8px}
.btn-export{background:var(--zinc-800);color:#fff;border:none;font-family:inherit;font-size:13px;font-weight:600;cursor:pointer;padding:8px 18px;border-radius:6px}
.hint{margin-top:8px;font-size:12px;color:var(--zinc-500)} code{background:var(--zinc-100);border:1px solid var(--zinc-200);padding:1px 5px;border-radius:3px;font-family:ui-monospace,monospace;font-size:11px}
</style></head><body><div class="page">
<div class="header"><h1>Organic-places review</h1><div class="meta" id="meta"></div></div>
<div class="progress-stats" id="stats"></div>
<div class="filter-row" id="filters"></div>
<div id="list"></div>
<div class="export"><button class="btn-export" id="export">Download organic-places-decisions.json</button>
<div class="hint">Save to <code>data/research/mentions/organic-places-decisions.json</code> (ingestion is a separate later step).</div></div>
</div>
<script>
(function(){
  const DATA = ${safeJson};
  const STATE_KEY = "organic-places-review-state";
  const VERSION = "v:" + DATA.computedAt;
  function load(){try{const r=localStorage.getItem(STATE_KEY);if(!r)return{};const p=JSON.parse(r);return p.version===VERSION?(p.decisions||{}):{}}catch{return{}}}
  function save(d){try{localStorage.setItem(STATE_KEY,JSON.stringify({version:VERSION,decisions:d}))}catch{}}
  const decisions = load();
  let filter = "all";
  function el(t,a,...c){const e=document.createElement(t);if(a)for(const[k,v]of Object.entries(a)){if(k==="className")e.className=v;else if(k.startsWith("on"))e.addEventListener(k.slice(2).toLowerCase(),v);else e.setAttribute(k,v)}c.flat(Infinity).forEach(x=>{if(x==null)return;e.append(typeof x==="string"?document.createTextNode(x):x)});return e}
  function link(href,text){if(!href)return document.createTextNode("—");let ok=false;try{ok=["http:","https:"].includes(new URL(href).protocol)}catch{}if(!ok)return document.createTextNode(text||href);const a=document.createElement("a");a.href=href;a.textContent=text||href;a.target="_blank";a.rel="noopener noreferrer";return a}
  function stats(){const t=DATA.places.length;const vals=Object.values(decisions);const ap=vals.filter(d=>d&&d.decision==="approve").length;const rj=vals.filter(d=>d&&d.decision==="reject").length;document.getElementById("stats").innerHTML="<span>"+(ap+rj)+" of "+t+" decided</span><span class='stat-approved'>"+ap+" approved</span><span class='stat-rejected'>"+rj+" rejected</span>"}
  function cardState(id){const d=decisions[id];const c=document.getElementById("c-"+id);if(!c)return;c.classList.remove("decided-approve","decided-reject");const a=c.querySelector(".btn-approve"),r=c.querySelector(".btn-reject");a.classList.remove("active");r.classList.remove("active");if(d&&d.decision==="approve"){c.classList.add("decided-approve");a.classList.add("active")}if(d&&d.decision==="reject"){c.classList.add("decided-reject");r.classList.add("active")}}
  function buildFilters(){const tiers=["all","established","emerging","watch"];const row=document.getElementById("filters");tiers.forEach(t=>{const n=t==="all"?DATA.places.length:DATA.places.filter(p=>p.tier===t).length;row.appendChild(el("button",{className:"chip"+(t==="all"?" active":""),"data-t":t,onClick:()=>setFilter(t)},t+" ("+n+")"))})}
  function setFilter(t){filter=t;document.querySelectorAll(".chip").forEach(c=>c.classList.toggle("active",c.dataset.t===t));DATA.places.forEach(p=>{const c=document.getElementById("c-"+p.placeId);if(c)c.classList.toggle("hidden",t!=="all"&&p.tier!==t)})}
  function card(p){
    const tierBadge=el("span",{className:"badge tier-"+p.tier},p.tier);
    const inDir=(p.matchedExistingHubIds&&p.matchedExistingHubIds.length)?el("span",{className:"badge indir"},"already in directory: "+p.matchedExistingHubIds.join(", ")):null;
    const head=el("div",{className:"card-head"},
      el("span",{className:"card-name"},p.canonicalName+(p.country?", "+p.country:"")),
      el("span",{className:"score"},String(p.score)),el("span",{className:"indep"},"· "+p.independentDomains+" indep"),
      tierBadge,inDir);
    const srcs=el("div",{className:"sources"},el("div",{},"sources ("+p.sources.length+"):"),
      ...p.sources.map(s=>el("div",{className:"src"},el("span",{className:"k"},s.kind+" · "+s.date),link(s.url,s.domain),s.snippet?el("div",{className:"snip"},s.snippet):null)));
    function set(dec){decisions[p.placeId]={decision:dec};save(decisions);cardState(p.placeId);stats()}
    const ctr=el("div",{className:"controls"},
      el("button",{className:"btn btn-approve",onClick:()=>set("approve")},"Approve"),
      el("button",{className:"btn btn-reject",onClick:()=>set("reject")},"Reject"));
    return el("div",{className:"card",id:"c-"+p.placeId},head,srcs,ctr);
  }
  function exportBtn(){document.getElementById("export").addEventListener("click",()=>{const out={};for(const[id,d]of Object.entries(decisions)){if(d&&d.decision)out[id]={decision:d.decision}}const blob=new Blob([JSON.stringify(out,null,2)+"\\n"],{type:"application/json"});const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="organic-places-decisions.json";a.click();URL.revokeObjectURL(a.href)})}
  function init(){document.getElementById("meta").textContent="Computed "+(DATA.computedAt||"—")+" — "+DATA.places.length+" places";buildFilters();const list=document.getElementById("list");DATA.places.forEach(p=>{list.appendChild(card(p));cardState(p.placeId)});exportBtn();stats()}
  init();
})();
</script></body></html>`;
}

function main() {
  if (!existsSync(SCORED)) { console.error("Run mentions:score first (organic-places-scored.json missing)."); process.exit(1); }
  const scored = JSON.parse(readFileSync(SCORED, "utf8")) as { places: unknown[] };
  writeFileSync(OUT, buildHtml(escapeJson(readFileSync(SCORED, "utf8"))));
  console.log(`wrote ${OUT} (${scored.places.length} places)`);
}

main();
```

- [ ] **Step 2: Add the npm script**

In `package.json` `"scripts"`, add:

```json
"mentions:review": "tsx scripts/mentions-review-page.ts",
```

- [ ] **Step 3: Verify**

Recreate the Task 9 fixture → `npm run mentions:resolve` → `npm run mentions:score`, then:

Run: `npm run mentions:review`
Expected: `wrote …/organic-places-review.html (1 places)`. Then sanity-check the HTML is self-contained:

Run: `node -e 'const h=require("fs").readFileSync("data/research/mentions/organic-places-review.html","utf8"); console.log("has data:", h.includes("Bansko"), "has export:", h.includes("organic-places-decisions.json"))'`
Expected: `has data: true has export: true`.

Then clean up the fixture/outputs (Task 9 Step 4) and re-run `npm run mentions:seed-registry` so only the clean registry is committed.

- [ ] **Step 4: Commit**

```bash
git add scripts/mentions-review-page.ts package.json
git commit -m "feat(mentions): mentions:review — self-contained ranked review page"
```

---

## Task 12: Full-suite check + plan-completion commit

**Files:** none (verification only)

- [ ] **Step 1: Run the whole test suite**

Run: `npm test`
Expected: all suites PASS, including `test/intake-mentions.test.ts`. Note the new total count.

- [ ] **Step 2: Run lint**

Run: `npm run lint`
Expected: no NEW errors in the files this plan created (the pre-existing `components/HubMap.tsx` error is out of scope and untouched).

- [ ] **Step 3: Confirm the npm scripts are all wired**

Run: `node -e 'const s=require("./package.json").scripts; ["mentions:seed-registry","discover:mentions","mentions:resolve","mentions:score","mentions:review"].forEach(k=>console.log(k, s[k]?"OK":"MISSING"))'`
Expected: all five `OK`.

- [ ] **Step 4: Final commit (if anything uncommitted)**

```bash
git add -A
git commit -m "chore(mentions): organic-places mining pipeline complete" || echo "nothing to commit"
```

---

## Notes for the implementer

- **Order matters within `lib/intake/mentions.ts`:** all functions are appended to one file across Tasks 1–4 and 7; keep the type/interface block (Task 1) at the top.
- **Nominatim politeness:** `mentions:resolve` sleeps 1.1s between *uncached* geocodes and caches every result (including nulls) in `geocode-cache.json` — re-runs are cheap and idempotent.
- **No directory mutation:** nothing in this pipeline writes `overrides.json`, `directory.json`, or the map. The exported `organic-places-decisions.json` is the hand-off artifact for a separate, later ingestion plan (explicitly out of scope per the spec).
- **Token discipline lives in two places:** the agent runs Haiku (frontmatter `model: haiku`), and the planner only emits pages whose content hash changed — so steady-state re-runs extract almost nothing.
```
