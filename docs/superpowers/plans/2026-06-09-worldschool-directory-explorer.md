# Worldschool Directory Explorer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the home page with an Airbnb-style split-view explorer (card grid + live map, one shared filter bar) over the full 168-entry consolidated worldschooling directory, in a bold-playful aesthetic.

**Architecture:** A build-time TypeScript step enriches the raw consolidated directory into a client-ready `public/directory.json` (derived `months[]`, `costBucket`, `coords`, resolved local `image`). The Next.js client reads that file and renders a filter bar + card grid + Leaflet map + detail modal. All filtering logic lives in pure, unit-tested functions; components stay thin.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, Tailwind v4 (arbitrary values for the custom palette), Leaflet + leaflet.markercluster, Vitest, tsx. Fonts via `next/font/google` (Baloo 2 + Hanken Grotesk).

**Spec:** `docs/superpowers/specs/2026-06-09-worldschool-directory-explorer-design.md`

**Conventions in this repo (follow exactly):**
- Tests live in `test/*.test.ts`, run with `npm test` (vitest). Tests use **relative imports** (`../lib/x`), not `@/`.
- App code uses the `@/*` → `./*` path alias.
- Data build scripts live in `scripts/*.ts`, run via `tsx` (see `scripts/build-data.ts`).
- Leaflet must be loaded client-only via `next/dynamic({ ssr:false })` (it touches `window`); see `components/HubMap.tsx`.
- **Per `AGENTS.md`: before writing any Next.js code (Tasks 6–12), read the relevant guide under `node_modules/next/dist/docs/01-app/` — this project's Next.js differs from training data.**

**Note vs spec:** The spec mentioned a Python enrichment script with parsers "mirrored in TS/Python". To stay DRY we implement enrichment in **TypeScript only** (one tested parser, reused by the build script). No Python is added.

---

## Shared type & filter contract (defined in Task 3, referenced everywhere)

```ts
// lib/directory.ts
export type HubCategory =
  | "organic" | "permanent_commercial" | "permanent_community"
  | "popup" | "traveling" | "spanish_immersion" | "online";

export type CostBucket = "free" | "low" | "mid" | "high" | "unlisted";
export type Participation = "family" | "dropoff" | "";

export interface DirectoryHub {
  id: string;
  name: string;
  host: string;
  category: HubCategory;
  spanish: boolean;
  participation: Participation;
  country: string;
  region: string;
  season: string;            // raw free-text
  months: number[];          // derived 1–12 ([] = flexible)
  price: string;             // raw free-text
  costBucket: CostBucket;    // derived
  ages: string;
  nationality: string;
  validity: string;
  website: string;
  facebook: string;
  summary: string;
  references: [string, string][];
  image: string;             // resolved: data: URI or /directory-images/<file>
  coords: [number, number] | null; // null = not placeable on map
}

export interface DirectoryFilter {
  months?: number[];
  costs?: CostBucket[];
  categories?: HubCategory[];
  participation?: Participation[]; // "family" | "dropoff"
  spanishOnly?: boolean;
  countries?: string[];
  query?: string;
}
```

**Filter semantics (AND across facets, OR within a facet):**
- `months`: active when non-empty → keep if `hub.months` is empty (flexible, never hidden) OR intersects the selection.
- `costs`: active when non-empty → keep if `hub.costBucket ∈ costs`. `"unlisted"` is a first-class selectable bucket, so with no cost filter active everything (including unlisted) shows; unlisted only disappears once the user selects buckets without it.
- `categories`: keep if `hub.category ∈ categories`.
- `participation`: keep if `hub.participation ∈ participation`; blank-participation entries match only when no participation filter is active.
- `spanishOnly`: keep only `hub.spanish === true`.
- `countries`: keep if `hub.country ∈ countries`.
- `query`: case-insensitive substring over name/host/summary/country/region.

---

## Task 1: `parseMonths` — derive active months from free-text season

**Files:**
- Create: `lib/season.ts`
- Test: `test/season.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// test/season.test.ts
import { describe, it, expect } from "vitest";
import { parseMonths } from "../lib/season";

describe("parseMonths", () => {
  it("expands a simple wrapping range", () => {
    expect(parseMonths("Best Dec-Apr")).toEqual([1, 2, 3, 4, 12]);
  });
  it("handles en-dash and a qualifier word", () => {
    expect(parseMonths("Nov–early Feb")).toEqual([1, 2, 11, 12]);
  });
  it("treats a dated range as month span", () => {
    expect(parseMonths("May 31 – July 12 2026 (three 2-week sessions)")).toEqual([5, 6, 7]);
  });
  it("returns all months for year-round", () => {
    expect(parseMonths("Year-round")).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(parseMonths("Year round")).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });
  it("returns empty (flexible) when no months are present", () => {
    expect(parseMonths("")).toEqual([]);
    expect(parseMonths("Short or long term; ski season")).toEqual([]);
  });
  it("expands Nov–Mar", () => {
    expect(parseMonths("Nov–Mar")).toEqual([1, 2, 3, 11, 12]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- season`
Expected: FAIL — "Cannot find module '../lib/season'".

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/season.ts
const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

/**
 * Derive the set of calendar months (1–12) a hub is active from its free-text
 * `season`. Ranges expand inclusively and wrap across the year end. Returns [] when
 * nothing parseable is found — callers treat [] as "flexible / always show".
 */
export function parseMonths(season: string): number[] {
  const s = (season || "").toLowerCase();
  if (!s.trim()) return [];
  if (/year[\s-]*round|all year/.test(s)) {
    return [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  }

  const re = /(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*/g;
  const found: { mon: number; end: number; idx: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) {
    found.push({ mon: MONTHS[m[1]], idx: m.index, end: re.lastIndex });
  }
  if (found.length === 0) return [];

  const result = new Set<number>();
  for (let i = 0; i < found.length; i++) {
    result.add(found[i].mon);
    if (i < found.length - 1) {
      const between = s.slice(found[i].end, found[i + 1].idx);
      if (/[-–—]|to|through|until|till|thru/.test(between)) {
        let cur = found[i].mon;
        const to = found[i + 1].mon;
        while (cur !== to) {
          cur = (cur % 12) + 1;
          result.add(cur);
        }
      }
    }
  }
  return [...result].sort((a, b) => a - b);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- season`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/season.ts test/season.test.ts
git commit -m "feat: parseMonths — derive active months from free-text season"
```

---

## Task 2: `costBucket` — bucket free-text price

**Files:**
- Create: `lib/cost.ts`
- Test: `test/cost.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// test/cost.test.ts
import { describe, it, expect } from "vitest";
import { costBucket } from "../lib/cost";

describe("costBucket", () => {
  it("returns unlisted for blank or vague price", () => {
    expect(costBucket("")).toBe("unlisted");
    expect(costBucket("Varies")).toBe("unlisted");
  });
  it("detects free", () => {
    expect(costBucket("Free")).toBe("free");
    expect(costBucket("Free (WhatsApp self-organized)")).toBe("free");
  });
  it("detects qualitative low", () => {
    expect(costBucket("Low cost of living")).toBe("low");
  });
  it("buckets monthly amounts", () => {
    expect(costBucket("$720 USD per month")).toBe("low");
    expect(costBucket("~$1,088/mo")).toBe("mid");
  });
  it("buckets large lump sums as high", () => {
    expect(costBucket("Starting at €3,500 (14 nights lodging, group activities)")).toBe("high");
  });
  it("buckets a small per-family fee as low", () => {
    expect(costBucket("Max $180/family, discounts available")).toBe("low");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- cost`
Expected: FAIL — "Cannot find module '../lib/cost'".

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/cost.ts
import type { CostBucket } from "./directory";

/**
 * Bucket a free-text price into a coarse band. Numeric amounts are normalized
 * toward a monthly figure where the unit is given. Blank / "varies" → "unlisted",
 * which the UI keeps visible by default. Thresholds are tunable, not a hard spec.
 */
export function costBucket(price: string): CostBucket {
  const s = (price || "").toLowerCase().trim();
  if (!s) return "unlisted";
  if (/\bvaries\b|tbd|to be |depends|inquire|contact|n\/a/.test(s)) return "unlisted";
  if (/\bfree\b|no cost|no charge/.test(s)) return "free";

  const nums = [...s.matchAll(/[$€£]\s?([\d,]+(?:\.\d+)?)|([\d,]+)\s?(?:usd|eur|gbp)/g)]
    .map((m) => parseFloat((m[1] ?? m[2]).replace(/,/g, "")))
    .filter((n) => !Number.isNaN(n));

  if (nums.length > 0) {
    const amt = Math.min(...nums);
    const perWeek = /week|\/wk|weekly/.test(s);
    const monthly = perWeek ? amt * 4 : amt;
    if (monthly < 800) return "low";
    if (monthly <= 2500) return "mid";
    return "high";
  }

  if (/low cost|cheap|affordable|budget|low-cost/.test(s)) return "low";
  return "unlisted";
}
```

> Note: `CostBucket` is imported from `./directory`, created in Task 3. Tasks 1–3 can be written in any order, but run the test suite only after Task 3 exists. If executing strictly in order, temporarily inline `type CostBucket = "free"|"low"|"mid"|"high"|"unlisted";` at the top of `lib/cost.ts`, then replace it with the import in Task 3.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- cost`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/cost.ts test/cost.test.ts
git commit -m "feat: costBucket — bucket free-text price into bands"
```

---

## Task 3: Directory types, `CATEGORY_META`, `filterDirectory`, `uniqueDirectoryCountries`

**Files:**
- Create: `lib/directory.ts`
- Test: `test/directory.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// test/directory.test.ts
import { describe, it, expect } from "vitest";
import { filterDirectory, uniqueDirectoryCountries, type DirectoryHub } from "../lib/directory";

function hub(overrides: Partial<DirectoryHub> & { id: string }): DirectoryHub {
  return {
    id: overrides.id, name: overrides.id, host: "", category: "organic",
    spanish: false, participation: "", country: "Spain", region: "",
    season: "", months: [], price: "", costBucket: "unlisted", ages: "",
    nationality: "", validity: "", website: "", facebook: "", summary: "",
    references: [], image: "", coords: null, ...overrides,
  };
}

describe("filterDirectory", () => {
  const hubs = [
    hub({ id: "a", category: "organic", months: [12, 1, 2], costBucket: "low", participation: "family", country: "Bulgaria" }),
    hub({ id: "b", category: "popup", months: [], costBucket: "unlisted", participation: "dropoff", country: "Mexico" }),
    hub({ id: "c", category: "spanish_immersion", months: [6, 7], costBucket: "high", spanish: true, country: "Spain", summary: "Sucre immersion" }),
  ];

  it("returns all hubs with no filter", () => {
    expect(filterDirectory(hubs, {}).map((h) => h.id)).toEqual(["a", "b", "c"]);
  });
  it("month filter keeps matches AND flexible ([]) hubs", () => {
    expect(filterDirectory(hubs, { months: [1] }).map((h) => h.id)).toEqual(["a", "b"]);
  });
  it("cost filter hides unlisted once specific buckets are chosen", () => {
    expect(filterDirectory(hubs, { costs: ["low", "high"] }).map((h) => h.id)).toEqual(["a", "c"]);
  });
  it("category filter is OR within the facet", () => {
    expect(filterDirectory(hubs, { categories: ["organic", "popup"] }).map((h) => h.id)).toEqual(["a", "b"]);
  });
  it("participation filter hides blank-participation entries", () => {
    expect(filterDirectory(hubs, { participation: ["family"] }).map((h) => h.id)).toEqual(["a"]);
  });
  it("spanishOnly keeps only spanish hubs", () => {
    expect(filterDirectory(hubs, { spanishOnly: true }).map((h) => h.id)).toEqual(["c"]);
  });
  it("query matches summary and country case-insensitively", () => {
    expect(filterDirectory(hubs, { query: "sucre" }).map((h) => h.id)).toEqual(["c"]);
    expect(filterDirectory(hubs, { query: "mexico" }).map((h) => h.id)).toEqual(["b"]);
  });
  it("combines facets with AND", () => {
    expect(filterDirectory(hubs, { months: [7], spanishOnly: true }).map((h) => h.id)).toEqual(["c"]);
  });
});

describe("uniqueDirectoryCountries", () => {
  it("returns sorted unique non-empty countries", () => {
    const hubs = [hub({ id: "a", country: "Mexico" }), hub({ id: "b", country: "" }), hub({ id: "c", country: "Bulgaria" })];
    expect(uniqueDirectoryCountries(hubs)).toEqual(["Bulgaria", "Mexico"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- directory`
Expected: FAIL — "Cannot find module '../lib/directory'".

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/directory.ts
export type HubCategory =
  | "organic" | "permanent_commercial" | "permanent_community"
  | "popup" | "traveling" | "spanish_immersion" | "online";

export type CostBucket = "free" | "low" | "mid" | "high" | "unlisted";
export type Participation = "family" | "dropoff" | "";

export interface DirectoryHub {
  id: string;
  name: string;
  host: string;
  category: HubCategory;
  spanish: boolean;
  participation: Participation;
  country: string;
  region: string;
  season: string;
  months: number[];
  price: string;
  costBucket: CostBucket;
  ages: string;
  nationality: string;
  validity: string;
  website: string;
  facebook: string;
  summary: string;
  references: [string, string][];
  image: string;
  coords: [number, number] | null;
}

export interface DirectoryFilter {
  months?: number[];
  costs?: CostBucket[];
  categories?: HubCategory[];
  participation?: Participation[];
  spanishOnly?: boolean;
  countries?: string[];
  query?: string;
}

/** Label, accent colour, and emoji per hub type — used by cards, pins, legend, filter pills. */
export const CATEGORY_META: Record<HubCategory, { label: string; color: string; emoji: string }> = {
  organic: { label: "Organic", color: "#3f9e57", emoji: "🌳" },
  permanent_commercial: { label: "Commercial", color: "#7b4dff", emoji: "🏫" },
  permanent_community: { label: "Community", color: "#1aa18c", emoji: "🌿" },
  popup: { label: "Pop-up", color: "#ff4d6d", emoji: "🎪" },
  traveling: { label: "Traveling", color: "#4d7dff", emoji: "⛰️" },
  spanish_immersion: { label: "Spanish", color: "#f0a500", emoji: "🗣️" },
  online: { label: "Online", color: "#7a8699", emoji: "💻" },
};

export const COST_META: Record<CostBucket, string> = {
  free: "Free", low: "$", mid: "$$", high: "$$$", unlisted: "Not listed",
};

const searchText = (h: DirectoryHub) =>
  [h.name, h.host, h.summary, h.country, h.region].filter(Boolean).join(" ").toLowerCase();

/** Pure, testable filtering for the explorer UI. AND across facets, OR within. */
export function filterDirectory(hubs: DirectoryHub[], f: DirectoryFilter): DirectoryHub[] {
  const q = f.query?.trim().toLowerCase();
  return hubs.filter((h) => {
    if (f.months && f.months.length > 0) {
      const flexible = h.months.length === 0;
      if (!flexible && !f.months.some((m) => h.months.includes(m))) return false;
    }
    if (f.costs && f.costs.length > 0 && !f.costs.includes(h.costBucket)) return false;
    if (f.categories && f.categories.length > 0 && !f.categories.includes(h.category)) return false;
    if (f.participation && f.participation.length > 0 && !f.participation.includes(h.participation)) return false;
    if (f.spanishOnly && !h.spanish) return false;
    if (f.countries && f.countries.length > 0 && !f.countries.includes(h.country)) return false;
    if (q && !searchText(h).includes(q)) return false;
    return true;
  });
}

/** Sorted, de-duplicated non-empty countries present in the data, for the country filter. */
export function uniqueDirectoryCountries(hubs: DirectoryHub[]): string[] {
  const set = new Set<string>();
  for (const h of hubs) if (h.country) set.add(h.country);
  return [...set].sort((a, b) => a.localeCompare(b));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS — all of `season`, `cost`, `directory`, and the pre-existing `hub` suites green.

- [ ] **Step 5: Commit**

```bash
git add lib/directory.ts test/directory.test.ts
git commit -m "feat: directory types, filterDirectory, CATEGORY_META"
```

---

## Task 4: Country centroid lookup table

**Files:**
- Create: `data/research/country-centroids.json`

- [ ] **Step 1: Create the centroid table**

```json
{
  "Australia": [-25.3, 133.8],
  "Austria": [47.5, 14.5],
  "Bolivia": [-16.3, -63.6],
  "Bulgaria": [42.7, 25.5],
  "Cambodia": [12.6, 104.9],
  "Colombia": [4.6, -74.3],
  "Costa Rica": [9.7, -83.8],
  "Croatia": [45.1, 15.2],
  "Curaçao": [12.2, -69.0],
  "Cyprus": [35.1, 33.4],
  "Dominican Republic": [18.7, -70.2],
  "Ecuador": [-1.8, -78.2],
  "Egypt": [26.8, 30.8],
  "El Salvador": [13.8, -88.9],
  "England": [52.4, -1.5],
  "Estonia": [58.6, 25.0],
  "France": [46.6, 2.2],
  "Georgia": [42.3, 43.4],
  "Greece": [39.1, 21.8],
  "Guatemala": [15.8, -90.2],
  "Honduras": [15.2, -86.2],
  "India": [21.1, 78.0],
  "Indonesia": [-2.5, 118.0],
  "Italy": [41.9, 12.6],
  "Japan": [36.2, 138.3],
  "Madagascar": [-18.8, 46.9],
  "Malaysia": [4.2, 101.9],
  "Maldives": [3.2, 73.2],
  "Mexico": [23.6, -102.5],
  "Morocco": [31.8, -7.1],
  "New Zealand": [-41.0, 174.0],
  "Peru": [-9.2, -75.0],
  "Poland": [51.9, 19.1],
  "Portugal": [39.4, -8.2],
  "Romania": [45.9, 24.9],
  "South Africa": [-30.6, 22.9],
  "Spain": [40.0, -3.7],
  "Tanzania": [-6.4, 34.9],
  "Thailand": [15.9, 100.9],
  "Turkey": [39.0, 35.2],
  "Uganda": [1.4, 32.3],
  "United States": [39.8, -98.6],
  "Vietnam": [14.1, 108.3]
}
```

- [ ] **Step 2: Commit**

```bash
git add data/research/country-centroids.json
git commit -m "data: country centroid lookup for directory map placement"
```

---

## Task 5: Build-time enrichment script → `public/directory.json`

**Files:**
- Create: `scripts/build-explorer-data.ts`
- Modify: `package.json` (add `build:explorer` script)
- Generated: `public/directory.json`, `public/directory-images/*`

- [ ] **Step 1: Add the npm script**

In `package.json`, add to `"scripts"` (after `"build:data"`):

```json
    "build:explorer": "tsx scripts/build-explorer-data.ts",
```

- [ ] **Step 2: Write the enrichment script**

```ts
// scripts/build-explorer-data.ts
/**
 * Enrich the consolidated worldschooling directory into a client-ready
 * public/directory.json: derive months[] + costBucket, resolve coords from a
 * country-centroid table (reusing precise coords from data/hubs/*.json when an id
 * matches), and copy referenced local images into public/directory-images/.
 *
 * Usage: npm run build:explorer
 */
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync } from "node:fs";
import { join, basename } from "node:path";
import { parseMonths } from "../lib/season";
import { costBucket } from "../lib/cost";
import type { DirectoryHub, HubCategory } from "../lib/directory";

const ROOT = process.cwd();
const RESEARCH = join(ROOT, "data", "research");
const SRC = join(RESEARCH, "directory-consolidated-2026-06-09.json");
const CENTROIDS = join(RESEARCH, "country-centroids.json");
const HUBS_JSON = join(ROOT, "public", "hubs.json");
const IMG_OUT = join(ROOT, "public", "directory-images");
const OUT = join(ROOT, "public", "directory.json");

const VALID_CATEGORIES: HubCategory[] = [
  "organic", "permanent_commercial", "permanent_community",
  "popup", "traveling", "spanish_immersion", "online",
];

function primaryCountry(raw: string): string {
  return (raw || "").split(/[+,(]/)[0].trim();
}

function main() {
  const raw = JSON.parse(readFileSync(SRC, "utf8")) as Record<string, unknown>[];
  const centroids = JSON.parse(readFileSync(CENTROIDS, "utf8")) as Record<string, [number, number]>;
  const hubs = JSON.parse(readFileSync(HUBS_JSON, "utf8")) as {
    id: string; location: { lat: number | null; lng: number | null };
  }[];
  const hubCoords = new Map<string, [number, number]>();
  for (const h of hubs) {
    if (typeof h.location?.lat === "number" && typeof h.location?.lng === "number") {
      hubCoords.set(h.id, [h.location.lat, h.location.lng]);
    }
  }

  mkdirSync(IMG_OUT, { recursive: true });

  let placed = 0, copied = 0;
  const out: DirectoryHub[] = raw.map((e) => {
    const id = String(e.id);
    const country = String(e.country ?? "");
    const category = (VALID_CATEGORIES.includes(e.category as HubCategory)
      ? e.category : "organic") as HubCategory;

    // coords: precise hub match first, else country centroid, else null
    let coords: [number, number] | null = hubCoords.get(id) ?? null;
    if (!coords) {
      const c = centroids[primaryCountry(country)];
      if (c) coords = c;
    }
    if (coords) placed++;

    // image: prefer the local photo (copied into public), else the inline thumb
    let image = String(e.thumb ?? "");
    const photo = String(e.photo ?? "");
    if (photo && !photo.startsWith("data:")) {
      const srcPath = join(RESEARCH, photo);
      if (existsSync(srcPath)) {
        const file = basename(photo);
        copyFileSync(srcPath, join(IMG_OUT, file));
        image = `/directory-images/${file}`;
        copied++;
      }
    }

    const refs = Array.isArray(e.references)
      ? (e.references as [string, string][])
      : [];

    return {
      id,
      name: String(e.name ?? ""),
      host: String(e.host ?? ""),
      category,
      spanish: Boolean(e.spanish),
      participation: (e.participation as DirectoryHub["participation"]) ?? "",
      country,
      region: String(e.region ?? ""),
      season: String(e.season ?? ""),
      months: parseMonths(String(e.season ?? "")),
      price: String(e.price ?? ""),
      costBucket: costBucket(String(e.price ?? "")),
      ages: String(e.ages ?? ""),
      nationality: String(e.nationality ?? ""),
      validity: String(e.validity ?? ""),
      website: String(e.website ?? ""),
      facebook: String(e.facebook ?? ""),
      summary: String(e.summary ?? ""),
      references: refs,
      image,
      coords,
    };
  });

  writeFileSync(OUT, JSON.stringify(out, null, 2) + "\n");
  console.log(`Wrote ${out.length} hubs to public/directory.json`);
  console.log(`  ${placed} placed on map, ${out.length - placed} not placeable`);
  console.log(`  ${copied} images copied to public/directory-images/`);
}

main();
```

- [ ] **Step 3: Run the build and verify output**

Run: `npm run build:explorer`
Expected output (counts approximate, must be non-zero):
```
Wrote 168 hubs to public/directory.json
  ~150 placed on map, ~18 not placeable
  ~150 images copied to public/directory-images/
```

- [ ] **Step 4: Sanity-check the generated JSON**

Run: `node -e "const d=require('./public/directory.json'); const x=d.find(h=>h.id==='bansko-town-base-city'); console.log(x.months, x.costBucket, x.coords, x.image.slice(0,30));"`
Expected: months array including 12,1,2,3,4 · `low` · a `[lat,lng]` pair · an image path/URI.

- [ ] **Step 5: Commit**

```bash
git add scripts/build-explorer-data.ts package.json public/directory.json public/directory-images
git commit -m "feat: enrichment script + generated public/directory.json"
```

---

## Task 6: Fonts — add Baloo 2 + Hanken Grotesk

**Files:**
- Modify: `app/layout.tsx`

> First read `node_modules/next/dist/docs/01-app/` guidance on `next/font` if anything below conflicts with this project's Next version.

- [ ] **Step 1: Add the font imports and variables**

In `app/layout.tsx`, add after the existing Geist imports:

```tsx
import { Baloo_2, Hanken_Grotesk } from "next/font/google";

const balooDisplay = Baloo_2({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

const hankenBody = Hanken_Grotesk({
  variable: "--font-body",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});
```

Then add both variables to the `<html>` className (keep the existing Geist variables):

```tsx
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${balooDisplay.variable} ${hankenBody.variable} h-full antialiased`}
    >
```

- [ ] **Step 2: Verify it compiles**

Run: `npm run build`
Expected: build succeeds (fonts download at build time). If offline, run `npm run dev` and load `/` instead; expect no font-import errors in the terminal.

- [ ] **Step 3: Commit**

```bash
git add app/layout.tsx
git commit -m "feat: load Baloo 2 + Hanken Grotesk fonts"
```

---

## Task 7: `HubCard` component

**Files:**
- Create: `components/directory/HubCard.tsx`

- [ ] **Step 1: Write the component**

```tsx
// components/directory/HubCard.tsx
"use client";

import { CATEGORY_META, COST_META, type DirectoryHub } from "@/lib/directory";

const MONTH_ABBR = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Compact "Dec–Apr" / "Year-round" label from a months[] set. */
function monthLabel(months: number[]): string {
  if (months.length === 0) return "Flexible";
  if (months.length === 12) return "Year-round";
  // find the gap to render a contiguous wrapping range nicely; fall back to first–last
  const sorted = [...months].sort((a, b) => a - b);
  return `${MONTH_ABBR[sorted[0]]}–${MONTH_ABBR[sorted[sorted.length - 1]]}`;
}

export default function HubCard({
  hub, onOpen,
}: { hub: DirectoryHub; onOpen: (id: string) => void }) {
  const meta = CATEGORY_META[hub.category];
  const isData = hub.image.startsWith("data:");
  return (
    <button
      type="button"
      onClick={() => onOpen(hub.id)}
      className="group block w-full overflow-hidden rounded-[20px] border-[2.5px] border-[#20140d] bg-white text-left shadow-[5px_6px_0_#20140d] transition-transform duration-150 hover:-translate-y-[3px] hover:shadow-[8px_10px_0_#20140d]"
    >
      <div className="relative h-[120px] w-full">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={hub.image || meta.color}
          alt={hub.name}
          className={`h-full w-full ${isData ? "object-cover" : "object-cover"}`}
          style={!hub.image ? { background: meta.color } : undefined}
        />
        <span
          className="absolute left-[10px] top-[10px] -rotate-3 rounded-[9px] border-2 border-[#20140d] px-[9px] py-[2px] text-[11px] font-semibold"
          style={{ background: meta.color, color: "#fff", fontFamily: "var(--font-display)" }}
        >
          {meta.emoji} {meta.label}
        </span>
        {hub.participation && (
          <span className="absolute right-[10px] top-[10px] flex h-[26px] w-[26px] items-center justify-center rounded-full border-2 border-[#20140d] bg-white text-[13px]">
            {hub.participation === "dropoff" ? "🎒" : "👪"}
          </span>
        )}
      </div>
      <div className="px-[14px] pb-[14px] pt-[11px]" style={{ fontFamily: "var(--font-body)", color: "#20140d" }}>
        <h3 className="mb-[3px] text-[16px] leading-tight" style={{ fontFamily: "var(--font-display)", fontWeight: 700 }}>
          {hub.name}
        </h3>
        <div className="text-[12.5px] font-semibold text-[#6b4e3d]">
          {[hub.region, hub.country].filter(Boolean).join(", ") || "Location varies"}
        </div>
        <div className="mt-[9px] flex flex-wrap gap-[6px]">
          <span className="rounded-[7px] border-[1.5px] border-[#20140d] bg-[#caffbf] px-[7px] py-px text-[11px] font-semibold" style={{ fontFamily: "var(--font-display)" }}>
            {monthLabel(hub.months)}
          </span>
          <span className="rounded-[7px] border-[1.5px] border-[#20140d] bg-[#ffd6a5] px-[7px] py-px text-[11px] font-semibold" style={{ fontFamily: "var(--font-display)" }}>
            {COST_META[hub.costBucket]}
          </span>
        </div>
      </div>
    </button>
  );
}
```

- [ ] **Step 2: Verify it type-checks**

Run: `npx tsc --noEmit`
Expected: no errors referencing `HubCard.tsx`.

- [ ] **Step 3: Commit**

```bash
git add components/directory/HubCard.tsx
git commit -m "feat: HubCard — playful directory card"
```

---

## Task 8: `DirectoryMap` component

**Files:**
- Create: `components/directory/DirectoryMap.tsx`

> This adapts `components/HubMap.tsx`. Read that file first; reuse its mount/cluster/teardown structure. Only the data shape (coords array vs `location.lat`) and pin colour source (`CATEGORY_META`) differ.

- [ ] **Step 1: Write the component**

```tsx
// components/directory/DirectoryMap.tsx
"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import { CATEGORY_META, type DirectoryHub } from "@/lib/directory";

interface Props {
  hubs: DirectoryHub[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

function pinIcon(hub: DirectoryHub, selected: boolean): L.DivIcon {
  const color = CATEGORY_META[hub.category].color;
  const size = selected ? 40 : 30;
  const html = `
    <svg width="${size}" height="${size}" viewBox="0 0 24 24" style="filter:drop-shadow(0 1px 2px rgba(0,0,0,.4))">
      <path d="M12 0C6.5 0 2 4.5 2 10c0 7 10 14 10 14s10-7 10-14C22 4.5 17.5 0 12 0z"
        fill="${color}" stroke="#20140d" stroke-width="${selected ? 2.5 : 2}"/>
      <circle cx="12" cy="10" r="3.4" fill="#fff"/>
    </svg>`;
  return L.divIcon({ html, className: "ws-pin", iconSize: [size, size], iconAnchor: [size / 2, size], tooltipAnchor: [0, -size + 6] });
}

export default function DirectoryMap({ hubs, selectedId, onSelect }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const clusterRef = useRef<L.MarkerClusterGroup | null>(null);
  const markersRef = useRef<Map<string, L.Marker>>(new Map());
  const onSelectRef = useRef(onSelect);
  const selectedRef = useRef<string | null>(selectedId);
  onSelectRef.current = onSelect;

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, { center: [20, 0], zoom: 2, minZoom: 2, worldCopyJump: true, scrollWheelZoom: true });
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors', maxZoom: 19,
    }).addTo(map);
    const cluster = L.markerClusterGroup({ showCoverageOnHover: false, maxClusterRadius: 45, chunkedLoading: true });
    map.addLayer(cluster);
    mapRef.current = map;
    clusterRef.current = cluster;
    return () => { map.remove(); mapRef.current = null; clusterRef.current = null; markersRef.current.clear(); };
  }, []);

  useEffect(() => {
    const map = mapRef.current, cluster = clusterRef.current;
    if (!map || !cluster) return;
    cluster.clearLayers();
    markersRef.current.clear();
    const located = hubs.filter((h) => h.coords !== null);
    for (const hub of located) {
      const [lat, lng] = hub.coords as [number, number];
      const marker = L.marker([lat, lng], { icon: pinIcon(hub, hub.id === selectedRef.current) });
      marker.bindTooltip(`<strong>${hub.name}</strong>${hub.country ? ` · ${hub.country}` : ""}`, { direction: "top" });
      marker.on("click", () => onSelectRef.current(hub.id));
      cluster.addLayer(marker);
      markersRef.current.set(hub.id, marker);
    }
    if (located.length > 0) map.fitBounds(cluster.getBounds(), { padding: [48, 48], maxZoom: 8 });
  }, [hubs]);

  useEffect(() => {
    const map = mapRef.current, cluster = clusterRef.current;
    if (!map || !cluster) return;
    const prev = selectedRef.current;
    selectedRef.current = selectedId;
    const prevHub = prev ? hubs.find((h) => h.id === prev) : null;
    const prevMarker = prev ? markersRef.current.get(prev) : null;
    if (prevHub && prevMarker) prevMarker.setIcon(pinIcon(prevHub, false));
    const hub = selectedId ? hubs.find((h) => h.id === selectedId) : null;
    const marker = selectedId ? markersRef.current.get(selectedId) : null;
    if (hub && marker) {
      marker.setIcon(pinIcon(hub, true));
      cluster.zoomToShowLayer(marker, () => { map.panTo(marker.getLatLng()); marker.openTooltip(); });
    }
  }, [selectedId, hubs]);

  return <div ref={containerRef} className="absolute inset-0 h-full w-full" />;
}
```

- [ ] **Step 2: Verify it type-checks**

Run: `npx tsc --noEmit`
Expected: no errors referencing `DirectoryMap.tsx`.

- [ ] **Step 3: Commit**

```bash
git add components/directory/DirectoryMap.tsx
git commit -m "feat: DirectoryMap — clustered, category-coloured pins"
```

---

## Task 9: `FilterBar` component

**Files:**
- Create: `components/directory/FilterBar.tsx`

- [ ] **Step 1: Write the component**

```tsx
// components/directory/FilterBar.tsx
"use client";

import { CATEGORY_META, COST_META, type CostBucket, type DirectoryFilter, type HubCategory, type Participation } from "@/lib/directory";

const MONTHS: { n: number; label: string }[] = [
  { n: 1, label: "Jan" }, { n: 2, label: "Feb" }, { n: 3, label: "Mar" }, { n: 4, label: "Apr" },
  { n: 5, label: "May" }, { n: 6, label: "Jun" }, { n: 7, label: "Jul" }, { n: 8, label: "Aug" },
  { n: 9, label: "Sep" }, { n: 10, label: "Oct" }, { n: 11, label: "Nov" }, { n: 12, label: "Dec" },
];
const COSTS: CostBucket[] = ["free", "low", "mid", "high", "unlisted"];
const CATEGORIES = Object.keys(CATEGORY_META) as HubCategory[];

const PILL = "rounded-full border-2 border-[#20140d] bg-white px-[11px] py-[4px] text-[12.5px] font-medium cursor-pointer transition-colors";

function toggle<T>(arr: T[] | undefined, v: T): T[] {
  const cur = arr ?? [];
  return cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v];
}

interface Props {
  filter: DirectoryFilter;
  onChange: (next: DirectoryFilter) => void;
  countries: string[];
  resultCount: number;
  onReset: () => void;
}

export default function FilterBar({ filter, onChange, countries, resultCount, onReset }: Props) {
  const set = (patch: Partial<DirectoryFilter>) => onChange({ ...filter, ...patch });
  const display = { fontFamily: "var(--font-display)" };
  const active = (on: boolean, bg: string) => (on ? { background: bg } : undefined);

  return (
    <div className="border-b-[2.5px] border-[#20140d] bg-white px-4 py-3" style={{ fontFamily: "var(--font-body)", color: "#20140d" }}>
      <div className="mb-3 flex items-center gap-3">
        <span className="text-[20px]" style={{ ...display, fontWeight: 800 }}>🌍 Worldschool Atlas</span>
        <input
          value={filter.query ?? ""}
          onChange={(e) => set({ query: e.target.value })}
          placeholder="Search hubs, hosts, places…"
          className="ml-2 w-[230px] rounded-full border-2 border-[#20140d] bg-[#fff8ef] px-[14px] py-[6px] text-[13px] outline-none"
        />
        <span className="ml-auto rounded-full border-2 border-[#20140d] bg-[#caffbf] px-[12px] py-[3px] text-[14px]" style={{ ...display, fontWeight: 600 }}>
          {resultCount} hubs
        </span>
        <button type="button" onClick={onReset} className="rounded-full border-2 border-[#20140d] px-[12px] py-[3px] text-[13px]" style={{ ...display, fontWeight: 600 }}>
          Reset
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
        <span className="text-[12px] opacity-70" style={display}>When</span>
        {MONTHS.map((m) => (
          <button key={m.n} type="button" className={PILL} style={{ ...display, ...active((filter.months ?? []).includes(m.n), "#caffbf") }}
            onClick={() => set({ months: toggle(filter.months, m.n) })}>{m.label}</button>
        ))}

        <span className="mx-1 h-[22px] w-px bg-[#20140d22]" />
        <span className="text-[12px] opacity-70" style={display}>Cost</span>
        {COSTS.map((c) => (
          <button key={c} type="button" className={PILL} style={{ ...display, ...active((filter.costs ?? []).includes(c), "#ffd6a5") }}
            onClick={() => set({ costs: toggle(filter.costs, c) })}>{COST_META[c]}</button>
        ))}

        <span className="mx-1 h-[22px] w-px bg-[#20140d22]" />
        <span className="text-[12px] opacity-70" style={display}>Type</span>
        {CATEGORIES.map((c) => (
          <button key={c} type="button" className={PILL}
            style={{ ...display, ...active((filter.categories ?? []).includes(c), CATEGORY_META[c].color), color: (filter.categories ?? []).includes(c) ? "#fff" : "#20140d" }}
            onClick={() => set({ categories: toggle(filter.categories, c) })}>{CATEGORY_META[c].label}</button>
        ))}

        <span className="mx-1 h-[22px] w-px bg-[#20140d22]" />
        {(["dropoff", "family"] as Participation[]).map((p) => (
          <button key={p} type="button" className={PILL} style={{ ...display, ...active((filter.participation ?? []).includes(p), "#a0c4ff") }}
            onClick={() => set({ participation: toggle(filter.participation, p) })}>{p === "dropoff" ? "🎒 Drop-off" : "👪 Family"}</button>
        ))}
        <button type="button" className={PILL} style={{ ...display, ...active(Boolean(filter.spanishOnly), "#ffca3a") }}
          onClick={() => set({ spanishOnly: !filter.spanishOnly })}>🗣 Spanish</button>

        <span className="mx-1 h-[22px] w-px bg-[#20140d22]" />
        <select
          value={(filter.countries ?? [])[0] ?? ""}
          onChange={(e) => set({ countries: e.target.value ? [e.target.value] : [] })}
          className="rounded-full border-2 border-[#20140d] bg-white px-[12px] py-[5px] text-[12.5px]" style={display}>
          <option value="">All countries</option>
          {countries.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify it type-checks**

Run: `npx tsc --noEmit`
Expected: no errors referencing `FilterBar.tsx`.

- [ ] **Step 3: Commit**

```bash
git add components/directory/FilterBar.tsx
git commit -m "feat: FilterBar — months/cost/type/participation/spanish/country/search"
```

---

## Task 10: `HubModal` component

**Files:**
- Create: `components/directory/HubModal.tsx`

- [ ] **Step 1: Write the component**

```tsx
// components/directory/HubModal.tsx
"use client";

import { CATEGORY_META, COST_META, type DirectoryHub } from "@/lib/directory";

export default function HubModal({ hub, onClose }: { hub: DirectoryHub; onClose: () => void }) {
  const meta = CATEGORY_META[hub.category];
  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-[#20140d99] p-4" onClick={onClose}>
      <div
        className="max-h-[88vh] w-full max-w-[560px] overflow-y-auto rounded-[22px] border-[2.5px] border-[#20140d] bg-[#fffaf3] shadow-[8px_10px_0_#20140d]"
        style={{ fontFamily: "var(--font-body)", color: "#20140d" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative h-[180px] w-full overflow-hidden rounded-t-[19px]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={hub.image} alt={hub.name} className="h-full w-full object-cover" style={!hub.image ? { background: meta.color } : undefined} />
          <button type="button" onClick={onClose}
            className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full border-2 border-[#20140d] bg-white text-[16px]">✕</button>
          <span className="absolute bottom-3 left-3 -rotate-2 rounded-[9px] border-2 border-[#20140d] px-[10px] py-[3px] text-[12px] font-semibold"
            style={{ background: meta.color, color: "#fff", fontFamily: "var(--font-display)" }}>{meta.emoji} {meta.label}</span>
        </div>

        <div className="p-5">
          <h2 className="text-[24px] leading-tight" style={{ fontFamily: "var(--font-display)", fontWeight: 800 }}>{hub.name}</h2>
          {hub.host && <p className="mt-1 text-[14px] font-semibold text-[#6b4e3d]">Hosted by {hub.host}</p>}

          <div className="mt-3 flex flex-wrap gap-2">
            {[hub.region, hub.country].filter(Boolean).join(", ") && <Tag>{[hub.region, hub.country].filter(Boolean).join(", ")}</Tag>}
            {hub.season && <Tag>{hub.season}</Tag>}
            <Tag>{COST_META[hub.costBucket]}{hub.price ? ` · ${hub.price}` : ""}</Tag>
            {hub.participation && <Tag>{hub.participation === "dropoff" ? "🎒 Drop-off" : "👪 Family"}</Tag>}
            {hub.nationality && <Tag>{hub.nationality}</Tag>}
          </div>

          {hub.summary && <p className="mt-4 text-[15px] leading-relaxed">{hub.summary}</p>}

          <div className="mt-4 flex flex-wrap gap-3">
            {hub.website && <Link href={hub.website.startsWith("http") ? hub.website : `https://${hub.website}`}>Website ↗</Link>}
            {hub.facebook && <Link href={hub.facebook.startsWith("http") ? hub.facebook : `https://${hub.facebook}`}>Facebook ↗</Link>}
          </div>

          {hub.references.length > 0 && (
            <div className="mt-5 border-t-2 border-[#20140d22] pt-3">
              <h3 className="mb-2 text-[13px] uppercase tracking-wide opacity-70" style={{ fontFamily: "var(--font-display)", fontWeight: 700 }}>References</h3>
              <ul className="space-y-1 text-[13px]">
                {hub.references.map(([label, url], i) => (
                  <li key={i}>
                    <a href={url} target="_blank" rel="noopener noreferrer" className="text-[#1d6fa5] underline">{label}</a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return <span className="rounded-[8px] border-2 border-[#20140d] bg-white px-[9px] py-[2px] text-[12px] font-semibold" style={{ fontFamily: "var(--font-display)" }}>{children}</span>;
}

function Link({ href, children }: { href: string; children: React.ReactNode }) {
  return <a href={href} target="_blank" rel="noopener noreferrer" className="rounded-full border-2 border-[#20140d] bg-[#caffbf] px-[14px] py-[5px] text-[13px] font-semibold" style={{ fontFamily: "var(--font-display)" }}>{children}</a>;
}
```

- [ ] **Step 2: Verify it type-checks**

Run: `npx tsc --noEmit`
Expected: no errors referencing `HubModal.tsx`.

- [ ] **Step 3: Commit**

```bash
git add components/directory/HubModal.tsx
git commit -m "feat: HubModal — detail with summary + references"
```

---

## Task 11: `DirectoryExplorer` + wire the home page

**Files:**
- Create: `components/directory/DirectoryExplorer.tsx`
- Modify: `app/page.tsx`

- [ ] **Step 1: Write the explorer (composition + state)**

```tsx
// components/directory/DirectoryExplorer.tsx
"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { filterDirectory, uniqueDirectoryCountries, type DirectoryFilter, type DirectoryHub } from "@/lib/directory";
import HubCard from "./HubCard";
import FilterBar from "./FilterBar";
import HubModal from "./HubModal";

const DirectoryMap = dynamic(() => import("./DirectoryMap"), {
  ssr: false,
  loading: () => <div className="absolute inset-0 flex items-center justify-center bg-[#bfe3c6] text-sm text-[#20140d]">Loading map…</div>,
});

export default function DirectoryExplorer({ hubs }: { hubs: DirectoryHub[] }) {
  const [filter, setFilter] = useState<DirectoryFilter>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const countries = useMemo(() => uniqueDirectoryCountries(hubs), [hubs]);
  const filtered = useMemo(() => filterDirectory(hubs, filter), [hubs, filter]);
  const selected = useMemo(() => hubs.find((h) => h.id === selectedId) ?? null, [hubs, selectedId]);
  const offMap = filtered.filter((h) => h.coords === null).length;

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#fff4e6]">
      <FilterBar filter={filter} onChange={setFilter} countries={countries} resultCount={filtered.length} onReset={() => setFilter({})} />

      <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[1.35fr_1fr]">
        <div className="min-h-0 overflow-y-auto p-4">
          {filtered.length === 0 ? (
            <p className="mt-10 text-center text-sm text-[#6b4e3d]">No hubs match these filters.</p>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {filtered.map((hub) => <HubCard key={hub.id} hub={hub} onOpen={setSelectedId} />)}
              </div>
              {offMap > 0 && (
                <p className="mt-4 text-center text-[12px] text-[#6b4e3d]">+{offMap} hub{offMap > 1 ? "s" : ""} without a fixed location (not shown on map)</p>
              )}
            </>
          )}
        </div>

        <div className="relative hidden min-h-0 border-l-[2.5px] border-[#20140d] md:block">
          <DirectoryMap hubs={filtered} selectedId={selectedId} onSelect={setSelectedId} />
        </div>
      </div>

      {selected && <HubModal hub={selected} onClose={() => setSelectedId(null)} />}
    </div>
  );
}
```

- [ ] **Step 2: Wire the home page to load `public/directory.json`**

Replace `app/page.tsx` with:

```tsx
import { readFileSync } from "node:fs";
import { join } from "node:path";
import DirectoryExplorer from "@/components/directory/DirectoryExplorer";
import type { DirectoryHub } from "@/lib/directory";

function getDirectory(): DirectoryHub[] {
  const path = join(process.cwd(), "public", "directory.json");
  return JSON.parse(readFileSync(path, "utf8")) as DirectoryHub[];
}

export default function Home() {
  const hubs = getDirectory();
  return (
    <div className="h-screen">
      <DirectoryExplorer hubs={hubs} />
    </div>
  );
}
```

- [ ] **Step 3: Run the app and verify the split view renders**

Run: `npm run dev`, open `http://localhost:3000`.
Expected: filter bar on top, card grid on the left, map with pins on the right. Toggling a month/type pill updates the count and both panes. Clicking a card opens the modal with references.

- [ ] **Step 4: Commit**

```bash
git add components/directory/DirectoryExplorer.tsx app/page.tsx
git commit -m "feat: DirectoryExplorer split view as home page"
```

---

## Task 12: Move the existing 46-hub map to `/map`

**Files:**
- Create: `app/map/page.tsx`

- [ ] **Step 1: Create the `/map` route reusing the existing explorer**

```tsx
// app/map/page.tsx
import { getAllHubs } from "@/lib/hubs";
import HubExplorer from "@/components/HubExplorer";

export default function MapPage() {
  const hubs = getAllHubs();
  return (
    <div className="flex h-screen flex-col">
      <header className="flex shrink-0 items-baseline justify-between gap-4 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
        <div className="flex items-baseline gap-3">
          <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Worldschooling Hubs — Curated Map</h1>
          <a href="/" className="text-sm text-zinc-500 underline">← Back to the directory</a>
        </div>
        <span className="text-xs text-zinc-400">{hubs.length} hubs</span>
      </header>
      <div className="min-h-0 flex-1">
        <HubExplorer hubs={hubs} />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify both routes work**

Run: `npm run dev`; open `/` (directory) and `/map` (old curated map). Both render; the `/map` header links back to `/`.

- [ ] **Step 3: Commit**

```bash
git add app/map/page.tsx
git commit -m "feat: keep curated 46-hub map at /map"
```

---

## Task 13: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: all suites pass (`season`, `cost`, `directory`, `hub`).

- [ ] **Step 2: Type-check and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors.

- [ ] **Step 3: Production build**

Run: `npm run build`
Expected: build completes; `/` and `/map` both compile.

- [ ] **Step 4: Manual smoke (use the `verify` or `run` skill)**

Load `/`, confirm:
- Month + cost + type + participation + Spanish + country + search all filter the grid AND the map together.
- Selecting only "Free" hides "Not listed" entries; clearing cost shows them again.
- A card click opens the modal with summary + working reference links.
- The "+N without a fixed location" note appears when filters include unplaceable hubs.

- [ ] **Step 5: Commit any final fixes**

```bash
git add -A
git commit -m "chore: final verification fixes for directory explorer"
```

---

## Self-review notes (already reconciled)

- **Spec coverage:** enrichment/months/cost/coords/images → Tasks 1,2,5,4; filter facets → Tasks 3,9; split layout + map + modal → Tasks 7–11; old map kept → Task 12; testing → Tasks 1–3 + 13.
- **Deviation from spec:** enrichment is TypeScript-only (DRY) rather than Python — noted in the header.
- **Type consistency:** `DirectoryHub`/`DirectoryFilter`/`CostBucket`/`HubCategory`/`Participation` defined once in `lib/directory.ts` (Task 3) and imported by `lib/cost.ts`, the build script, and every component. `CATEGORY_META`/`COST_META` are the single source for labels/colours.
- **Cost-filter semantics:** "Not listed" is a first-class bucket; with no cost filter active, unlisted entries show — satisfying "keep unlisted" while still giving the user explicit control.
