# Hub-Validation Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A mostly-autonomous pipeline that validates each hub (existing entry or inbox candidate) against the open web, sources a real image, and updates the directory — with only the uncertain minority flagged for the user.

**Architecture:** A committed `hub-validator` agent (Haiku-default, Sonnet-escalation) produces a strict-JSON verdict per hub into `data/research/validation/results.json`. Deterministic controller code (`lib/intake/validation.ts` + `scripts/validation-apply.ts`) applies high-confidence verdicts via the existing `overrides.json` → rebuild path and flags the rest. The image stage reuses the existing `fetch_location_images.py` (free Wikipedia location photo) + `fetch_images.py` (own og:image) on the corrected links.

**Tech Stack:** TypeScript via tsx, vitest, Python 3 (existing image + build scripts), a markdown agent definition, JSON data files.

**Spec:** `docs/superpowers/specs/2026-06-14-hub-validation-pipeline-design.md`.

**Context for implementers:** Branch off `main` (the executor sets this up). The directory is `public/directory.json` (296 entries) built from `data/research/directory-consolidated-2026-06-09.json` via `data/research/build_directory.py`. Curation reaches the build through `data/research/overrides.json` — id-keyed, the build applies keys `website`/`facebook`/`category`/`categories`/`websiteType` (build_directory.py ~line 459). Hidden categories `{junk, online_communities, inactive}` (`lib/directory.ts` HIDDEN_CATEGORIES) drop entries from the map but keep data. `lib/intake/registry.ts` has `loadAggregatorRegistry`/`isAggregatorUrl`. Suite is at 130 tests. The validator contract + Haiku/Sonnet findings come from the 2026-06-14 pilot (in the spec).

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `.claude/agents/hub-validator.md` | Create | The validator agent definition (contract, rules, JSON output) |
| `lib/intake/validation.ts` | Create | Pure logic: result schema, `needsSonnet`, `validationToOverride`, `partitionResults` |
| `scripts/validation-apply.ts` | Create | Read results.json → apply high-confidence via overrides.json, write flags report |
| `data/research/validation/results.json` | Create (seed) | `{ "validatedAt": "", "results": [] }` — the verdict store |
| `data/research/validation/runbook.md` | Create | How the controller dispatches batches + escalates + collects results |
| `data/research/fetch_location_images.py` | Modify | Run on new ids; (optional) Openverse fallback when Wikipedia misses |
| `package.json` | Modify | `validation:apply` script |
| `test/intake-validation.test.ts` | Create | Unit tests for the lib |

Shared types (Task 2, used by Tasks 3 + the runbook):

```ts
export type Disposition = "keep" | "fix" | "inactive" | "junk" | "merge";
export type Confidence = "high" | "medium" | "low";

export interface ValidationFields {
  country?: string; region?: string; category?: string; ages?: string;
  price?: string; season?: string; website?: string; websiteType?: "site" | "social";
}
export interface ValidationResult {
  id: string;
  status: "active" | "dead" | "uncertain";
  confidence: Confidence;
  fields: ValidationFields;
  latestSignOfLife?: string;
  dupOf?: string | null;
  disposition: Disposition;
  evidence?: string[];
  note?: string;
  model?: string;            // "haiku" | "sonnet" — which produced this verdict
}
export interface ResultsFile { validatedAt: string; results: ValidationResult[] }
```

---

### Task 1: hub-validator agent definition

**Files:**
- Create: `.claude/agents/hub-validator.md`
- Create: `data/research/validation/results.json` (content: `{ "validatedAt": "", "results": [] }`)

- [ ] **Step 1: Seed the results store** — create `data/research/validation/results.json` containing exactly:

```json
{ "validatedAt": "", "results": [] }
```

- [ ] **Step 2: Write the agent definition** — create `.claude/agents/hub-validator.md`:

```markdown
---
name: hub-validator
description: Validates one worldschooling hub from the open web — confirms it's real/active, corrects facts, finds the first-party link, checks for duplicates, and returns a strict-JSON verdict. Dispatch one per hub; read-only (never edits files).
tools: WebFetch, WebSearch, Read
---

You validate ONE worldschooling hub via web research and return STRICT JSON as your
final message. READ-ONLY: never modify files.

## Input (provided in the dispatch prompt)
A hub: id, name, country/region, category, current link (may be empty or an
aggregator URL), and — when relevant — a note that it may duplicate an existing
operator already in the directory.

## Rules
- SOURCE MODEL: a hub's link must be FIRST-PARTY — its own website, or its own
  Facebook/Instagram page/group. These domains are AGGREGATORS and are NEVER
  acceptable as the link (discovery-only): worldschooly.com, famunity.net,
  theworldschoolatlas.com, linkease.app, wanderworks.life. If the current link is an
  aggregator, find the real provider site.
- FRESHNESS: record the newest sign of life (a date on the site/socials/posts).
  Nothing newer than ~18 months ⇒ suspect (possibly defunct).
- CATEGORIES: organic (a town that IS the hub) | permanent_commercial (paid program,
  own venue) | permanent_community (eco-village/intentional community) | popup
  (different organizers per edition) | traveling (one operation, moves location) |
  spanish_immersion (a Spanish school as the hub) | summer_camp (seasonal day/holiday camp).
- EFFORT BOUND: ≤ ~6 web actions, then conclude. NEVER invent — unverifiable ⇒ uncertain.
- DEDUP: if it's the same hub/operator as an existing entry you were told about (or an
  obvious duplicate), set dupOf to that id and disposition "merge".
- You do NOT source images — leave that to a later stage.

## Method
1. Fetch the current link (if any): first-party? live? newest date?
2. Web-search "<name>" <country> worldschool to confirm it's real + active and find the
   official site/socials.
3. If the link is an aggregator or missing, find the real first-party link.
4. Decide duplicate vs new (a new LOCATION of a known operator is NOT a dup; the SAME
   hub already listed IS).

## Output — return EXACTLY this JSON object, nothing around it
{ "id": "<the id>",
  "status": "active|dead|uncertain",
  "confidence": "high|medium|low",
  "fields": { "country":"", "region":"", "category":"", "ages":"", "price":"",
              "season":"", "website":"", "websiteType":"site|social" },
  "latestSignOfLife": "YYYY-MM|unknown",
  "dupOf": "<existing-id|null>",
  "disposition": "keep|fix|inactive|junk|merge",
  "evidence": ["url — what it showed"],
  "note": "one sentence" }

Fill `fields` only where you confirmed a value (else ""). Disposition: keep=valid as-is;
fix=valid, apply corrected fields/link; inactive=real but no working link; junk=not a
real hub / dead/phantom listing; merge=duplicate of dupOf. confidence=high only when the
evidence is unambiguous.
```

- [ ] **Step 3: Smoke-test the agent** — dispatch it once on a known hub to confirm it returns valid JSON. From a Claude session: dispatch `hub-validator` on `harmony-learning-center` (name "Harmony Learning Center", link `https://harmonyeducation.net/`). Expected: JSON with `status:"active"`, a `website`, a `disposition`. (This is a manual dispatch check — the agent file itself isn't unit-tested.)

- [ ] **Step 4: Commit**

```bash
git add .claude/agents/hub-validator.md data/research/validation/results.json
git commit -m "feat: hub-validator agent definition + results store"
```

---

### Task 2: Validation logic lib (schema, escalation, override mapping)

**Files:**
- Create: `lib/intake/validation.ts`
- Test: `test/intake-validation.test.ts`

- [ ] **Step 1: Write the failing tests** — create `test/intake-validation.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  needsSonnet, validationToOverride, partitionResults,
  type ValidationResult, type HubForValidation,
} from "../lib/intake/validation";

const REG = { "worldschooly.com": { note: "" }, "wanderworks.life": { note: "" } };

const hub = (o: Partial<HubForValidation>): HubForValidation =>
  ({ id: "x", name: "X", country: "Y", category: "permanent_commercial", website: "https://x.com", ...o });

describe("needsSonnet (escalation triggers)", () => {
  it("escalates when the hub has no link", () => {
    expect(needsSonnet(hub({ website: "" }), [])).toBe(true);
  });
  it("escalates when the hub is currently inactive (recheck)", () => {
    expect(needsSonnet(hub({ category: "inactive" }), [])).toBe(true);
  });
  it("escalates when the name overlaps an existing operator (dup-candidate)", () => {
    expect(needsSonnet(hub({ name: "Bliss Hub Siem Reap" }), ["Bliss Hubs Pai"])).toBe(true);
  });
  it("escalates when a prior haiku result was not high-confidence", () => {
    expect(needsSonnet(hub({}), [], { confidence: "low" } as ValidationResult)).toBe(true);
    expect(needsSonnet(hub({}), [], { confidence: "medium" } as ValidationResult)).toBe(true);
  });
  it("does NOT escalate a clear hub with a link and a high-confidence haiku verdict", () => {
    expect(needsSonnet(hub({}), ["Unrelated Place"], { confidence: "high" } as ValidationResult)).toBe(false);
  });
});

const res = (o: Partial<ValidationResult>): ValidationResult =>
  ({ id: "h", status: "active", confidence: "high", fields: {}, disposition: "keep", ...o });

describe("validationToOverride (high-confidence only)", () => {
  it("keep → null (no-op)", () => {
    expect(validationToOverride(res({ disposition: "keep" }), REG)).toBeNull();
  });
  it("fix → website + websiteType + category from fields", () => {
    expect(validationToOverride(res({ disposition: "fix",
      fields: { website: "https://whalecamp.com/", websiteType: "site", category: "summer_camp" } }), REG))
      .toEqual({ website: "https://whalecamp.com/", websiteType: "site", category: "summer_camp" });
  });
  it("fix strips an aggregator website (never link to one)", () => {
    expect(validationToOverride(res({ disposition: "fix",
      fields: { website: "https://wanderworks.life/camp/x", websiteType: "site" } }), REG))
      .toBeNull();
  });
  it("junk → hidden junk category", () => {
    expect(validationToOverride(res({ disposition: "junk" }), REG)).toEqual({ category: "junk" });
  });
  it("inactive → hidden inactive category", () => {
    expect(validationToOverride(res({ disposition: "inactive" }), REG)).toEqual({ category: "inactive" });
  });
  it("merge → hide the duplicate via junk", () => {
    expect(validationToOverride(res({ disposition: "merge", dupOf: "bliss-hubs-siem-reap" }), REG))
      .toEqual({ category: "junk" });
  });
  it("medium/low confidence → null (flagged, never auto-applied)", () => {
    expect(validationToOverride(res({ confidence: "low", disposition: "junk" }), REG)).toBeNull();
    expect(validationToOverride(res({ confidence: "medium", disposition: "fix",
      fields: { website: "https://x.com" } }), REG)).toBeNull();
  });
});

describe("partitionResults", () => {
  it("splits into auto-apply vs flag", () => {
    const results = [
      res({ id: "a", confidence: "high", disposition: "fix", fields: { website: "https://a.com" } }),
      res({ id: "b", confidence: "high", disposition: "keep" }),         // no-op → neither
      res({ id: "c", confidence: "low", disposition: "junk" }),          // flag
      res({ id: "d", confidence: "high", disposition: "junk" }),         // apply
      res({ id: "e", confidence: "medium", disposition: "fix", fields: { website: "https://e.com" } }), // flag
    ];
    const { apply, flag } = partitionResults(results, REG);
    expect(apply.map((r) => r.id).sort()).toEqual(["a", "d"]);
    expect(flag.map((r) => r.id).sort()).toEqual(["c", "e"]);
  });
});
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run test/intake-validation.test.ts` (cannot resolve module).

- [ ] **Step 3: Implement `lib/intake/validation.ts`**

```ts
import { isAggregatorUrl, type AggregatorRegistry } from "./registry";

export type Disposition = "keep" | "fix" | "inactive" | "junk" | "merge";
export type Confidence = "high" | "medium" | "low";

export interface ValidationFields {
  country?: string; region?: string; category?: string; ages?: string;
  price?: string; season?: string; website?: string; websiteType?: "site" | "social";
}
export interface ValidationResult {
  id: string;
  status: "active" | "dead" | "uncertain";
  confidence: Confidence;
  fields: ValidationFields;
  latestSignOfLife?: string;
  dupOf?: string | null;
  disposition: Disposition;
  evidence?: string[];
  note?: string;
  model?: string;
}
export interface ResultsFile { validatedAt: string; results: ValidationResult[] }

export interface HubForValidation {
  id: string; name: string; country: string; category: string; website: string;
}

export interface OverrideEntry {
  website?: string; websiteType?: "site" | "social"; category?: string; facebook?: string;
}

function firstWord(s: string): string {
  return (s || "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").trim().split(/\s+/)[0] ?? "";
}

/** Does this hub need the stronger model? True when it's a hard case:
 *  no link, currently inactive (recheck), a dup-candidate (its leading name word
 *  matches an existing operator's), or a prior haiku verdict wasn't high-confidence. */
export function needsSonnet(
  hub: HubForValidation,
  existingOperatorNames: string[],
  haikuResult?: ValidationResult,
): boolean {
  if (!hub.website.trim()) return true;
  if (hub.category === "inactive") return true;
  if (haikuResult && haikuResult.confidence !== "high") return true;
  const w = firstWord(hub.name);
  if (w.length >= 4 && existingOperatorNames.some((n) => firstWord(n) === w)) return true;
  return false;
}

/** High-confidence verdict → the override to apply, or null (no-op / flagged). */
export function validationToOverride(
  r: ValidationResult,
  registry: AggregatorRegistry,
): OverrideEntry | null {
  if (r.confidence !== "high") return null;
  switch (r.disposition) {
    case "keep":
      return null;
    case "junk":
    case "merge":
      return { category: "junk" };
    case "inactive":
      return { category: "inactive" };
    case "fix": {
      const o: OverrideEntry = {};
      const url = r.fields.website?.trim();
      if (url && !isAggregatorUrl(url, registry)) {
        o.website = url;
        o.websiteType = r.fields.websiteType ?? "site";
      }
      if (r.fields.category) o.category = r.fields.category;
      return Object.keys(o).length ? o : null;
    }
  }
}

/** Partition results into auto-apply (produces an override) vs flag (everything that
 *  needed a human: medium/low confidence, or unverifiable). keep@high is neither. */
export function partitionResults(
  results: ValidationResult[],
  registry: AggregatorRegistry,
): { apply: ValidationResult[]; flag: ValidationResult[] } {
  const apply: ValidationResult[] = [];
  const flag: ValidationResult[] = [];
  for (const r of results) {
    if (validationToOverride(r, registry)) apply.push(r);
    else if (r.confidence !== "high") flag.push(r);
    // else: high-confidence keep → no action
  }
  return { apply, flag };
}
```

- [ ] **Step 4: Run tests** (`npx vitest run test/intake-validation.test.ts` PASS) and `npm test` (130 + 13 = 143). **Commit:**

```bash
git add lib/intake/validation.ts test/intake-validation.test.ts
git commit -m "feat: validation lib — escalation triggers, confidence-gated override mapping"
```

---

### Task 3: validation-apply script

**Files:**
- Create: `scripts/validation-apply.ts`
- Modify: `package.json`

- [ ] **Step 1: Implement `scripts/validation-apply.ts`**

```ts
/**
 * Apply hub-validation verdicts:
 *   - high-confidence (fix/junk/inactive/merge) → merged into data/research/overrides.json
 *   - everything that needed a human (medium/low confidence) → docs/validation-flags-YYYY-MM-DD.md
 *   - high-confidence keep → no action
 * Reuses the existing overrides.json → build_directory.py apply path.
 *
 * Usage: npm run validation:apply
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { loadAggregatorRegistry } from "../lib/intake/registry";
import {
  partitionResults, validationToOverride,
  type ResultsFile, type ValidationResult, type OverrideEntry,
} from "../lib/intake/validation";

const ROOT = process.cwd();
const RESEARCH = join(ROOT, "data", "research");
const RESULTS = join(RESEARCH, "validation", "results.json");
const OVERRIDES = join(RESEARCH, "overrides.json");

function main() {
  if (!existsSync(RESULTS)) {
    console.error(`${RESULTS} not found — run the validator first (see validation/runbook.md).`);
    process.exit(1);
  }
  const results = (JSON.parse(readFileSync(RESULTS, "utf8")) as ResultsFile).results;
  const registry = loadAggregatorRegistry();
  const existing: Record<string, OverrideEntry> = existsSync(OVERRIDES)
    ? JSON.parse(readFileSync(OVERRIDES, "utf8"))
    : {};

  const { apply, flag } = partitionResults(results, registry);

  // merge auto-applies into overrides.json (sorted, indent 2 — matches the committed file)
  const merged: Record<string, OverrideEntry> = { ...existing };
  for (const r of apply) {
    const o = validationToOverride(r, registry)!;
    merged[r.id] = { ...merged[r.id], ...o };
  }
  const sorted = Object.fromEntries(Object.entries(merged).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(OVERRIDES, JSON.stringify(sorted, null, 2) + "\n");

  // flags report for the human-review minority
  const date = new Date().toISOString().slice(0, 10);
  const FLAGS = join(ROOT, "docs", `validation-flags-${date}.md`);
  const cell = (s: unknown) => String(s ?? "—").replace(/[\r\n]+/g, " ").replace(/\|/g, "\\|");
  let md = `# Validation flags — ${date}\n\n${flag.length} hubs need your eyes (medium/low confidence). ` +
    `${apply.length} high-confidence verdicts were auto-applied to overrides.json.\n\n` +
    `| id | status | conf | disposition | dupOf | note | evidence |\n|---|---|---|---|---|---|---|\n`;
  for (const r of flag) {
    md += `| ${cell(r.id)} | ${cell(r.status)} | ${cell(r.confidence)} | ${cell(r.disposition)} | ` +
      `${cell(r.dupOf)} | ${cell(r.note)} | ${cell((r.evidence ?? []).join("; "))} |\n`;
  }
  md += `\n## How to act\nReview each row; to apply one, add its fix to \`data/research/overrides.json\` by hand, ` +
    `then rebuild (\`cd data/research && ./make.sh --no-fetch && cd .. && npm run build:explorer\`).\n`;
  writeFileSync(FLAGS, md);

  console.log(`applied ${apply.length} high-confidence → overrides.json (${Object.keys(sorted).length} total) | ` +
    `flagged ${flag.length} → ${FLAGS}`);
}

main();
```

- [ ] **Step 2: npm script** — in `package.json` after `"inbox:apply"`:

```json
    "validation:apply": "tsx scripts/validation-apply.ts",
```

- [ ] **Step 3: Dry-run (no trace).** Write a temp results file with one high-confidence fix + one low-confidence flag, apply, verify, then restore:

```bash
cp data/research/overrides.json /tmp/ov-backup.json
cp data/research/validation/results.json /tmp/res-backup.json
printf '%s' '{ "validatedAt":"t", "results":[
 {"id":"harmony-learning-center","status":"active","confidence":"high","fields":{"website":"https://harmonyeducation.net/","websiteType":"site","category":"permanent_commercial"},"disposition":"fix","note":"t"},
 {"id":"eco-holistic-kids-club","status":"uncertain","confidence":"low","fields":{},"disposition":"fix","note":"FB blocked","evidence":["fb — blocked"]} ]}' > data/research/validation/results.json
npm run validation:apply
```

Expected: `applied 1 ... flagged 1 → docs/validation-flags-<date>.md`. Check `jq '."harmony-learning-center"' data/research/overrides.json` shows the website; check the flags md lists `eco-holistic-kids-club`.

- [ ] **Step 4: Restore + clean up**

```bash
cp /tmp/ov-backup.json data/research/overrides.json
cp /tmp/res-backup.json data/research/validation/results.json
rm -f docs/validation-flags-*.md /tmp/ov-backup.json /tmp/res-backup.json
git status --porcelain
```

Expected: only ` M .gitignore`, plus untracked `scripts/validation-apply.ts` and the `package.json` mod.

- [ ] **Step 5: `npm test` (143) and commit**

```bash
git add scripts/validation-apply.ts package.json
git commit -m "feat: validation:apply — confidence-gated overrides + flags report"
```

---

### Task 4: Image stage (reuse existing fetchers on corrected links)

**Files:**
- Modify: `data/research/fetch_location_images.py` (only if an Openverse fallback is wanted; otherwise this task is documentation + a verification run)

The free location-photo rung already exists: `fetch_location_images.py` downloads a Wikipedia place photo per id into `hub-images/<id>.jpg` + `images-map.json`, skipping ids that already have a real image. The own-photo rung is `fetch_images.py` (og:image/favicon). The image stage = run both on the (now validator-corrected) entries. The spec's "free stock first" order is satisfied by running `fetch_location_images.py` and letting `fetch_images.py` fill only what's still bare; the existing `make.sh` already chains them.

- [ ] **Step 1: Confirm the reuse works on a new entry.** Pick a placed new entry with no real image (e.g. the Slovakia hub) and run the location fetcher for just it:

```bash
cd data/research && python3 fetch_location_images.py 2>&1 | tail -5 && cd ..
jq '."naturally-richer-high-tatras-and-central-s" // "no-image"' data/research/images-map.json
```

Expected: it attempts new ids and writes `hub-images/<id>.jpg` for those with a resolvable place; the Slovakia hub gets a High-Tatras photo or is skipped if Wikipedia has none. (Network-dependent; a miss is acceptable — the placeholder remains.)

- [ ] **Step 2 (optional, only if Wikipedia coverage is poor): add an Openverse fallback.** In `fetch_location_images.py`, after the Wikipedia lookup fails for an entry, query Openverse (free, no key) and use its top CC image. Add near the existing per-entry fetch logic:

```python
def openverse_image(query):
    try:
        u = "https://api.openverse.org/v1/images/?q=" + urllib.parse.quote(query) + "&page_size=1&license_type=all-cc"
        data = json.loads(fetch(u))
        results = data.get("results") or []
        return results[0].get("url") if results else None
    except Exception:
        return None
```

and call it as a fallback when the Wikipedia query chain returns nothing for an entry (mirror how the existing code decides "no image found" and, before giving up, try `openverse_image(place_queries(e)[0])`). Keep it behind the same "only entries still bare" guard so it never overwrites a real own-photo.

- [ ] **Step 3: Restore any test images + commit** (only if Step 2 changed the file):

```bash
git checkout -- data/research/images-map.json 2>/dev/null || true
git add data/research/fetch_location_images.py
git commit -m "feat: Openverse fallback for location images when Wikipedia misses"
```

(If Step 2 was skipped, this task contributes no commit — it is a verification that the existing image scripts cover the stage; note that in the task report.)

---

### Task 5: Orchestration runbook

**Files:**
- Create: `data/research/validation/runbook.md`

- [ ] **Step 1: Write `data/research/validation/runbook.md`**

```markdown
# Hub-validation orchestration runbook

The controller (main session) runs validation in batches. This is controller
procedure — dispatching agents is not scriptable. The apply + image steps ARE
scripted (`npm run validation:apply`, the image fetchers).

## Inputs
- Targets: hubs to validate. Default order: the unvalidated subset first
  (entries whose `validity` contains "inbox-approved" in
  `data/research/directory-consolidated-2026-06-09.json`, plus any current inbox
  candidates), then the rest of the 296.
- Existing operator names (for dedup-escalation): the `name` of every directory entry.

## Per batch (~10 hubs)
1. Build each hub's input from the directory JSON (id, name, country, region,
   category, website).
2. For each hub, decide the model with `needsSonnet(hub, existingOperatorNames)`
   (lib/intake/validation.ts): no link / inactive / dup-candidate ⇒ Sonnet now;
   otherwise dispatch Haiku.
3. Dispatch the `hub-validator` agent per hub IN PARALLEL (one Agent call each,
   all in one message). Each returns the strict-JSON verdict.
4. ESCALATE: for any Haiku verdict with confidence ≠ "high", re-dispatch that hub
   on Sonnet; the Sonnet verdict replaces it. Tag each kept verdict with `model`.
5. Append the batch's verdicts to `data/research/validation/results.json`
   (dedupe by id — a re-validation overwrites the prior verdict).

## After batches
6. `npm run validation:apply` — auto-applies high-confidence verdicts to
   overrides.json, writes the flags report for the rest.
7. Image stage: `cd data/research && python3 fetch_images.py && python3
   fetch_location_images.py && cd ..` (own photo + free location photo on the
   corrected links).
8. Rebuild: `cd data/research && ./make.sh --no-fetch && cd .. && npm run build:explorer`.
9. Commit the batch (results.json + overrides.json + regenerated artifacts + images).
10. Review `docs/validation-flags-<date>.md` for the flagged minority.

## Discipline
- Never auto-apply medium/low confidence — those are flags only.
- An aggregator URL is never written as a link (validationToOverride strips it).
- Each batch commits independently so a bad batch is revertible.
```

- [ ] **Step 2: Commit**

```bash
git add data/research/validation/runbook.md
git commit -m "docs: hub-validation orchestration runbook"
```

---

### Task 6: First real validation batch + apply

**Files:** runtime — `data/research/validation/results.json`, `overrides.json`, regenerated artifacts, images.

- [ ] **Step 1: Select the first batch.** From `public/directory.json`, take ~10 unvalidated entries (validity contains "inbox-approved"), spanning: some with a link, some without, a dup-candidate, a summer_camp, an `inactive`. (The 2026-06-14 pilot already validated 10; this batch is the next 10, or re-uses the pilot's 10 if re-running end-to-end.)

- [ ] **Step 2: Run the runbook's per-batch loop** for these 10: build inputs, `needsSonnet` to pick the model, dispatch `hub-validator` in parallel, escalate non-high Haiku verdicts to Sonnet, append verdicts to `results.json`.

- [ ] **Step 3: Apply + image + rebuild:**

```bash
npm run validation:apply
cd data/research && python3 fetch_images.py && python3 fetch_location_images.py && ./make.sh --no-fetch && cd ..
npm run build:explorer
```

- [ ] **Step 4: Verify.** `npm test` (143 green). Spot-check that a `fix` verdict's corrected website is in `public/directory.json` for that id; that a `junk`/`inactive` verdict's entry is hidden (not on map); that flagged hubs appear in `docs/validation-flags-<date>.md` and were NOT auto-changed.

- [ ] **Step 5: Commit + hand off.**

```bash
git add data/research/validation/results.json data/research/overrides.json data/research/directory-consolidated-2026-06-09.json data/research/directory-consolidated-2026-06-09.csv data/research/hub-directory-report-2026-06-09.html data/research/images-map.json data/research/hub-images public/directory.json public/directory-images docs/validation-flags-*.md
git commit -m "data: first hub-validation batch — applied high-confidence, flagged the rest"
```

Report: per-hub verdicts + models used (how many escalated), what auto-applied, what was flagged, and cost/time so the user can decide the rollout pace for the remaining ~140 + the rest of the 296.

---

## Out of scope (per spec)
- Image generation (free real imagery only).
- Re-running discovery (Stage 2 owns it).
- Scheduling on a cron.
- Field-by-field record merging for duplicates (merge hides the dup; combining is a later curation pass).
