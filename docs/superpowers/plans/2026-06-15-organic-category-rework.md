# Organic Category Rework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Curate the directory's `organic` category — keep the genuine towns, add 10 mention-mined towns (each carrying clickable blog-mention evidence in the hub modal), move all Bliss listings to `permanent_community` ("Community"), and fix the Hakuba / Naturally-Richer / FB-group mislabels.

**Architecture:** Data-driven via the existing build pipeline. Recategorizations/hides go through `data/research/overrides.json` (id-keyed, applied at `build_directory.py`); the 10 new towns are appended to `approved-candidates.csv` with precise coords seeded into `geocoded-coords.json`; a new emit script writes those plus an id→placeId map; `build-explorer-data.ts` attaches each mined hub's blog mentions by placeId; `HubModal.tsx` renders them. Pure helpers are unit-tested; the data edits are verified by a post-rebuild assertion.

**Tech Stack:** TypeScript + tsx (scripts), Vitest, the Python `build_directory.py` + `make.sh` build, Next.js/React (HubModal).

**Spec:** `docs/superpowers/specs/2026-06-15-organic-category-rework-design.md`

---

## File Structure

- Modify: `lib/intake/mentions.ts` — add `HubMention` type + `selectHubMentions()` pure helper.
- Modify: `lib/directory.ts` — add `mentions?: HubMention[]` to `DirectoryHub` (import the type).
- Modify: `test/intake-mentions.test.ts` — tests for `selectHubMentions`.
- Create: `scripts/mentions-to-directory.ts` — emit the 10 new-town CSV rows + coords + id→placeId map. npm: `mentions:to-directory`.
- Modify: `data/research/approved-candidates.csv` — +10 organic rows (written by the script).
- Modify: `data/research/geocoded-coords.json` — +10 precise coords (written by the script).
- Create: `data/research/mentions/new-organic-map.json` — `{ hubId: placeId }` (written by the script).
- Modify: `data/research/overrides.json` — recategorizations/hides + FB fold (hand-edited data).
- Modify: `scripts/build-explorer-data.ts` — attach `mentions` by placeId at build time.
- Modify: `components/directory/HubModal.tsx` — "Mentioned on these blogs" section.

Reused: `ScoredSource`/`SourceKind` types + `organic-places-scored.json` from the merged mining pipeline; the enrichment-by-id attach pattern already in `build-explorer-data.ts`.

---

## Task 1: `HubMention` type + `selectHubMentions()` helper (TDD)

**Files:**
- Modify: `lib/intake/mentions.ts`
- Modify: `lib/directory.ts`
- Test: `test/intake-mentions.test.ts`

- [ ] **Step 1: Write the failing test** (append to `test/intake-mentions.test.ts`)

```ts
import { selectHubMentions, type ScoredSource } from "../lib/intake/mentions";

const SRC = (over: Partial<ScoredSource>): ScoredSource => ({
  domain: "x.com", kind: "personal-blog", url: "https://x.com/p", snippet: "s", date: "2025-01", ...over,
});

describe("selectHubMentions", () => {
  it("orders blog/press/forum before directory/hub-site and maps to {domain,url,snippet,date}", () => {
    const out = selectHubMentions([
      SRC({ domain: "dir.com", kind: "directory" }),
      SRC({ domain: "blog.com", kind: "personal-blog" }),
      SRC({ domain: "press.com", kind: "press" }),
    ]);
    expect(out.map((m) => m.domain)).toEqual(["blog.com", "press.com", "dir.com"]);
    expect(out[0]).toEqual({ domain: "blog.com", url: "https://x.com/p", snippet: "s", date: "2025-01" });
  });
  it("caps the list", () => {
    const many = Array.from({ length: 20 }, (_, i) => SRC({ domain: `d${i}.com` }));
    expect(selectHubMentions(many, 12)).toHaveLength(12);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run test/intake-mentions.test.ts`
Expected: FAIL — `selectHubMentions` is not exported.

- [ ] **Step 3: Implement** (append to `lib/intake/mentions.ts`, below the existing exports)

```ts
/** One blog/press mention surfaced on a directory hub card (attached by placeId at build time). */
export interface HubMention { domain: string; url: string; snippet: string; date: string }

const MENTION_KIND_RANK: Record<SourceKind, number> = {
  "personal-blog": 0, press: 1, forum: 2, directory: 3, "hub-site": 4,
};

/** Pick a hub's display mentions from its scored sources: independent (blog/press/forum)
 *  first, then directories/hub-sites; capped. */
export function selectHubMentions(sources: ScoredSource[], cap = 12): HubMention[] {
  return [...sources]
    .sort((a, b) => MENTION_KIND_RANK[a.kind] - MENTION_KIND_RANK[b.kind])
    .slice(0, cap)
    .map((s) => ({ domain: s.domain, url: s.url, snippet: s.snippet, date: s.date }));
}
```

- [ ] **Step 4: Add `mentions?` to `DirectoryHub`** in `lib/directory.ts`

At the top of `lib/directory.ts`, add the import (near the other imports):

```ts
import type { HubMention } from "./intake/mentions";
```

Then in `interface DirectoryHub` (currently ends at line ~123 with `enrichment?`), add one field after `enrichment?`:

```ts
  enrichment?: HubEnrichment; // deep-research overlay, attached by id at build time
  mentions?: HubMention[];    // blog/press mentions, attached by placeId at build time (mined organic hubs)
```

- [ ] **Step 5: Run to verify it passes + typecheck**

Run: `npx vitest run test/intake-mentions.test.ts`
Expected: PASS.
Run: `npx tsc --noEmit 2>&1 | grep -E "directory.ts|mentions.ts" || echo "no new type errors"`
Expected: `no new type errors`.

- [ ] **Step 6: Commit**

```bash
git add lib/intake/mentions.ts lib/directory.ts test/intake-mentions.test.ts
git commit -m "feat(directory): HubMention type + selectHubMentions helper"
```

---

## Task 2: Emit script for the 10 new organic towns (TDD pure helper + run)

**Files:**
- Create: `scripts/mentions-to-directory.ts`
- Test: `test/mentions-to-directory.test.ts`
- Modify (by running): `data/research/approved-candidates.csv`, `data/research/geocoded-coords.json`, `data/research/mentions/new-organic-map.json`
- Modify: `package.json`

The 10 towns, with collision-safe ids/names (verified free against current directory ids;
`antigua` collides so it is country-qualified). `canonical`/`country` are the lookup keys into
`organic-places-scored.json`:

| canonical | country | newName | newId (=slug of newName) | region |
|---|---|---|---|---|
| Bali | Indonesia | Bali | bali | Bali |
| Oaxaca | Mexico | Oaxaca | oaxaca | Oaxaca |
| San Miguel de Allende | Mexico | San Miguel de Allende | san-miguel-de-allende | San Miguel de Allende |
| Luxor | Egypt | Luxor | luxor | Luxor |
| Cusco | Peru | Cusco | cusco | Cusco |
| Krabi | Thailand | Krabi | krabi | Krabi |
| La Barra | Uruguay | La Barra | la-barra | La Barra |
| La Herradura | Spain | La Herradura | la-herradura | La Herradura |
| Antigua | Guatemala | Antigua, Guatemala | antigua-guatemala | Antigua |
| Playa del Carmen | Mexico | Playa del Carmen | playa-del-carmen | Playa del Carmen |

- [ ] **Step 1: Write the failing test** (`test/mentions-to-directory.test.ts`)

```ts
import { describe, it, expect } from "vitest";
import { buildNewOrganic, type SeedTown } from "../scripts/mentions-to-directory";
import type { ScoredPlace } from "../lib/intake/mentions";

const SEED: SeedTown = { canonical: "Luxor", country: "Egypt", newName: "Luxor", newId: "luxor", region: "Luxor" };
const PLACE = (over: Partial<ScoredPlace>): ScoredPlace => ({
  placeId: "luxor--eg", canonicalName: "Luxor", country: "Egypt", coords: [25.7, 32.6],
  score: 2.69, tier: "established", independentDomains: 7, matchedExistingHubIds: [], sources: [], ...over,
});

describe("buildNewOrganic", () => {
  it("produces a CSV row, a coord entry, and an id→placeId map entry", () => {
    const r = buildNewOrganic([SEED], [PLACE({})], new Set<string>());
    expect(r.collisions).toEqual([]);
    expect(r.rows[0]).toMatchObject({
      name: "Luxor", type: "organic", country: "Egypt", region_city: "Luxor",
      source_directory: "mention-mining", confidence: "mention-mining", dedup_status: "NEW",
    });
    expect(r.coords["luxor"]).toEqual([25.7, 32.6]);
    expect(r.idToPlaceId["luxor"]).toBe("luxor--eg");
  });
  it("flags an id that collides with an existing directory id", () => {
    const r = buildNewOrganic([SEED], [PLACE({})], new Set(["luxor"]));
    expect(r.collisions).toEqual(["luxor"]);
  });
  it("flags a seed whose place is missing from the scored data", () => {
    const r = buildNewOrganic([{ ...SEED, canonical: "Nowhere" }], [PLACE({})], new Set());
    expect(r.missing).toEqual(["Nowhere"]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run test/mentions-to-directory.test.ts`
Expected: FAIL — cannot import from `scripts/mentions-to-directory`.

- [ ] **Step 3: Implement the script**

```ts
// scripts/mentions-to-directory.ts
/**
 * Emit the new-organic-town build inputs from the mention-mining results:
 *  - rows appended to data/research/approved-candidates.csv (type=organic)
 *  - precise coords merged into data/research/geocoded-coords.json
 *  - an id→placeId map at data/research/mentions/new-organic-map.json (consumed by build-explorer)
 *
 * Re-runnable: rows/coords/map for these ids are replaced, not duplicated.
 * Usage: npm run mentions:to-directory
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { CSV_COLUMNS, type CsvRow } from "../lib/intake/inbox";
import type { ScoredPlace, ScoredFile } from "../lib/intake/mentions";

export interface SeedTown { canonical: string; country: string; newName: string; newId: string; region: string }

export const SEED_TOWNS: SeedTown[] = [
  { canonical: "Bali", country: "Indonesia", newName: "Bali", newId: "bali", region: "Bali" },
  { canonical: "Oaxaca", country: "Mexico", newName: "Oaxaca", newId: "oaxaca", region: "Oaxaca" },
  { canonical: "San Miguel de Allende", country: "Mexico", newName: "San Miguel de Allende", newId: "san-miguel-de-allende", region: "San Miguel de Allende" },
  { canonical: "Luxor", country: "Egypt", newName: "Luxor", newId: "luxor", region: "Luxor" },
  { canonical: "Cusco", country: "Peru", newName: "Cusco", newId: "cusco", region: "Cusco" },
  { canonical: "Krabi", country: "Thailand", newName: "Krabi", newId: "krabi", region: "Krabi" },
  { canonical: "La Barra", country: "Uruguay", newName: "La Barra", newId: "la-barra", region: "La Barra" },
  { canonical: "La Herradura", country: "Spain", newName: "La Herradura", newId: "la-herradura", region: "La Herradura" },
  { canonical: "Antigua", country: "Guatemala", newName: "Antigua, Guatemala", newId: "antigua-guatemala", region: "Antigua" },
  { canonical: "Playa del Carmen", country: "Mexico", newName: "Playa del Carmen", newId: "playa-del-carmen", region: "Playa del Carmen" },
];

export interface BuildResult {
  rows: CsvRow[];
  coords: Record<string, [number, number]>;
  idToPlaceId: Record<string, string>;
  collisions: string[];   // newIds that clash with an existing directory id
  missing: string[];      // seed canonicals not found in the scored data
}

export function buildNewOrganic(seeds: SeedTown[], places: ScoredPlace[], existingIds: Set<string>): BuildResult {
  const rows: CsvRow[] = [];
  const coords: Record<string, [number, number]> = {};
  const idToPlaceId: Record<string, string> = {};
  const collisions: string[] = [];
  const missing: string[] = [];
  for (const s of seeds) {
    if (existingIds.has(s.newId)) collisions.push(s.newId);
    const place = places.find((p) => p.canonicalName === s.canonical && p.country === s.country)
      ?? places.find((p) => p.canonicalName === s.canonical);
    if (!place) { missing.push(s.canonical); continue; }
    rows.push({
      name: s.newName, type: "organic", country: s.country, region_city: s.region,
      season_dates: "", ages: "", price: "", website: "", facebook_instagram: "", host: "",
      source_directory: "mention-mining", confidence: "mention-mining", dedup_status: "NEW",
      notes: `Organic place surfaced by mention-mining (${place.independentDomains} independent sources)`,
    });
    if (place.coords) coords[s.newId] = place.coords;
    idToPlaceId[s.newId] = place.placeId;
  }
  return { rows, coords, idToPlaceId, collisions, missing };
}

function toCsvLine(row: CsvRow): string {
  return CSV_COLUMNS.map((c) => {
    const v = row[c] ?? "";
    return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
  }).join(",");
}

function main() {
  const ROOT = process.cwd();
  const RESEARCH = join(ROOT, "data", "research");
  const SCORED = join(RESEARCH, "mentions", "organic-places-scored.json");
  const CSV = join(RESEARCH, "approved-candidates.csv");
  const GEO = join(RESEARCH, "geocoded-coords.json");
  const MAP = join(RESEARCH, "mentions", "new-organic-map.json");
  const DIRJSON = join(ROOT, "public", "directory.json");

  const places = (JSON.parse(readFileSync(SCORED, "utf8")) as ScoredFile).places;
  const existingIds = new Set((JSON.parse(readFileSync(DIRJSON, "utf8")) as { id: string }[]).map((h) => h.id));
  const r = buildNewOrganic(SEED_TOWNS, places, existingIds);
  if (r.collisions.length) { console.error(`ID COLLISION with existing directory ids: ${r.collisions.join(", ")} — pick distinct newIds.`); process.exit(1); }
  if (r.missing.length) { console.error(`MISSING from scored data: ${r.missing.join(", ")}`); process.exit(1); }

  // append/replace CSV rows for our ids (idempotent by name)
  const newNames = new Set(SEED_TOWNS.map((s) => s.newName));
  const lines = readFileSync(CSV, "utf8").split("\n");
  const header = lines[0];
  const kept = lines.slice(1).filter((l) => l.trim() && !newNames.has(l.split(",")[0].replace(/^"|"$/g, "")));
  const out = [header, ...kept, ...r.rows.map(toCsvLine)].join("\n") + "\n";
  writeFileSync(CSV, out);

  const geo: Record<string, [number, number] | null> = existsSync(GEO) ? JSON.parse(readFileSync(GEO, "utf8")) : {};
  Object.assign(geo, r.coords);
  writeFileSync(GEO, JSON.stringify(geo, null, 2) + "\n");

  writeFileSync(MAP, JSON.stringify(r.idToPlaceId, null, 2) + "\n");
  console.log(`emitted ${r.rows.length} organic rows, ${Object.keys(r.coords).length} coords, ${Object.keys(r.idToPlaceId).length} map entries.`);
}

if (process.argv[1] && process.argv[1].endsWith("mentions-to-directory.ts")) main();
```

- [ ] **Step 4: Run to verify the test passes**

Run: `npx vitest run test/mentions-to-directory.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Add the npm script** — in `package.json` `"scripts"`:

```json
"mentions:to-directory": "tsx scripts/mentions-to-directory.ts",
```

- [ ] **Step 6: Run the emit + verify outputs**

Run: `npm run mentions:to-directory`
Expected: `emitted 10 organic rows, 10 coords, 10 map entries.`
Run: `node -e 'const m=require("./data/research/mentions/new-organic-map.json"); console.log(Object.keys(m).length, m["luxor"], m["antigua-guatemala"])'`
Expected: `10 luxor--eg antigua--gt`
Run: `tail -10 data/research/approved-candidates.csv | cut -d, -f1,2`
Expected: the 10 new town names, each with `organic`.

- [ ] **Step 7: Commit**

```bash
git add scripts/mentions-to-directory.ts test/mentions-to-directory.test.ts package.json \
        data/research/approved-candidates.csv data/research/geocoded-coords.json data/research/mentions/new-organic-map.json
git commit -m "feat(mentions): emit 10 new organic towns + coords + placeId map"
```

---

## Task 3: Recategorizations & hides in `overrides.json`

**Files:**
- Modify: `data/research/overrides.json`

This is a hand-edit of a JSON data file. For each id below, **merge** the `category` (and, for the two towns, `facebook`) into its existing object if present, else add a new object. Do NOT remove other keys already on those objects.

- [ ] **Step 1: Apply these id→category changes**

Bliss canonical entries → `permanent_community`:
- `bali-bliss-hub`, `koh-lanta-bliss-hub-thailand`, `pai-bliss-hub-thailand`, `siem-reap-bliss-hub-cambodia`, `bliss-hubs-kuala-lumpur`, `bliss-hubs-krabi` → `"category": "permanent_community"`

Redundant Bliss organic duplicates → hidden `junk`:
- `bliss-hubs-bali`, `bliss-hubs-koh-lanta`, `bliss-hubs-pai`, `bliss-hubs-siem-reap` → `"category": "junk"`

Other paid mislabels → `permanent_commercial`:
- `hakuba-international-term-year` → `"category": "permanent_commercial"`
- `algarve-worldschooling-hub-naturally-riche` → change its existing `"category": "organic"` to `"category": "permanent_commercial"`

FB-group entries → hidden, and fold their group link onto the town:
- `worldschoolers-in-kuala-lumpur` → `"category": "junk"`
- `worldschoolers-of-hoi-an` → `"category": "junk"`
- `kuala-lumpur` → add `"facebook": "https://www.facebook.com/groups/worldschoolersinmalaysia/"`
- `hoi-an-an-bang` → add `"facebook": "https://www.facebook.com/groups/1137478175223942"`

Example of a merge (the `bali-bliss-hub` object already exists — add the one key):

```json
  "bali-bliss-hub": {
    "category": "permanent_community"
  },
```

(If the object already has other keys, keep them and just add/replace `category`.)

- [ ] **Step 2: Validate JSON + spot-check the edits**

Run: `node -e 'const o=require("./data/research/overrides.json"); const want={"bali-bliss-hub":"permanent_community","bliss-hubs-bali":"junk","bliss-hubs-kuala-lumpur":"permanent_community","hakuba-international-term-year":"permanent_commercial","algarve-worldschooling-hub-naturally-riche":"permanent_commercial","worldschoolers-of-hoi-an":"junk"}; for(const[k,v]of Object.entries(want)) console.log(o[k]&&o[k].category===v?"OK":"WRONG", k, o[k]&&o[k].category); console.log("KL fb:", o["kuala-lumpur"].facebook); console.log("HoiAn fb:", o["hoi-an-an-bang"].facebook)'`
Expected: all `OK`, and both `fb:` lines print the group URLs.

- [ ] **Step 3: Commit**

```bash
git add data/research/overrides.json
git commit -m "data(directory): Bliss→Community, fix Hakuba/Naturally-Richer/FB-group categories"
```

---

## Task 4: Attach blog mentions in `build-explorer-data.ts`

**Files:**
- Modify: `scripts/build-explorer-data.ts`

- [ ] **Step 1: Add imports + load the map and scored data**

Near the existing constants in `scripts/build-explorer-data.ts` (where `ENRICH`/`RESEARCH` are defined), add:

```ts
import { selectHubMentions, type HubMention, type ScoredFile } from "../lib/intake/mentions";
const NEW_ORGANIC_MAP = join(RESEARCH, "mentions", "new-organic-map.json");
const SCORED = join(RESEARCH, "mentions", "organic-places-scored.json");
```

Inside `main()`, after the `enrichment` is loaded (around line 46), add:

```ts
  const idToPlaceId: Record<string, string> = existsSync(NEW_ORGANIC_MAP)
    ? JSON.parse(readFileSync(NEW_ORGANIC_MAP, "utf8")) : {};
  const scoredByPlace = new Map<string, ScoredFile["places"][number]>();
  if (existsSync(SCORED)) {
    for (const p of (JSON.parse(readFileSync(SCORED, "utf8")) as ScoredFile).places) scoredByPlace.set(p.placeId, p);
  }
```

- [ ] **Step 2: Compute mentions per hub + include in the output object**

Inside the `raw.map((e) => { ... })` callback, after `const enrich = enrichment[id];` (line ~71), add:

```ts
    const placeId = idToPlaceId[id];
    const place = placeId ? scoredByPlace.get(placeId) : undefined;
    const mentions: HubMention[] = place ? selectHubMentions(place.sources) : [];
```

Then in the returned object, after the `...(enrich ? { enrichment: enrich } : {}),` line (line ~127), add:

```ts
      ...(mentions.length ? { mentions } : {}),
```

- [ ] **Step 3: Build runs without error**

Run: `npm run build:explorer`
Expected: it logs `Wrote N hubs to public/directory.json` without error.

Note: `build:explorer` reads the consolidated source, which does NOT yet contain the new towns (they're added by `build_directory.py` in Task 5). So mention attachment can't be observed until Task 5's full rebuild — Task 5's assertion checks `new towns with mentions (want 10)`. The mention-selection logic itself is already covered by the `selectHubMentions` unit test (Task 1); this step only confirms the wiring compiles and the build still succeeds.

- [ ] **Step 4: Commit**

```bash
git add scripts/build-explorer-data.ts
git commit -m "feat(build): attach blog mentions to mined organic hubs by placeId"
```

---

## Task 5: Full rebuild + reconciliation assertions

**Files:**
- Modify (regenerated): `data/research/directory-consolidated-2026-06-09.json`, `public/directory.json`, `public/directory-images/`, the dated HTML report.

- [ ] **Step 1: Rebuild the directory from inputs**

Run: `cd data/research && ./make.sh --no-fetch && cd ../.. && npm run build:explorer`
Expected: completes; `make.sh` prints a `by category:` line, `build:explorer` prints the hub count.

- [ ] **Step 2: Assert the reconciliation** (single node check)

Run:
```bash
node -e '
const d=require("./public/directory.json");
const byId=Object.fromEntries(d.map(h=>[h.id,h]));
const organic=d.filter(h=>h.category==="organic");
const newIds=["bali","oaxaca","san-miguel-de-allende","luxor","cusco","krabi","la-barra","la-herradura","antigua-guatemala","playa-del-carmen"];
const blissOrganic=organic.filter(h=>/bliss/i.test(h.id));
const newPresent=newIds.filter(id=>byId[id]&&byId[id].category==="organic");
const newWithCoords=newIds.filter(id=>byId[id]&&byId[id].coords);
const newWithMentions=newIds.filter(id=>byId[id]&&(byId[id].mentions||[]).length>0);
const blissCommunity=d.filter(h=>/bliss/i.test(h.id)&&h.category==="permanent_community").length;
console.log("organic count:", organic.length);
console.log("Bliss still in organic (want 0):", blissOrganic.map(h=>h.id));
console.log("Hakuba category (want permanent_commercial):", byId["hakuba-international-term-year"].category);
console.log("Naturally-Richer Algarve category (want permanent_commercial):", byId["algarve-worldschooling-hub-naturally-riche"].category);
console.log("new towns present as organic (want 10):", newPresent.length, newPresent);
console.log("new towns with coords (want 10):", newWithCoords.length);
console.log("new towns with mentions (want 10):", newWithMentions.length);
console.log("Bliss as permanent_community (want ~6):", blissCommunity);
console.log("FB groups hidden (want junk):", byId["worldschoolers-of-hoi-an"].category, byId["worldschoolers-in-kuala-lumpur"].category);
'
```
Expected: `Bliss still in organic` is `[]`; Hakuba + Naturally-Richer are `permanent_commercial`; new towns present = 10 (all 10 ids); coords = 10; mentions = 10; Bliss community ≈ 6; both FB groups `junk`.

**If "new towns present" < 10:** a town was dropped by `build_directory.py` name-dedup. Identify which (compare `newPresent` to `newIds`), give that town a more distinct `newName`/`newId` in `SEED_TOWNS` (Task 2, e.g. "Oaxaca" → "Oaxaca City"/`oaxaca-city`, "Bali" → "Bali (Ubud/Canggu)"/`bali-ubud-canggu`), re-run `npm run mentions:to-directory`, and redo Step 1–2.

- [ ] **Step 3: Run the test suite (nothing regressed)**

Run: `npm test`
Expected: all suites pass (includes the two new test files).

- [ ] **Step 4: Commit the rebuilt artifacts**

```bash
git add data/research/directory-consolidated-2026-06-09.json public/directory.json public/directory-images data/research/*.html
git commit -m "data(directory): rebuild — curated organic category (+10 mined towns, Bliss→Community)"
```

---

## Task 6: "Mentioned on these blogs" section in the hub modal

**Files:**
- Modify: `components/directory/HubModal.tsx`

- [ ] **Step 1: Add the section after the References block**

In `components/directory/HubModal.tsx`, immediately after the existing References block (the `{hub.references.length > 0 && ( ... )}` block that ends near line 92), add:

```tsx
          {hub.mentions && hub.mentions.length > 0 && (
            <div className="mt-5 border-t border-line pt-3">
              <h3 className={SECTION_TITLE}>Mentioned on these blogs</h3>
              <ul className="space-y-2 text-[13px]">
                {hub.mentions.map((m, i) => (
                  <li key={i}>
                    <a href={m.url} target="_blank" rel="noopener noreferrer" className="text-accent underline">{m.domain}</a>
                    {m.date && m.date !== "unknown" && <span className="ml-2 opacity-50">{m.date}</span>}
                    {m.snippet && <p className="mt-0.5 leading-snug opacity-80">“{m.snippet}”</p>}
                  </li>
                ))}
              </ul>
            </div>
          )}
```

- [ ] **Step 2: Lint + typecheck the component**

Run: `npx eslint components/directory/HubModal.tsx`
Expected: no errors.
Run: `npx tsc --noEmit 2>&1 | grep HubModal || echo "no HubModal type errors"`
Expected: `no HubModal type errors`.

- [ ] **Step 3: Commit**

```bash
git add components/directory/HubModal.tsx
git commit -m "feat(ui): show blog mentions in the hub modal"
```

---

## Task 7: Visual verification + final check

**Files:** none (verification only)

- [ ] **Step 1: Full suite + lint**

Run: `npm test`
Expected: all pass.
Run: `npm run lint 2>&1 | tail -5`
Expected: no NEW errors in the files this plan touched (the pre-existing `components/HubMap.tsx` refs-during-render error is out of scope).

- [ ] **Step 2: Run the app and verify visually** (use the project's run skill / `npm run dev`)

- Open the explorer, filter to **Organic** — confirm the 10 new towns appear (Oaxaca, Luxor, San Miguel de Allende, Cusco, Bali, Krabi, La Barra, La Herradura, Antigua, Playa del Carmen) and **no Bliss** hubs are in Organic.
- Open the **Oaxaca** (or Luxor) modal — confirm a **"Mentioned on these blogs"** section lists clickable blog domains with snippets, and that each link opens the source post.
- Filter to **Community** — confirm the Bliss hubs appear there (≈6, deduped).

- [ ] **Step 3: Final commit if anything is uncommitted**

```bash
git add -A && git commit -m "chore(directory): organic rework complete" || echo "nothing to commit"
```

---

## Notes for the implementer

- **Order matters:** Task 2 (emit) must precede Task 5 (rebuild) so the CSV rows + coords exist; Task 3 (overrides) and Task 4 (build wiring) also precede Task 5. Task 5's assertion is the real gate.
- **Idempotency:** `mentions:to-directory` replaces its own CSV rows/coords/map on re-run; `overrides.json` is hand-merged; the rebuild is byte-stable (per the project's build invariants).
- **No `CATEGORY_META` change:** `permanent_community` already displays as "Community" (`lib/directory.ts:141`).
- **Don't edit the consolidated JSON directly** — all category changes go through `overrides.json`, all new hubs through `approved-candidates.csv` (project invariant).
- Enriching the 10 new towns (season/price/nationality) is a separate later pass via the enrichment pipeline — out of scope here.
