# Stage 2: Discovery Channels + Candidate Inbox — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A multi-channel discovery pipeline that deposits new-hub candidates into one reviewable inbox, with an interactive review page and an apply path into the existing directory build.

**Architecture:** Pure logic in `lib/intake/` (inbox schema, dedupe, scrape extraction — vitest-tested); thin tsx scripts orchestrate fetch → diff → inbox → review page → apply. Approved candidates land in `data/research/approved-candidates.csv` (same columns as the existing candidates CSV), which `build_directory.py` ingests; rejected names persist in `data/research/inbox/rejected.json` so no channel re-proposes them. Aggregators are mined for listings but never linkable (registry enforcement at apply time). Channels that need human/LLM judgment (LLM sweeps, FB screenshots) get generated prompts + runbooks instead of brittle automation.

**Tech Stack:** TypeScript via tsx (Node 20 `fetch`), vitest, Python 3 (`build_directory.py`), JSON/CSV data files, self-contained HTML review page (pattern proven by `scripts/audit-review-page.ts`).

**Spec:** `docs/superpowers/specs/2026-06-12-directory-enrichment-methodology-design.md` (Stage 2 + inbox format + review workflow). Stage 3 (scheduling) is explicitly out of scope — it gets its own plan once these channels prove out.

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `lib/intake/inbox.ts` | Create | Candidate schema, cid/slug/normName, dedupe verdicts, rejected-list helpers, candidate→CSV-row mapping |
| `lib/intake/scrape.ts` | Create | Pure aggregator-listing extraction: slug extraction from HTML, slug→name, snapshot diff |
| `scripts/discover-aggregators.ts` | Create | Fetch aggregator listing indexes, snapshot, diff, append new candidates to the inbox |
| `scripts/sweep-prompt.ts` | Create | Generate a dated LLM deep-research prompt with known-hub suppression + community/Hebrew targets |
| `scripts/inbox-review-page.ts` | Create | Generate self-contained `inbox-review.html` (Approve/Reject/Edit, exports decisions JSON) |
| `scripts/inbox-apply.ts` | Create | Decisions + inbox → approved CSV rows + rejected.json; aggregator-URL enforcement |
| `data/research/aggregator-scrape-config.json` | Create | Per-aggregator index URLs / pagination / link patterns |
| `data/research/inbox/candidates.json` | Create (seed) | The inbox: `{ updatedAt, candidates: [] }` |
| `data/research/inbox/rejected.json` | Create (seed) | `{ names: [] }` (normalized names, never re-proposed) |
| `data/research/inbox/fb-screenshots/` | Create | Drop-folder for FB/WhatsApp screenshots (`.gitkeep`) |
| `data/research/screenshot-ingestion-runbook.md` | Create | Agent runbook: screenshots → inbox candidates |
| `data/research/sweep-ingestion-runbook.md` | Create | Agent runbook: LLM sweep output → inbox candidates |
| `data/research/approved-candidates.csv` | Create (header only) | Build input for inbox-approved hubs |
| `data/research/build_directory.py` | Modify (~line 322, after the candidates-CSV loop) | Ingest `approved-candidates.csv` |
| `package.json` | Modify | `discover:aggregators`, `discover:sweep-prompt`, `inbox:review`, `inbox:apply` |
| `test/intake-inbox.test.ts`, `test/intake-scrape.test.ts` | Create | Unit tests |

Shared types (defined in Task 1, used everywhere):

```ts
export interface CandidateEvidence { url: string; asOf: string }

export interface InboxCandidate {
  cid: string;                 // stable: slugify(name) + "--" + sourceChannel
  name: string;
  country?: string;
  region?: string;
  claimedDates?: string;
  categoryGuess?: string;      // taxonomy guess or raw type word
  providerUrl?: string | null;
  urlType?: "site" | "social";
  evidence: CandidateEvidence[];
  sourceChannel: string;       // "aggregator-diff:worldschooly.com" | "llm-sweep" | "fb-screenshot" | "manual"
  notes?: string;
  dedupe: string;              // "new" | "known" | "possible-dup-of:<id>"
  addedAt: string;             // ISO
}

export interface InboxFile { updatedAt: string; candidates: InboxCandidate[] }
```

CSV contract (existing, from `candidate-hubs-2026-06-08.csv` — `build_directory.py` reads these exact column names):
`name,type,country,region_city,season_dates,ages,price,website,facebook_instagram,host,source_directory,confidence,dedup_status,notes`

---

### Task 1: Inbox schema, dedupe, rejected-list (lib)

**Files:**
- Create: `lib/intake/inbox.ts`
- Create: `data/research/inbox/candidates.json` (content: `{ "updatedAt": "", "candidates": [] }`)
- Create: `data/research/inbox/rejected.json` (content: `{ "names": [] }`)
- Test: `test/intake-inbox.test.ts`

- [ ] **Step 1: Seed the two data files** with exactly the JSON above (one-line files are fine; end with newline).

- [ ] **Step 2: Write the failing tests** — create `test/intake-inbox.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  normName, slugify, candidateCid, dedupeVerdict, isRejected, candidateToCsvRow,
  type InboxCandidate,
} from "../lib/intake/inbox";

const DIR = [
  { id: "harmony-learning-center", name: "Harmony Learning Center", country: "Costa Rica" },
  { id: "bansko-town-base-city", name: "Bansko Town (base city)", country: "Bulgaria" },
];

describe("normName / slugify", () => {
  it("normalizes case and whitespace", () => {
    expect(normName("  Harmony   LEARNING Center ")).toBe("harmony learning center");
  });
  it("slugifies like build_directory.py (lower, non-alnum→-, trim, max 42)", () => {
    expect(slugify("Bansko Town (base city)")).toBe("bansko-town-base-city");
    expect(slugify("A".repeat(60))).toHaveLength(42);
  });
});

describe("candidateCid", () => {
  it("is stable and channel-scoped", () => {
    expect(candidateCid("Portugal Pop Up", "manual")).toBe("portugal-pop-up--manual");
  });
});

describe("dedupeVerdict", () => {
  it("exact normalized name → known", () => {
    expect(dedupeVerdict("harmony learning CENTER", "Costa Rica", DIR)).toBe("known");
  });
  it("slug match → known", () => {
    expect(dedupeVerdict("Bansko Town (Base City)", "Bulgaria", DIR)).toBe("known");
  });
  it("containment + same country → possible-dup-of", () => {
    expect(dedupeVerdict("Harmony Learning", "Costa Rica", DIR))
      .toBe("possible-dup-of:harmony-learning-center");
  });
  it("containment but different country → new", () => {
    expect(dedupeVerdict("Harmony Learning", "Mexico", DIR)).toBe("new");
  });
  it("unrelated name → new", () => {
    expect(dedupeVerdict("Slovakia Summer Hub", "Slovakia", DIR)).toBe("new");
  });
});

describe("isRejected", () => {
  it("matches on normalized name", () => {
    expect(isRejected("  Dead HUB ", { names: ["dead hub"] })).toBe(true);
    expect(isRejected("Live Hub", { names: ["dead hub"] })).toBe(false);
  });
});

describe("candidateToCsvRow", () => {
  const base: InboxCandidate = {
    cid: "x--manual", name: "Portugal Pop Up", country: "Portugal", region: "Cascais",
    claimedDates: "weekly", categoryGuess: "popup",
    providerUrl: "https://www.portugalpopup.com/", urlType: "site",
    evidence: [{ url: "https://www.portugalpopup.com/", asOf: "2026-06-12" }],
    sourceChannel: "manual", notes: "weekly meetups", dedupe: "new", addedAt: "2026-06-12T00:00:00Z",
  };
  it("maps site urls to the website column", () => {
    const row = candidateToCsvRow(base);
    expect(row.website).toBe("https://www.portugalpopup.com/");
    expect(row.facebook_instagram).toBe("");
    expect(row.name).toBe("Portugal Pop Up");
    expect(row.type).toBe("popup");
    expect(row.region_city).toBe("Cascais");
    expect(row.season_dates).toBe("weekly");
    expect(row.source_directory).toBe("manual");
    expect(row.confidence).toBe("inbox");
    expect(row.dedup_status).toBe("NEW");
  });
  it("maps social urls to the facebook_instagram column", () => {
    const row = candidateToCsvRow({ ...base, urlType: "social",
      providerUrl: "https://facebook.com/groups/x" });
    expect(row.website).toBe("");
    expect(row.facebook_instagram).toBe("https://facebook.com/groups/x");
  });
  it("null url → both columns empty", () => {
    const row = candidateToCsvRow({ ...base, providerUrl: null });
    expect(row.website).toBe("");
    expect(row.facebook_instagram).toBe("");
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `npx vitest run test/intake-inbox.test.ts`
Expected: FAIL — cannot resolve `../lib/intake/inbox`.

- [ ] **Step 4: Implement `lib/intake/inbox.ts`**

```ts
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

export interface CandidateEvidence { url: string; asOf: string }

export interface InboxCandidate {
  cid: string;
  name: string;
  country?: string;
  region?: string;
  claimedDates?: string;
  categoryGuess?: string;
  providerUrl?: string | null;
  urlType?: "site" | "social";
  evidence: CandidateEvidence[];
  sourceChannel: string;
  notes?: string;
  dedupe: string;            // "new" | "known" | "possible-dup-of:<id>"
  addedAt: string;
}

export interface InboxFile { updatedAt: string; candidates: InboxCandidate[] }
export interface RejectedFile { names: string[] }
export interface DirEntry { id: string; name: string; country: string }

const RESEARCH = join(process.cwd(), "data", "research");
export const INBOX_PATH = join(RESEARCH, "inbox", "candidates.json");
export const REJECTED_PATH = join(RESEARCH, "inbox", "rejected.json");

export function normName(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

/** Mirrors build_directory.py: re.sub(r"[^a-z0-9]+","-",norm).strip("-")[:42] */
export function slugify(s: string): string {
  return normName(s).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 42);
}

export function candidateCid(name: string, sourceChannel: string): string {
  return `${slugify(name)}--${sourceChannel}`;
}

export function dedupeVerdict(name: string, country: string | undefined, dir: DirEntry[]): string {
  const n = normName(name);
  const slug = slugify(name);
  for (const e of dir) {
    if (normName(e.name) === n || slugify(e.name) === slug) return "known";
  }
  if (country) {
    const c = normName(country);
    for (const e of dir) {
      const en = normName(e.name);
      if (normName(e.country) === c && (en.includes(n) || n.includes(en))) {
        return `possible-dup-of:${e.id}`;
      }
    }
  }
  return "new";
}

export function isRejected(name: string, rejected: RejectedFile): boolean {
  return rejected.names.includes(normName(name));
}

export function loadInbox(path: string = INBOX_PATH): InboxFile {
  return JSON.parse(readFileSync(path, "utf8")) as InboxFile;
}
export function saveInbox(inbox: InboxFile, path: string = INBOX_PATH): void {
  inbox.updatedAt = new Date().toISOString();
  writeFileSync(path, JSON.stringify(inbox, null, 1) + "\n");
}
export function loadRejected(path: string = REJECTED_PATH): RejectedFile {
  return existsSync(path) ? (JSON.parse(readFileSync(path, "utf8")) as RejectedFile) : { names: [] };
}
export function saveRejected(rejected: RejectedFile, path: string = REJECTED_PATH): void {
  rejected.names = [...new Set(rejected.names)].sort();
  writeFileSync(path, JSON.stringify(rejected, null, 1) + "\n");
}

/** Columns of candidate-hubs-2026-06-08.csv — build_directory.py reads these names. */
export const CSV_COLUMNS = [
  "name", "type", "country", "region_city", "season_dates", "ages", "price",
  "website", "facebook_instagram", "host", "source_directory", "confidence",
  "dedup_status", "notes",
] as const;

export type CsvRow = Record<(typeof CSV_COLUMNS)[number], string>;

export function candidateToCsvRow(c: InboxCandidate): CsvRow {
  const isSocial = c.urlType === "social";
  const url = c.providerUrl ?? "";
  return {
    name: c.name,
    type: c.categoryGuess ?? "",
    country: c.country ?? "",
    region_city: c.region ?? "",
    season_dates: c.claimedDates ?? "",
    ages: "",
    price: "",
    website: isSocial ? "" : url,
    facebook_instagram: isSocial ? url : "",
    host: "",
    source_directory: c.sourceChannel,
    confidence: "inbox",
    dedup_status: "NEW",
    notes: c.notes ?? "",
  };
}
```

- [ ] **Step 5: Run tests, verify PASS**: `npx vitest run test/intake-inbox.test.ts`, then `npm test` (99 existing + 13 new = 112).

- [ ] **Step 6: Commit**

```bash
git add lib/intake/inbox.ts test/intake-inbox.test.ts data/research/inbox/candidates.json data/research/inbox/rejected.json
git commit -m "feat: candidate inbox schema, dedupe verdicts, rejected list, CSV mapping"
```

---

### Task 2: Apply path — inbox decisions → approved CSV + build ingestion

**Files:**
- Create: `scripts/inbox-apply.ts`
- Create: `data/research/approved-candidates.csv` (header line only)
- Modify: `data/research/build_directory.py` (directly after the candidates-CSV loop, ~line 322)
- Modify: `package.json`

- [ ] **Step 1: Seed `data/research/approved-candidates.csv`** with exactly one line (the header):

```
name,type,country,region_city,season_dates,ages,price,website,facebook_instagram,host,source_directory,confidence,dedup_status,notes
```

- [ ] **Step 2: Implement `scripts/inbox-apply.ts`**

```ts
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
```

- [ ] **Step 3: Ingest the approved CSV in `build_directory.py`** — directly AFTER the existing candidates-CSV `with open(cpath) ...` loop (it ends at the line building `entries.append(dict(... notes=r.get("notes","")[:200]))`, ~line 322), add:

```python
# ---- 2b. inbox-approved candidates (Stage-2 discovery → user-approved) ----
apath = os.path.join(ROOT, "approved-candidates.csv")
if os.path.exists(apath):
    with open(apath, encoding="utf-8") as fh:
        for r in csv.DictReader(fh):
            name = r.get("name","")
            if not name: continue
            aud = r.get("ages",""); audfor = "families" if "famil" in (r.get("notes","")+name).lower() else ""
            cat, sp = categorize(name, r.get("type",""), audfor, r.get("country",""), r.get("notes",""), "")
            part = participation(audfor, name, "", r.get("notes",""))
            entries.append(dict(name=name, host=r.get("host",""), category=cat, spanish=sp,
                participation=part, country=r.get("country",""), region=r.get("region_city",""),
                season=r.get("season_dates",""), ages=r.get("ages",""), price=r.get("price",""),
                nationality="", validity="inbox-approved",
                website=r.get("website",""), facebook=r.get("facebook_instagram",""),
                source="inbox ("+r.get("source_directory","")+")", notes=r.get("notes","")[:200]))
```

- [ ] **Step 4: Add the npm script** — in `package.json` after `"audit:review"`:

```json
    "inbox:apply": "tsx scripts/inbox-apply.ts",
```

- [ ] **Step 5: End-to-end dry run (leave no trace).** Write a temp candidate + decisions:

```bash
python3 - <<'EOF'
import json
inbox = {"updatedAt": "", "candidates": [{
  "cid": "test-hub--manual", "name": "Test Hub", "country": "Slovakia", "region": "Bratislava",
  "claimedDates": "July 2026", "categoryGuess": "popup",
  "providerUrl": "https://worldschooly.com/hub/test/", "urlType": "site",
  "evidence": [{"url": "https://example.com", "asOf": "2026-06-12"}],
  "sourceChannel": "manual", "notes": "smoke test", "dedupe": "new", "addedAt": "2026-06-12T00:00:00Z"}]}
json.dump(inbox, open("data/research/inbox/candidates.json","w"), indent=1)
json.dump({"test-hub--manual": {"decision": "approve"}},
          open("data/research/inbox/inbox-decisions.json","w"), indent=2)
EOF
npm run inbox:apply
```

Expected: warning `aggregator URL stripped from approved candidate test-hub--manual`, output `approved 1 ... rejected 0 ... 0 still in inbox`. Check: `tail -1 data/research/approved-candidates.csv` shows the Test Hub row with EMPTY website column (aggregator enforcement worked). Then run `cd data/research && python3 build_directory.py | tail -1` — expect `TOTAL entries: 176` (Test Hub ingested).

- [ ] **Step 6: Clean up the dry run completely**

```bash
git checkout -- data/research/inbox/candidates.json data/research/approved-candidates.csv 2>/dev/null || true
printf 'name,type,country,region_city,season_dates,ages,price,website,facebook_instagram,host,source_directory,confidence,dedup_status,notes\n' > data/research/approved-candidates.csv
printf '{ "updatedAt": "", "candidates": [] }\n' > data/research/inbox/candidates.json
rm -f data/research/inbox/inbox-decisions.json
cd data/research && python3 build_directory.py | tail -1 && cd ../..
git checkout -- data/research/directory-consolidated-2026-06-09.json data/research/directory-consolidated-2026-06-09.csv data/research/hub-directory-report-2026-06-09.html
git status --porcelain
```

Expected final state: only ` M .gitignore`, ` M data/research/build_directory.py`, ` M package.json`, `?? data/research/approved-candidates.csv`, and the new scripts file. TOTAL back to 175.

- [ ] **Step 7: Run `npm test`** (112 green) **and commit**

```bash
git add scripts/inbox-apply.ts data/research/approved-candidates.csv data/research/build_directory.py package.json
git commit -m "feat: inbox:apply — decisions to approved-candidates.csv with aggregator enforcement"
```

---

### Task 3: Aggregator listing extraction (pure lib)

**Files:**
- Create: `lib/intake/scrape.ts`
- Create: `data/research/aggregator-scrape-config.json`
- Test: `test/intake-scrape.test.ts`

- [ ] **Step 1: Seed `data/research/aggregator-scrape-config.json`** (probed 2026-06-12: worldschooly `/hubs/` returns 200 with `https://worldschooly.com/hub/<slug>/` anchors; the atlas uses `/listing/<slug>/` with category index pages; famunity structure unknown — the implementer of Task 4 probes it and either fills in a real config or records it as unsupported with a note):

```json
{
  "worldschooly.com": {
    "index": ["https://worldschooly.com/hubs/"],
    "paginate": "https://worldschooly.com/hubs/page/{n}/",
    "maxPages": 12,
    "linkPattern": "https://worldschooly\\.com/hub/([a-z0-9-]+)/"
  },
  "theworldschoolatlas.com": {
    "index": [
      "https://theworldschoolatlas.com/listing-category/hubs/",
      "https://theworldschoolatlas.com/listing-category/events/"
    ],
    "paginate": "{index}page/{n}/",
    "maxPages": 12,
    "linkPattern": "https://theworldschoolatlas\\.com/listing/([a-z0-9-]+)/"
  },
  "famunity.net": {
    "unsupported": "structure not yet probed — Task 4 implementer: probe and fill in, or document why not scrapeable"
  }
}
```

- [ ] **Step 2: Write the failing tests** — create `test/intake-scrape.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { extractSlugs, slugToName, diffListings } from "../lib/intake/scrape";

const HTML = `
<a href="https://worldschooly.com/hub/harmony-learning-center/">x</a>
<a href="https://worldschooly.com/hub/new-slovakia-hub/" class="c">y</a>
<a href="https://worldschooly.com/hub/harmony-learning-center/">dup</a>
<a href="https://worldschooly.com/hubs/page/2/">next</a>
`;
const PATTERN = "https://worldschooly\\.com/hub/([a-z0-9-]+)/";

describe("extractSlugs", () => {
  it("extracts unique slugs with their urls", () => {
    expect(extractSlugs(HTML, PATTERN)).toEqual({
      "harmony-learning-center": "https://worldschooly.com/hub/harmony-learning-center/",
      "new-slovakia-hub": "https://worldschooly.com/hub/new-slovakia-hub/",
    });
  });
});

describe("slugToName", () => {
  it("humanizes slugs", () => {
    expect(slugToName("new-slovakia-hub")).toBe("New Slovakia Hub");
  });
});

describe("diffListings", () => {
  it("returns only slugs absent from the previous snapshot", () => {
    const current = { a: "u1", b: "u2", c: "u3" };
    const prev = { a: "u1" };
    expect(diffListings(current, prev)).toEqual({ b: "u2", c: "u3" });
  });
  it("everything is new when no snapshot exists", () => {
    expect(diffListings({ a: "u1" }, null)).toEqual({ a: "u1" });
  });
});
```

- [ ] **Step 3: Run to verify failure**: `npx vitest run test/intake-scrape.test.ts` — FAIL (cannot resolve).

- [ ] **Step 4: Implement `lib/intake/scrape.ts`**

```ts
export interface ScrapeSiteConfig {
  index?: string[];
  paginate?: string;      // "{index}page/{n}/" or absolute "https://.../page/{n}/"
  maxPages?: number;
  linkPattern?: string;   // regex with ONE capture group = slug
  unsupported?: string;
}

export type Listings = Record<string, string>; // slug → url

export function extractSlugs(html: string, linkPattern: string): Listings {
  const re = new RegExp(linkPattern, "g");
  const out: Listings = {};
  for (const m of html.matchAll(re)) out[m[1]] ??= m[0];
  return out;
}

export function slugToName(slug: string): string {
  return slug.split("-").filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1)).join(" ");
}

export function diffListings(current: Listings, prev: Listings | null): Listings {
  if (!prev) return { ...current };
  return Object.fromEntries(Object.entries(current).filter(([slug]) => !(slug in prev)));
}
```

- [ ] **Step 5: Run tests** (`npx vitest run test/intake-scrape.test.ts` PASS, `npm test` 117) **and commit**

```bash
git add lib/intake/scrape.ts test/intake-scrape.test.ts data/research/aggregator-scrape-config.json
git commit -m "feat: aggregator listing extraction lib + scrape config"
```

---

### Task 4: Aggregator diff channel (script)

**Files:**
- Create: `scripts/discover-aggregators.ts`
- Modify: `package.json`
- Created at runtime: `data/research/snapshots/<domain>.json`

- [ ] **Step 1: Implement `scripts/discover-aggregators.ts`**

```ts
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
  }
  saveInbox(inbox);
  console.log(`added ${added} new candidates → inbox (${inbox.candidates.length} total). ` +
    `Review with: npm run inbox:review`);
}

main().catch((err) => { console.error(err); process.exit(1); });
```

- [ ] **Step 2: npm script** — after `"inbox:apply"` in `package.json`:

```json
    "discover:aggregators": "tsx scripts/discover-aggregators.ts",
```

- [ ] **Step 3: Probe famunity.net** (the config marks it unsupported): fetch `https://famunity.net/` with the browser UA, look for a hubs/listing index and a stable per-listing URL pattern. If found, replace the `unsupported` entry with a real `{index, paginate, linkPattern}` config and re-run. If the site is JS-rendered or has no index, leave `unsupported` with one sentence saying what you saw.

- [ ] **Step 4: First real run**: `npm run discover:aggregators`
Expected: per-domain listing counts (worldschooly ~25+ across pages, atlas similar), snapshot files written under `data/research/snapshots/`, and a number of new candidates added (first run diffs against the whole directory, so only never-seen listings land). Inspect: `python3 -c "import json; i=json.load(open('data/research/inbox/candidates.json')); print(len(i['candidates'])); [print(c['cid'], c['dedupe']) for c in i['candidates'][:15]]"` — names should look like real hubs we don't have; `dedupe` should be `new` or `possible-dup-of:*`, never `known`.

- [ ] **Step 5: Reset the run artifacts** (the real run with review happens in Task 8; keep this task's commit code-only):

```bash
printf '{ "updatedAt": "", "candidates": [] }\n' > data/research/inbox/candidates.json
rm -rf data/research/snapshots
```

- [ ] **Step 6: `npm test` (117 green), commit**

```bash
git add scripts/discover-aggregators.ts package.json data/research/aggregator-scrape-config.json
git commit -m "feat: discover:aggregators — listing diff channel into the inbox"
```

(`aggregator-scrape-config.json` included again in case Step 3 updated famunity.)

---

### Task 5: LLM sweep prompt generator

**Files:**
- Create: `scripts/sweep-prompt.ts`
- Modify: `package.json`

- [ ] **Step 1: Implement `scripts/sweep-prompt.ts`**

```ts
/**
 * Generate a dated, self-contained LLM deep-research prompt for the discovery
 * sweep: the existing data/research/deep-research-prompt.md plus a generated
 * preamble (recency window, suppression list of known hubs, community/Hebrew
 * source targets). Paste the output file into ChatGPT/Gemini/Claude with web
 * access; transcribe results per data/research/sweep-ingestion-runbook.md.
 *
 * Usage: npm run discover:sweep-prompt
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const RESEARCH = join(process.cwd(), "data", "research");
const BASE = join(RESEARCH, "deep-research-prompt.md");
const DIRJSON = join(RESEARCH, "directory-consolidated-2026-06-09.json");

function main() {
  const date = new Date().toISOString().slice(0, 10);
  const OUT = join(RESEARCH, `sweep-prompt-${date}.md`);
  const names = (JSON.parse(readFileSync(DIRJSON, "utf8")) as { name: string; country: string }[])
    .map((e) => `${e.name} (${e.country})`).sort();

  const preamble = `# DISCOVERY SWEEP — ${date}

This is a RECURRING sweep over an existing directory. Two changes to the task below:

1. **Recency focus.** Prioritize hubs, programs, pop-ups, and gatherings ANNOUNCED OR
   FIRST DOCUMENTED in the last ~6 months (and anything scheduled for the coming 12
   months). Long-established places we already track are listed below — skip them.

2. **Suppression list — we ALREADY KNOW these ${names.length} places/programs. Do NOT
   include them in your output (but a NEW location/edition of a known operator IS
   wanted, e.g. a new Boundless campus):**

${names.map((n) => `   - ${n}`).join("\n")}

3. **Community text sources — explicitly check these beyond the open web:**
   - Reddit: r/worldschooling, r/digitalnomad (family threads), r/homeschool travel threads
   - Facebook PUBLIC pages/groups surfaced by web search (don't log in)
   - Worldschooling newsletters and blogs (Wonder Year, World Travel Family, Passport Explorers …)
   - **Hebrew sources** (forums, blogs, Telegram/WhatsApp group mentions): search
     "וורלדסקולינג", "חינוך ביתי בחו"ל", "משפחות מטיילות" — Israeli-family clustering
     is a first-class signal for this directory.

4. **Output format per find:** name | country/region | type guess (organic town /
   permanent / pop-up / traveling / Spanish-immersion) | dates if any | first-party
   link if any | 1-line evidence + source URL + as-of date. Never invent links.

---

`;
  writeFileSync(OUT, preamble + readFileSync(BASE, "utf8"));
  console.log("wrote", OUT, `(${names.length} known hubs suppressed)`);
}

main();
```

- [ ] **Step 2: npm script** — after `"discover:aggregators"`:

```json
    "discover:sweep-prompt": "tsx scripts/sweep-prompt.ts",
```

- [ ] **Step 3: Verify**: `npm run discover:sweep-prompt` → `data/research/sweep-prompt-<today>.md` exists, starts with the preamble, suppression list has 175 lines, base prompt follows. Then `rm data/research/sweep-prompt-*.md` (generated on demand, not committed).

- [ ] **Step 4: Commit**

```bash
git add scripts/sweep-prompt.ts package.json
git commit -m "feat: discover:sweep-prompt — dated sweep prompt with suppression + Hebrew targets"
```

---

### Task 6: Runbooks + screenshot drop-folder

**Files:**
- Create: `data/research/inbox/fb-screenshots/.gitkeep` (empty file)
- Create: `data/research/screenshot-ingestion-runbook.md`
- Create: `data/research/sweep-ingestion-runbook.md`

- [ ] **Step 1: Create the drop folder** (`mkdir -p data/research/inbox/fb-screenshots && touch data/research/inbox/fb-screenshots/.gitkeep`).

- [ ] **Step 2: Write `data/research/screenshot-ingestion-runbook.md`**

```markdown
# Screenshot ingestion runbook (FB / WhatsApp / Telegram)

The user drops screenshots of hub announcements into
`data/research/inbox/fb-screenshots/` whenever they happen to see one.
No cadence, no obligation. An agent session turns them into inbox candidates.

## Procedure (agent with vision)

1. List the folder. For each image not yet ingested (check `ingested.json` in the
   same folder — `{ "files": { "<filename>": "<cid>" } }`; create it if missing):
2. Read the image. Extract: hub/program name, place (country + town), dates,
   organizer, any URL or group name VISIBLE in the post. Never invent what is
   not legible — partial data is fine.
3. Build an inbox candidate (see `lib/intake/inbox.ts` types):
   - `cid`: `candidateCid(name, "fb-screenshot")`
   - `evidence`: `[{ "url": "screenshot:<filename>", "asOf": "<today>" }]`
   - `sourceChannel`: `"fb-screenshot"`
   - `providerUrl`: only if a real URL is legible in the post (else null)
   - `dedupe`: via `dedupeVerdict(name, country, directory entries)`
   - `notes`: one line summarizing the post (who/what/when)
4. Skip candidates whose normalized name is in `data/research/inbox/rejected.json`
   or already in the inbox.
5. Append to `data/research/inbox/candidates.json`, record the filename in
   `ingested.json`, report a summary table.
6. The user reviews via `npm run inbox:review` as with any other channel.
```

- [ ] **Step 3: Write `data/research/sweep-ingestion-runbook.md`**

```markdown
# LLM sweep ingestion runbook

After running a sweep (`npm run discover:sweep-prompt` → paste into ChatGPT/Gemini/
Claude with web access), transcribe the model's findings into inbox candidates.

## Procedure (agent)

1. Input: the sweep output (markdown/table/prose). One inbox candidate per find.
2. Per find, build an `InboxCandidate` (types in `lib/intake/inbox.ts`):
   - `cid`: `candidateCid(name, "llm-sweep")`
   - `name`, `country`, `region`, `claimedDates`, `categoryGuess` (map the model's
     type guess onto: organic / permanent_commercial / permanent_community / popup /
     traveling / spanish_immersion)
   - `providerUrl`: the find's first-party link if given — NEVER an aggregator
     domain (`data/research/aggregator-domains.json`); aggregator links go into
     `evidence` instead
   - `evidence`: every source URL the model cited, each with its as-of date;
     a find with NO source URL gets `evidence: []` and a note saying so
     (low-trust, the review page shows it)
   - `dedupe`: via `dedupeVerdict(name, country, directory entries)` — drop "known"
   - `sourceChannel`: `"llm-sweep"`, `notes`: one-line evidence summary
3. Skip names in `data/research/inbox/rejected.json` and cids already in the inbox.
4. Append to `data/research/inbox/candidates.json`; report counts + a table.
5. Discipline (same as the research prompts): never invent; families ≠ nomads;
   a homepage read is not a source read.
```

- [ ] **Step 4: Commit**

```bash
git add data/research/inbox/fb-screenshots/.gitkeep data/research/screenshot-ingestion-runbook.md data/research/sweep-ingestion-runbook.md
git commit -m "docs: screenshot + sweep ingestion runbooks, FB drop-folder"
```

---

### Task 7: Inbox review page

**Files:**
- Create: `scripts/inbox-review-page.ts`
- Modify: `package.json`

This mirrors `scripts/audit-review-page.ts` (read it first — same self-contained-HTML rules: data embedded as a JS const, zero external resources, localStorage state keyed to the inbox's `updatedAt`, Blob-download export). Differences: cards are inbox candidates; edit fields are name/country/region/category/providerUrl/urlType; export format is the `inbox-decisions.json` consumed by Task 2.

- [ ] **Step 1: Implement `scripts/inbox-review-page.ts`** — generator skeleton (the embedded page JS follows the audit page's structure; key parts shown in full):

```ts
/**
 * Generate data/research/inbox-review.html — self-contained interactive review
 * of inbox candidates. Approve/Reject/Edit per card; exports
 * inbox-decisions.json for `npm run inbox:apply`.
 *
 * Usage: npm run inbox:review
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const RESEARCH = join(process.cwd(), "data", "research");
const INBOX = join(RESEARCH, "inbox", "candidates.json");
const OUT = join(RESEARCH, "inbox-review.html");

function escapeJson(json: string): string {
  return json.replace(/<\//g, "<\\/");
}

function main() {
  if (!existsSync(INBOX)) {
    console.error(`${INBOX} not found.`);
    process.exit(1);
  }
  const inbox = JSON.parse(readFileSync(INBOX, "utf8"));
  const safeJson = escapeJson(JSON.stringify(inbox));
  writeFileSync(OUT, buildHtml(safeJson));
  console.log(`wrote ${OUT} (${inbox.candidates.length} candidates)`);
}
```

The `buildHtml(safeJson: string)` function returns the full HTML document. Reuse the CSS from `scripts/audit-review-page.ts` verbatim (same `:root` palette, `.card`, `.btn-approve/.btn-reject`, `.edit-disclosure`, progress header, filter chips — chips here filter by `sourceChannel` instead of verdict). The page JS must implement:

```js
// State: { version: <inbox.updatedAt>, decisions: { [cid]:
//   { decision: "approve"|"reject", name?, country?, region?, categoryGuess?,
//     providerUrl?, urlType?, notes? } | null } }
// Card content per candidate:
//   name (+ cid muted), sourceChannel badge, dedupe badge
//     ("possible-dup-of:*" rendered in amber with the target id — review carefully),
//   country/region/claimedDates/categoryGuess line,
//   providerUrl as a clickable link when present,
//   evidence list: each evidence url a clickable link with its asOf
//     ("screenshot:" urls rendered as plain text),
//   notes line.
// Controls: Approve / Reject / "Edit fields" disclosure with inputs:
//   name (text, prefilled), country (text), region (text),
//   categoryGuess (select: organic, permanent_commercial, permanent_community,
//                  popup, traveling, spanish_immersion, ""),
//   providerUrl (text, prefilled), urlType (select: site/social).
// approve(): d = { decision: "approve" }; if the disclosure is open, every field
//   whose value differs from the candidate's current value is included explicitly.
//   decisions[cid] = d.
// Export button: out = {}; for each decided cid: reject → {decision:"reject"};
//   approve → {decision:"approve", ...explicit fields}. Undecided omitted.
//   Blob-download as "inbox-decisions.json"; note under the button:
//   "Save as data/research/inbox/inbox-decisions.json then run: npm run inbox:apply"
```

Write the complete file — the audit page is the reference for every mechanism (el() helper, localStorage versioning, filter chips, progress bar, export). No external resources; all data embedded.

- [ ] **Step 2: npm script** — after `"discover:sweep-prompt"`:

```json
    "inbox:review": "tsx scripts/inbox-review-page.ts",
```

- [ ] **Step 3: Verify with a temp candidate**: re-create the Task 2 Step 5 temp candidate (same python snippet), run `npm run inbox:review`, then `grep -c "Test Hub" data/research/inbox-review.html` ≥ 1 and `grep -cE '<(script|link)[^>]+(src|href)="https?://' data/research/inbox-review.html` = 0 (self-contained). Reset: `printf '{ "updatedAt": "", "candidates": [] }\n' > data/research/inbox/candidates.json && rm -f data/research/inbox-review.html`.

- [ ] **Step 4: `npm test` (117), commit**

```bash
git add scripts/inbox-review-page.ts package.json
git commit -m "feat: inbox:review — interactive candidate review page exporting inbox decisions"
```

---

### Task 8: First real discovery run

**Files:**
- Modified at runtime: `data/research/inbox/candidates.json`, `data/research/snapshots/*`, `data/research/inbox-review.html`

- [ ] **Step 1: Run the aggregator channel for real**: `npm run discover:aggregators`
Expected: listing counts per domain, snapshots written, N new candidates (likely 5–40: listings on worldschooly/atlas that aren't in our 175).

- [ ] **Step 2: Seed the manual candidate found during Stage 1** (Portugal Pop Up — Cascais-area weekly meetups, spotted while resolving lisbon-cascais):

```bash
npx tsx -e "
import { readFileSync } from 'node:fs';
import { loadInbox, saveInbox, candidateCid, dedupeVerdict } from './lib/intake/inbox';
const inbox = loadInbox();
const dir = JSON.parse(readFileSync('data/research/directory-consolidated-2026-06-09.json', 'utf8'));
const c = {
  cid: candidateCid('Portugal Pop Up Worldschool Hub', 'manual'),
  name: 'Portugal Pop Up Worldschool Hub', country: 'Portugal', region: 'Lisbon / Cascais',
  claimedDates: 'weekly meetups', categoryGuess: 'popup',
  providerUrl: 'https://www.portugalpopup.com/', urlType: 'site' as const,
  evidence: [{ url: 'https://www.portugalpopup.com/', asOf: '2026-06-12' }],
  sourceChannel: 'manual', notes: 'spotted during Stage-1 lisbon-cascais resolution; weekly beach/park meetups for traveling families',
  dedupe: dedupeVerdict('Portugal Pop Up Worldschool Hub', 'Portugal', dir),
  addedAt: new Date().toISOString(),
};
if (!inbox.candidates.some((x) => x.cid === c.cid)) inbox.candidates.push(c);
saveInbox(inbox);
console.log('seeded', c.cid, c.dedupe);
"
```

- [ ] **Step 3: Generate the review page**: `npm run inbox:review` — open-check that candidate cards render with evidence links.

- [ ] **Step 4: Commit the run**

```bash
git add data/research/inbox/candidates.json data/research/snapshots data/research/inbox-review.html
git commit -m "data: first aggregator-diff discovery run + portugalpopup manual seed"
```

- [ ] **Step 5: Hand off.** Report to the user: how many candidates landed, from which channels, notable names (is a Slovakia hub among them?). The user (or a rule they set) decides via the review page → `inbox:apply` → rebuild. The LLM sweep (`discover:sweep-prompt`) and screenshot runbooks are ready for their first use in separate sessions.

---

## Out of scope (Stage 3 / later)

- Scheduling any of this (cron cloud agents) — needs these channels proven first.
- Operator-watch channel (new locations from known multi-edition providers) — the enrichment events layer already tracks their cohorts; a dedicated watcher joins the Stage-3 plan.
- Provider-link resolution for approved candidates — they flow into the existing Stage-1 audit loop on the next `audit:links` run (new entries get fetched, classified, and resolved like everything else).
- Duplicate merging (worldschooling-tanzania ≡ amani-light etc.) — separate curation pass.
