# Stage 1: Link Audit & Source Model Foundations — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Audit all 175 directory entries' links, enforce the aggregator/provider source model, and give the user a review→apply loop that fixes wrong links and prunes junk.

**Architecture:** Pure logic lives in `lib/intake/` (vitest-tested); thin tsx scripts in `scripts/` orchestrate fetch → classify → report → apply. Approved fixes land in `data/research/overrides.json`, which `build_directory.py` applies by entry id during its enrichment loop — intake never writes `directory-consolidated-*.json` directly. Provider-link hunting for flagged entries is agent work driven by a runbook prompt, writing `proposedUrl` fields back into `link-audit.json`.

**Tech Stack:** TypeScript via tsx (Node 20 global `fetch`), vitest, Python 3 (existing `build_directory.py`), JSON data files in `data/research/`.

**Spec:** `docs/superpowers/specs/2026-06-12-directory-enrichment-methodology-design.md` (this plan implements the source model + Stage 1 + review workflow; Stages 2 and 3 get separate plans).

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `data/research/aggregator-domains.json` | Create | Registry of aggregator domains (discovery-only, never linkable) |
| `lib/intake/registry.ts` | Create | URL normalization, domain extraction, aggregator checks |
| `lib/intake/audit.ts` | Create | Verdict classification, freshness extraction, suspected-aggregator detection |
| `lib/intake/apply.ts` | Create | Pure merge: audit records + user decisions → overrides |
| `scripts/audit-links.ts` | Create | Fetch all entry URLs, classify, write `data/research/link-audit.json` |
| `scripts/audit-report.ts` | Create | Render `docs/link-audit-YYYY-MM-DD.md` from `link-audit.json` |
| `scripts/audit-apply.ts` | Create | Merge decisions into `data/research/overrides.json` |
| `data/research/overrides.json` | Create | id → {website, websiteType, category} applied last by the build |
| `data/research/build_directory.py` | Modify (~line 392) | Apply overrides after id assignment, before summary/refs |
| `data/research/provider-resolution-prompt.md` | Create | Agent runbook for hunting provider links for flagged entries |
| `package.json` | Modify | Add `audit:links`, `audit:report`, `audit:apply` scripts |
| `test/intake-registry.test.ts`, `test/intake-audit.test.ts`, `test/intake-apply.test.ts` | Create | Unit tests |

Key shared types (defined in Task 2, used by Tasks 3–6):

```ts
type LinkVerdict =
  | "ok-provider" | "ok-social" | "aggregator-link" | "redirected"
  | "parked" | "unreachable" | "dead" | "no-url";

interface AuditRecord {
  id: string; name: string; category: string; country: string;
  url: string | null;            // normalized URL that was fetched (null = entry has no website)
  status: number | null;         // HTTP status, null on network failure
  finalUrl: string | null;       // URL after redirects
  verdict: LinkVerdict;
  latestYear: number | null;     // newest plausible year mentioned in the page body
  checkedAt: string;             // ISO timestamp
  // written by the resolution agent (Task 7), preserved across re-runs:
  proposedUrl?: string | null;
  proposedUrlType?: "site" | "social";
  proposedCategory?: "junk";
  resolutionNote?: string;
}

interface AuditFile {
  generatedAt: string;
  counts: Record<string, number>;       // verdict → count
  suspectedAggregators: string[];       // domains serving ≥3 entries, not yet in registry
  records: AuditRecord[];
}
```

---

### Task 1: Aggregator registry + URL helpers

**Files:**
- Create: `data/research/aggregator-domains.json`
- Create: `lib/intake/registry.ts`
- Test: `test/intake-registry.test.ts`

- [ ] **Step 1: Seed the registry data file**

Create `data/research/aggregator-domains.json`:

```json
{
  "worldschooly.com": { "note": "aggregator directory" },
  "famunity.net": { "note": "aggregator directory" },
  "theworldschoolatlas.com": { "note": "aggregator; low freshness — many out-of-date links (user observation 2026-06)" },
  "linkease.app": { "note": "paid atlas/calendar PDFs; do not ingest content (compilation copyright)" }
}
```

- [ ] **Step 2: Write the failing tests**

Create `test/intake-registry.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { normalizeUrl, domainOf, isAggregatorUrl, loadAggregatorRegistry } from "../lib/intake/registry";

const REG = { "worldschooly.com": { note: "" }, "theworldschoolatlas.com": { note: "" } };

describe("normalizeUrl", () => {
  it("returns null for empty/blank", () => {
    expect(normalizeUrl("")).toBeNull();
    expect(normalizeUrl("  ")).toBeNull();
    expect(normalizeUrl(undefined)).toBeNull();
  });
  it("adds https:// to scheme-less urls (the directory's common case)", () => {
    expect(normalizeUrl("worldschooly.com/hub/harmony-learning-center/"))
      .toBe("https://worldschooly.com/hub/harmony-learning-center/");
  });
  it("keeps existing scheme", () => {
    expect(normalizeUrl("http://example.com")).toBe("http://example.com");
  });
});

describe("domainOf", () => {
  it("strips www. and lowercases", () => {
    expect(domainOf("https://WWW.Example.com/x")).toBe("example.com");
  });
  it("works on scheme-less input", () => {
    expect(domainOf("boundless.life/hubs")).toBe("boundless.life");
  });
  it("returns empty string for garbage", () => {
    expect(domainOf("ht!tp://///")).toBe("");
  });
});

describe("isAggregatorUrl", () => {
  it("matches registry domains and subdomains", () => {
    expect(isAggregatorUrl("https://worldschooly.com/hub/x", REG)).toBe(true);
    expect(isAggregatorUrl("https://app.worldschooly.com/x", REG)).toBe(true);
  });
  it("does not match providers or null", () => {
    expect(isAggregatorUrl("https://boundless.life", REG)).toBe(false);
    expect(isAggregatorUrl(null, REG)).toBe(false);
  });
});

describe("loadAggregatorRegistry", () => {
  it("loads the checked-in registry with its seed domains", () => {
    const reg = loadAggregatorRegistry();
    expect(reg["worldschooly.com"]).toBeDefined();
    expect(reg["famunity.net"]).toBeDefined();
  });
});
```

- [ ] **Step 3: Run tests, verify they fail**

Run: `npx vitest run test/intake-registry.test.ts`
Expected: FAIL — cannot resolve `../lib/intake/registry`.

- [ ] **Step 4: Implement `lib/intake/registry.ts`**

```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";

export type AggregatorRegistry = Record<string, { note: string }>;

const DEFAULT_PATH = join(process.cwd(), "data", "research", "aggregator-domains.json");

export function loadAggregatorRegistry(path: string = DEFAULT_PATH): AggregatorRegistry {
  return JSON.parse(readFileSync(path, "utf8")) as AggregatorRegistry;
}

/** Blank → null; scheme-less directory urls get https://. */
export function normalizeUrl(raw: string | null | undefined): string | null {
  const s = (raw ?? "").trim();
  if (!s) return null;
  return /^https?:\/\//i.test(s) ? s : `https://${s}`;
}

/** Hostname without leading www., lowercased; "" when unparsable. */
export function domainOf(url: string): string {
  const n = normalizeUrl(url);
  if (!n) return "";
  try {
    return new URL(n).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

export function isAggregatorUrl(url: string | null, registry: AggregatorRegistry): boolean {
  if (!url) return false;
  const d = domainOf(url);
  if (!d) return false;
  return Object.keys(registry).some((agg) => d === agg || d.endsWith("." + agg));
}
```

- [ ] **Step 5: Run tests, verify they pass**

Run: `npx vitest run test/intake-registry.test.ts`
Expected: PASS (all).

- [ ] **Step 6: Commit**

```bash
git add data/research/aggregator-domains.json lib/intake/registry.ts test/intake-registry.test.ts
git commit -m "feat: aggregator domain registry + URL helpers for intake source model"
```

---

### Task 2: Verdict classification + freshness

**Files:**
- Create: `lib/intake/audit.ts`
- Test: `test/intake-audit.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `test/intake-audit.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  classifyLink, latestYearMentioned, suspectedAggregatorDomains, isSocialUrl,
} from "../lib/intake/audit";

const REG = { "worldschooly.com": { note: "" } };
const ok = (url: string, finalUrl = url, bodyText = "welcome 2026") =>
  ({ url, status: 200, finalUrl, bodyText });

describe("classifyLink", () => {
  it("aggregator domains → aggregator-link (the Harmony case)", () => {
    expect(classifyLink(ok("https://worldschooly.com/hub/harmony-learning-center/"), REG))
      .toBe("aggregator-link");
  });
  it("first-party social → ok-social", () => {
    expect(classifyLink(ok("https://facebook.com/groups/somehub"), REG)).toBe("ok-social");
    expect(classifyLink(ok("https://www.instagram.com/somehub/"), REG)).toBe("ok-social");
  });
  it("own site → ok-provider", () => {
    expect(classifyLink(ok("https://boundless.life/hubs"), REG)).toBe("ok-provider");
  });
  it("redirect that lands on an aggregator is aggregator-link, not redirected", () => {
    expect(classifyLink(ok("https://somehub.com", "https://worldschooly.com/hub/x"), REG))
      .toBe("aggregator-link");
  });
  it("cross-domain redirect → redirected", () => {
    expect(classifyLink(ok("https://oldhub.com", "https://newhub.org"), REG)).toBe("redirected");
  });
  it("same-domain redirect stays ok-provider", () => {
    expect(classifyLink(ok("https://hub.com", "https://hub.com/en/home"), REG)).toBe("ok-provider");
  });
  it("parked page text → parked", () => {
    expect(classifyLink(ok("https://hub.com", "https://hub.com", "This domain is for sale!"), REG))
      .toBe("parked");
  });
  it("first failure → unreachable", () => {
    expect(classifyLink({ url: "https://x.com", status: null, finalUrl: null, bodyText: "" }, REG))
      .toBe("unreachable");
    expect(classifyLink({ url: "https://x.com", status: 404, finalUrl: "https://x.com", bodyText: "" }, REG))
      .toBe("unreachable");
  });
  it("second failure ≥7 days after a previous unreachable → dead", () => {
    const prev = { verdict: "unreachable" as const, checkedAt: "2026-06-01T00:00:00Z" };
    expect(classifyLink(
      { url: "https://x.com", status: null, finalUrl: null, bodyText: "" },
      REG, prev, "2026-06-12T00:00:00Z",
    )).toBe("dead");
  });
  it("second failure only 2 days later stays unreachable", () => {
    const prev = { verdict: "unreachable" as const, checkedAt: "2026-06-10T00:00:00Z" };
    expect(classifyLink(
      { url: "https://x.com", status: null, finalUrl: null, bodyText: "" },
      REG, prev, "2026-06-12T00:00:00Z",
    )).toBe("unreachable");
  });
});

describe("latestYearMentioned", () => {
  it("returns the max plausible year", () => {
    expect(latestYearMentioned("sessions in 2023 and spring 2025!")).toBe(2025);
  });
  it("ignores implausible far-future years and returns null when none", () => {
    expect(latestYearMentioned("call 2099-555 now")).toBeNull();
    expect(latestYearMentioned("no years here")).toBeNull();
  });
});

describe("suspectedAggregatorDomains", () => {
  it("flags domains serving ≥3 entries that are not registry or social", () => {
    const urls = [
      "https://hubdir.org/a", "https://hubdir.org/b", "https://hubdir.org/c",
      "https://worldschooly.com/x", "https://worldschooly.com/y", "https://worldschooly.com/z",
      "https://facebook.com/1", "https://facebook.com/2", "https://facebook.com/3",
      "https://unique-provider.com/",
    ];
    expect(suspectedAggregatorDomains(urls, REG)).toEqual(["hubdir.org"]);
  });
});

describe("isSocialUrl", () => {
  it("covers fb/ig/whatsapp/telegram/linktree", () => {
    for (const u of [
      "https://m.facebook.com/x", "https://fb.me/x", "https://instagram.com/x",
      "https://chat.whatsapp.com/x", "https://t.me/x", "https://linktr.ee/x",
    ]) expect(isSocialUrl(u)).toBe(true);
    expect(isSocialUrl("https://boundless.life")).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests, verify they fail**

Run: `npx vitest run test/intake-audit.test.ts`
Expected: FAIL — cannot resolve `../lib/intake/audit`.

- [ ] **Step 3: Implement `lib/intake/audit.ts`**

```ts
import { domainOf, isAggregatorUrl, type AggregatorRegistry } from "./registry";

export type LinkVerdict =
  | "ok-provider" | "ok-social" | "aggregator-link" | "redirected"
  | "parked" | "unreachable" | "dead" | "no-url";

const SOCIAL_DOMAINS = new Set([
  "facebook.com", "m.facebook.com", "fb.com", "fb.me",
  "instagram.com", "chat.whatsapp.com", "whatsapp.com", "t.me", "linktr.ee",
]);

export function isSocialUrl(url: string): boolean {
  const d = domainOf(url);
  if (!d) return false;
  return SOCIAL_DOMAINS.has(d) || [...SOCIAL_DOMAINS].some((s) => d.endsWith("." + s));
}

export interface FetchOutcome {
  url: string;
  status: number | null;   // null = network error / timeout
  finalUrl: string | null; // after redirects
  bodyText: string;        // "" on failure
}

export interface PrevCheck { verdict: LinkVerdict; checkedAt: string }

const PARKED_RE =
  /(domain (is|may be) for sale|buy this domain|domain parking|parked free|this domain has expired)/i;

const DAY_MS = 86_400_000;

export function classifyLink(
  outcome: FetchOutcome,
  registry: AggregatorRegistry,
  prev?: PrevCheck,
  nowIso: string = new Date().toISOString(),
): LinkVerdict {
  const failed = outcome.status === null || outcome.status >= 400;
  if (failed) {
    if (prev && (prev.verdict === "dead" ||
        (prev.verdict === "unreachable" &&
         Date.parse(nowIso) - Date.parse(prev.checkedAt) >= 7 * DAY_MS))) {
      return "dead";
    }
    return "unreachable";
  }
  const target = outcome.finalUrl || outcome.url;
  if (isAggregatorUrl(target, registry)) return "aggregator-link";
  if (isSocialUrl(target)) return "ok-social";
  if (PARKED_RE.test(outcome.bodyText)) return "parked";
  if (domainOf(target) !== domainOf(outcome.url)) return "redirected";
  return "ok-provider";
}

/** Newest year in the text, capped at currentYear+2 to skip phone numbers etc. */
export function latestYearMentioned(
  text: string,
  currentYear: number = new Date().getFullYear(),
): number | null {
  let max: number | null = null;
  for (const m of text.matchAll(/\b(20[0-9]{2})\b/g)) {
    const y = Number(m[1]);
    if (y <= currentYear + 2 && (max === null || y > max)) max = y;
  }
  return max;
}

/** Domains used by ≥3 entries that are neither registered aggregators nor social. */
export function suspectedAggregatorDomains(
  urls: string[],
  registry: AggregatorRegistry,
): string[] {
  const counts = new Map<string, number>();
  for (const u of urls) {
    const d = domainOf(u);
    if (!d || isAggregatorUrl(u, registry) || isSocialUrl(u)) continue;
    counts.set(d, (counts.get(d) ?? 0) + 1);
  }
  return [...counts.entries()].filter(([, n]) => n >= 3).map(([d]) => d).sort();
}
```

- [ ] **Step 4: Run tests, verify they pass**

Run: `npx vitest run test/intake-audit.test.ts`
Expected: PASS (all).

- [ ] **Step 5: Run the whole suite to check nothing broke**

Run: `npm test`
Expected: PASS (existing cost/directory/feedback/hub/season tests + the two new files).

- [ ] **Step 6: Commit**

```bash
git add lib/intake/audit.ts test/intake-audit.test.ts
git commit -m "feat: link verdict classification, freshness, suspected-aggregator detection"
```

---

### Task 3: Audit fetcher script

**Files:**
- Create: `scripts/audit-links.ts`
- Modify: `package.json` (scripts block)

No unit test for this file — it is thin orchestration over the Task 1–2 libs (which are tested); it is verified by running it.

- [ ] **Step 1: Implement `scripts/audit-links.ts`**

```ts
/**
 * Stage-1 link audit: fetch every directory entry's website URL, classify it
 * against the aggregator/provider source model, write data/research/link-audit.json.
 *
 * Re-runs preserve agent-written resolution fields (proposedUrl etc.) and feed
 * previous verdicts into the two-failures-≥7-days-apart "dead" rule.
 *
 * Usage: npm run audit:links            (all entries)
 *        npm run audit:links -- --limit 10   (smoke test on first 10)
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { loadAggregatorRegistry, normalizeUrl } from "../lib/intake/registry";
import {
  classifyLink, latestYearMentioned, suspectedAggregatorDomains,
  type FetchOutcome, type LinkVerdict, type PrevCheck,
} from "../lib/intake/audit";

const RESEARCH = join(process.cwd(), "data", "research");
const SRC = join(RESEARCH, "directory-consolidated-2026-06-09.json");
const OUT = join(RESEARCH, "link-audit.json");
const CONCURRENCY = 8;
const TIMEOUT_MS = 15_000;

interface Entry { id: string; name: string; category: string; country: string; website: string }

interface AuditRecord {
  id: string; name: string; category: string; country: string;
  url: string | null; status: number | null; finalUrl: string | null;
  verdict: LinkVerdict; latestYear: number | null; checkedAt: string;
  proposedUrl?: string | null; proposedUrlType?: "site" | "social";
  proposedCategory?: "junk"; resolutionNote?: string;
}

interface AuditFile {
  generatedAt: string;
  counts: Record<string, number>;
  suspectedAggregators: string[];
  records: AuditRecord[];
}

async function fetchOutcome(url: string): Promise<FetchOutcome> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: ctl.signal,
      headers: { "user-agent": "Mozilla/5.0 (compatible; worldschooling-directory-audit)" },
    });
    const text = (await res.text()).slice(0, 50_000);
    return { url, status: res.status, finalUrl: res.url, bodyText: text };
  } catch {
    return { url, status: null, finalUrl: null, bodyText: "" };
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  const limitArg = process.argv.indexOf("--limit");
  const limit = limitArg >= 0 ? Number(process.argv[limitArg + 1]) : Infinity;

  const entries = (JSON.parse(readFileSync(SRC, "utf8")) as Entry[]).slice(0, limit);
  const registry = loadAggregatorRegistry();
  const prevById = new Map<string, AuditRecord>();
  if (existsSync(OUT)) {
    for (const r of (JSON.parse(readFileSync(OUT, "utf8")) as AuditFile).records) {
      prevById.set(r.id, r);
    }
  }

  const records: AuditRecord[] = new Array(entries.length);
  let next = 0;
  async function worker() {
    while (next < entries.length) {
      const i = next++;
      const e = entries[i];
      const prev = prevById.get(e.id);
      const url = normalizeUrl(e.website);
      const checkedAt = new Date().toISOString();
      let rec: AuditRecord;
      if (!url) {
        rec = { id: e.id, name: e.name, category: e.category, country: e.country,
          url: null, status: null, finalUrl: null, verdict: "no-url",
          latestYear: null, checkedAt };
      } else {
        const outcome = await fetchOutcome(url);
        const prevCheck: PrevCheck | undefined =
          prev && prev.url === url ? { verdict: prev.verdict, checkedAt: prev.checkedAt } : undefined;
        const verdict = classifyLink(outcome, registry, prevCheck);
        rec = { id: e.id, name: e.name, category: e.category, country: e.country,
          url, status: outcome.status, finalUrl: outcome.finalUrl, verdict,
          latestYear: outcome.bodyText ? latestYearMentioned(outcome.bodyText) : null,
          checkedAt };
      }
      // Agent-written resolution survives re-fetches:
      if (prev?.proposedUrl !== undefined) rec.proposedUrl = prev.proposedUrl;
      if (prev?.proposedUrlType) rec.proposedUrlType = prev.proposedUrlType;
      if (prev?.proposedCategory) rec.proposedCategory = prev.proposedCategory;
      if (prev?.resolutionNote) rec.resolutionNote = prev.resolutionNote;
      records[i] = rec;
      console.log(`${rec.verdict.padEnd(15)} ${e.id}`);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  const counts: Record<string, number> = {};
  for (const r of records) counts[r.verdict] = (counts[r.verdict] ?? 0) + 1;
  const out: AuditFile = {
    generatedAt: new Date().toISOString(),
    counts,
    suspectedAggregators: suspectedAggregatorDomains(
      records.map((r) => r.url).filter((u): u is string => !!u), registry),
    records,
  };
  writeFileSync(OUT, JSON.stringify(out, null, 1) + "\n");
  console.log("\ncounts:", counts);
  console.log("suspected aggregators:", out.suspectedAggregators);
  console.log("wrote", OUT);
}

main();
```

- [ ] **Step 2: Add the npm script**

In `package.json` `"scripts"`, after `"geocode"`:

```json
    "audit:links": "tsx scripts/audit-links.ts",
```

- [ ] **Step 3: Smoke-test on 10 entries**

Run: `npm run audit:links -- --limit 10`
Expected: 10 lines of `verdict  id`, a counts object, and `data/research/link-audit.json` written. Network failures on some hosts are fine (they become `unreachable`).

- [ ] **Step 4: Commit (without the generated json — full run comes in Task 8)**

```bash
rm -f data/research/link-audit.json
git add scripts/audit-links.ts package.json
git commit -m "feat: audit:links script — fetch + classify all directory entry links"
```

---

### Task 4: Audit report renderer

**Files:**
- Create: `scripts/audit-report.ts`
- Modify: `package.json` (scripts block)

- [ ] **Step 1: Implement `scripts/audit-report.ts`**

```ts
/**
 * Render data/research/link-audit.json into a human review report:
 * docs/link-audit-YYYY-MM-DD.md, grouped by proposed action.
 *
 * Usage: npm run audit:report
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const RESEARCH = join(process.cwd(), "data", "research");
const AUDIT = join(RESEARCH, "link-audit.json");

interface AuditRecord {
  id: string; name: string; category: string; country: string;
  url: string | null; status: number | null; finalUrl: string | null;
  verdict: string; latestYear: number | null; checkedAt: string;
  proposedUrl?: string | null; proposedUrlType?: string;
  proposedCategory?: string; resolutionNote?: string;
}
interface AuditFile {
  generatedAt: string; counts: Record<string, number>;
  suspectedAggregators: string[]; records: AuditRecord[];
}

const cell = (s: string | number | null | undefined) =>
  String(s ?? "—").replace(/\|/g, "\\|");

function table(rows: AuditRecord[], withProposed: boolean): string {
  const head = withProposed
    ? "| id | name | country | current url | year | proposed | note |\n|---|---|---|---|---|---|---|"
    : "| id | name | country | current url | status | year |\n|---|---|---|---|---|---|";
  const body = rows.map((r) => withProposed
    ? `| ${cell(r.id)} | ${cell(r.name)} | ${cell(r.country)} | ${cell(r.url)} | ${cell(r.latestYear)} | ${cell(r.proposedUrl)} | ${cell(r.resolutionNote)} |`
    : `| ${cell(r.id)} | ${cell(r.name)} | ${cell(r.country)} | ${cell(r.url)} | ${cell(r.status)} | ${cell(r.latestYear)} |`,
  ).join("\n");
  return `${head}\n${body}\n`;
}

function main() {
  const audit = JSON.parse(readFileSync(AUDIT, "utf8")) as AuditFile;
  const date = new Date().toISOString().slice(0, 10);
  const OUT = join(process.cwd(), "docs", `link-audit-${date}.md`);
  const currentYear = new Date().getFullYear();

  const by = (v: string) => audit.records.filter((r) => r.verdict === v);
  const defunct = audit.records.filter(
    (r) => (r.verdict === "ok-provider" || r.verdict === "ok-social") &&
           r.latestYear !== null && r.latestYear <= currentYear - 2);

  const sections: [string, AuditRecord[], boolean, string][] = [
    ["Aggregator links — replace with provider link", by("aggregator-link"), true,
     "These entries' `url` points at an aggregator directory. Approving applies `proposed` as the new website."],
    ["Dead — propose junk or replacement", by("dead"), true,
     "Two failed checks ≥7 days apart. If no provider link could be found, approving moves the entry to the hidden `junk` category."],
    ["Parked domains", by("parked"), true, ""],
    ["Unreachable (first failure — re-run audit in ≥7 days to confirm)", by("unreachable"), false, ""],
    ["Redirected cross-domain — confirm the new home", by("redirected"), true, ""],
    ["No URL at all — targets for provider resolution / FB ritual", by("no-url"), true, ""],
    ["Possibly defunct — page's newest mentioned year is stale", defunct, false, ""],
  ];

  let md = `# Link audit — ${date}\n\nGenerated ${audit.generatedAt} from \`data/research/link-audit.json\`.\n\n`;
  md += `## Summary\n\n| verdict | count |\n|---|---|\n`;
  for (const [v, n] of Object.entries(audit.counts).sort()) md += `| ${v} | ${n} |\n`;
  md += `\n## Suspected aggregator domains (≥3 entries each — confirm & add to registry)\n\n`;
  md += audit.suspectedAggregators.length
    ? audit.suspectedAggregators.map((d) => `- ${d}`).join("\n") + "\n"
    : "_none_\n";
  for (const [title, rows, withProposed, blurb] of sections) {
    md += `\n## ${title} (${rows.length})\n\n`;
    if (blurb) md += blurb + "\n\n";
    md += rows.length ? table(rows, withProposed) : "_none_\n";
  }
  md += `\n## How to act on this report\n\nWrite decisions into \`data/research/link-audit-decisions.json\` as\n\`{"<id>": {"decision": "approve" | "reject", "website"?, "websiteType"?, "category"?}}\`\n(approve with no fields = take the record's proposed values), then run \`npm run audit:apply\`\nand rebuild with \`data/research/make.sh --no-fetch && npm run build:explorer\`.\n`;

  writeFileSync(OUT, md);
  console.log("wrote", OUT);
}

main();
```

- [ ] **Step 2: Add the npm script**

In `package.json` `"scripts"`, after `"audit:links"`:

```json
    "audit:report": "tsx scripts/audit-report.ts",
```

- [ ] **Step 3: Verify against the smoke-test data**

Run: `npm run audit:links -- --limit 10 && npm run audit:report`
Expected: `docs/link-audit-<today>.md` exists with a Summary table and the seven sections.

- [ ] **Step 4: Clean up smoke artifacts and commit**

```bash
rm -f data/research/link-audit.json docs/link-audit-*.md
git add scripts/audit-report.ts package.json
git commit -m "feat: audit:report — render link audit into grouped review markdown"
```

---

### Task 5: Overrides hook in build_directory.py

**Files:**
- Create: `data/research/overrides.json` (seed: `{}`)
- Modify: `data/research/build_directory.py` (the id-assignment loop, ~line 386–397)

- [ ] **Step 1: Seed the overrides file**

Create `data/research/overrides.json` containing exactly:

```json
{}
```

- [ ] **Step 2: Load overrides in build_directory.py**

In `data/research/build_directory.py`, directly below the `IMAP` load (the lines
`_imap_path = os.path.join(ROOT, "images-map.json")` / `IMAP = json.load(...)`), add:

```python
_ov_path = os.path.join(ROOT, "overrides.json")
OVERRIDES = json.load(open(_ov_path)) if os.path.exists(_ov_path) else {}
```

- [ ] **Step 3: Apply overrides per entry**

In the same file, inside the `for e in final:` enrichment loop, immediately after
`used_ids.add(eid); e["id"] = eid` and **before** `e["summary"] = make_summary(e)` (so
summary/references/thumb are built from the corrected values), add:

```python
    o = OVERRIDES.get(eid)
    if o:
        for k in ("website", "facebook", "category", "websiteType"):
            if k in o: e[k] = o[k]
```

(Note: the category-based sort above this loop ran on pre-override categories, so a
`junk` override may leave the HTML report slightly mis-ordered. Harmless — the site
itself re-derives and hides junk in `build-explorer-data.ts`.)

- [ ] **Step 4: Verify with a temporary override**

```bash
cd data/research
echo '{"harmony-learning-center": {"website": "https://example.org/REPLACED", "websiteType": "site"}}' > overrides.json
python3 build_directory.py
grep -o '"website": "[^"]*"' directory-consolidated-2026-06-09.json | grep REPLACED
```

Expected: one line — `"website": "https://example.org/REPLACED"`.

- [ ] **Step 5: Revert the temporary override and regenerated artifacts**

```bash
echo '{}' > overrides.json
python3 build_directory.py
cd ../..
git status --porcelain data/research
```

Expected: only `?? data/research/overrides.json` (untracked) and modified `build_directory.py`. If the regenerated JSON/CSV/HTML show as modified, run
`git checkout -- data/research/directory-consolidated-2026-06-09.json data/research/directory-consolidated-2026-06-09.csv data/research/hub-directory-report-2026-06-09.html`.

- [ ] **Step 6: Commit**

```bash
git add data/research/overrides.json data/research/build_directory.py
git commit -m "feat: id-keyed overrides.json applied by build_directory.py (website/facebook/category)"
```

---

### Task 6: Decisions → overrides apply loop

**Files:**
- Create: `lib/intake/apply.ts`
- Create: `scripts/audit-apply.ts`
- Modify: `package.json` (scripts block)
- Test: `test/intake-apply.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `test/intake-apply.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { applyDecisions } from "../lib/intake/apply";

const records = [
  { id: "harmony-learning-center", verdict: "aggregator-link",
    proposedUrl: "https://harmonylc.org", proposedUrlType: "site" as const },
  { id: "dead-hub", verdict: "dead", proposedUrl: null, proposedCategory: "junk" as const },
  { id: "fine-hub", verdict: "ok-provider" },
];

describe("applyDecisions", () => {
  it("approve with no fields takes the record's proposed values", () => {
    const out = applyDecisions(records, {
      "harmony-learning-center": { decision: "approve" },
    }, {});
    expect(out["harmony-learning-center"]).toEqual({
      website: "https://harmonylc.org", websiteType: "site",
    });
  });
  it("approve applies proposedCategory (junk path)", () => {
    const out = applyDecisions(records, { "dead-hub": { decision: "approve" } }, {});
    expect(out["dead-hub"]).toEqual({ category: "junk" });
  });
  it("explicit fields in the decision win over proposed", () => {
    const out = applyDecisions(records, {
      "harmony-learning-center":
        { decision: "approve", website: "https://facebook.com/harmonylc", websiteType: "social" },
    }, {});
    expect(out["harmony-learning-center"]).toEqual({
      website: "https://facebook.com/harmonylc", websiteType: "social",
    });
  });
  it("reject contributes nothing; existing overrides are preserved", () => {
    const existing = { "old-id": { website: "https://kept.example" } };
    const out = applyDecisions(records, { "dead-hub": { decision: "reject" } }, existing);
    expect(out).toEqual(existing);
  });
  it("approve with nothing to apply yields no entry (and is reported by the script)", () => {
    const out = applyDecisions(records, { "fine-hub": { decision: "approve" } }, {});
    expect(out["fine-hub"]).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run tests, verify they fail**

Run: `npx vitest run test/intake-apply.test.ts`
Expected: FAIL — cannot resolve `../lib/intake/apply`.

- [ ] **Step 3: Implement `lib/intake/apply.ts`**

```ts
export interface AuditDecision {
  decision: "approve" | "reject";
  website?: string;
  websiteType?: "site" | "social";
  category?: string;
}
export type DecisionsFile = Record<string, AuditDecision>;

export interface OverrideEntry {
  website?: string;
  websiteType?: "site" | "social";
  category?: string;
}

interface ProposalSource {
  id: string;
  proposedUrl?: string | null;
  proposedUrlType?: "site" | "social";
  proposedCategory?: string;
}

/** Merge approved decisions (decision fields win over record proposals) into overrides. */
export function applyDecisions(
  records: ProposalSource[],
  decisions: DecisionsFile,
  existing: Record<string, OverrideEntry>,
): Record<string, OverrideEntry> {
  const byId = new Map(records.map((r) => [r.id, r]));
  const out: Record<string, OverrideEntry> = { ...existing };
  for (const [id, d] of Object.entries(decisions)) {
    if (d.decision !== "approve") continue;
    const rec = byId.get(id);
    const entry: OverrideEntry = { ...out[id] };
    const website = d.website ?? rec?.proposedUrl ?? undefined;
    if (website) {
      entry.website = website;
      entry.websiteType = d.websiteType ?? rec?.proposedUrlType ?? "site";
    }
    const category = d.category ?? rec?.proposedCategory;
    if (category) entry.category = category;
    if (Object.keys(entry).length > 0) out[id] = entry;
  }
  return out;
}
```

- [ ] **Step 4: Run tests, verify they pass**

Run: `npx vitest run test/intake-apply.test.ts`
Expected: PASS (all).

- [ ] **Step 5: Implement `scripts/audit-apply.ts`**

```ts
/**
 * Merge user decisions (data/research/link-audit-decisions.json) over the audit
 * (data/research/link-audit.json) into data/research/overrides.json, which
 * build_directory.py applies on the next rebuild.
 *
 * Usage: npm run audit:apply
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { applyDecisions, type DecisionsFile, type OverrideEntry } from "../lib/intake/apply";

const RESEARCH = join(process.cwd(), "data", "research");
const AUDIT = join(RESEARCH, "link-audit.json");
const DECISIONS = join(RESEARCH, "link-audit-decisions.json");
const OVERRIDES = join(RESEARCH, "overrides.json");

function main() {
  if (!existsSync(DECISIONS)) {
    console.error(`No ${DECISIONS} — write decisions first (see the audit report's final section).`);
    process.exit(1);
  }
  const audit = JSON.parse(readFileSync(AUDIT, "utf8")) as {
    records: { id: string; proposedUrl?: string | null; proposedUrlType?: "site" | "social"; proposedCategory?: string }[];
  };
  const decisions = JSON.parse(readFileSync(DECISIONS, "utf8")) as DecisionsFile;
  const existing = existsSync(OVERRIDES)
    ? (JSON.parse(readFileSync(OVERRIDES, "utf8")) as Record<string, OverrideEntry>)
    : {};

  const merged = applyDecisions(audit.records, decisions, existing);

  const approvedIds = Object.entries(decisions)
    .filter(([, d]) => d.decision === "approve").map(([id]) => id);
  const noEffect = approvedIds.filter((id) => merged[id] === undefined && existing[id] === undefined);
  if (noEffect.length) {
    console.warn("approved but nothing to apply (no proposed/explicit fields):", noEffect.join(", "));
  }

  const sorted = Object.fromEntries(Object.entries(merged).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(OVERRIDES, JSON.stringify(sorted, null, 1) + "\n");
  console.log(`overrides.json now has ${Object.keys(sorted).length} entries ` +
    `(${approvedIds.length} approvals processed). Rebuild with: ` +
    `data/research/make.sh --no-fetch && npm run build:explorer`);
}

main();
```

- [ ] **Step 6: Add the npm script**

In `package.json` `"scripts"`, after `"audit:report"`:

```json
    "audit:apply": "tsx scripts/audit-apply.ts",
```

- [ ] **Step 7: Run the whole suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add lib/intake/apply.ts scripts/audit-apply.ts test/intake-apply.test.ts package.json
git commit -m "feat: audit:apply — merge reviewed decisions into overrides.json"
```

---

### Task 7: Provider-resolution runbook

**Files:**
- Create: `data/research/provider-resolution-prompt.md`

- [ ] **Step 1: Write the runbook**

Create `data/research/provider-resolution-prompt.md`:

```markdown
# Provider-link resolution runbook

You are resolving provider links for worldschooling-directory entries flagged by the
link audit. Work from `data/research/link-audit.json`: every record whose `verdict` is
`aggregator-link`, `dead`, `parked`, `redirected`, or `no-url` needs a resolution.

## The source model (hard rules)

- An entry's link must be FIRST-PARTY: the hub's own website, or its own
  Facebook/Instagram page/group/community ("social"). Aggregator directories
  (every domain in `data/research/aggregator-domains.json`) are NEVER acceptable
  as `proposedUrl` — they are discovery sources only.
- Link preference order: own website (`proposedUrlType: "site"`) → own FB/IG
  page or group (`proposedUrlType: "social"`) → nothing found
  (`proposedUrl: null`).

## Per record, in order

1. If the current url is an aggregator listing, open it and follow its outbound
   website/social link for the hub — aggregators often link providers correctly.
2. Else/also web-search: `"<name>" <country> worldschool` (and obvious variants).
3. Else search Facebook/Instagram for an official page or group run by the hub.
4. Verify freshness: the candidate page should mention a date ≥ 2026 (sessions,
   posts, copyright). If its newest signs of life are ≤ 2024, still record the
   link but say so in `resolutionNote` (possibly defunct).
5. Write results INTO the record in `link-audit.json`:
   - `proposedUrl`: the first-party URL, or `null` if none found
   - `proposedUrlType`: `"site"` or `"social"` (omit when `proposedUrl` is null)
   - `proposedCategory`: `"junk"` — only when verdict is `dead`/`parked` AND no
     first-party link exists anywhere (the entry is a dead listing)
   - `resolutionNote`: one sentence — what you found and the evidence
     (e.g. "official site found via worldschooly outbound link; 2026 cohort dates on page")
6. Never invent. No evidence = `proposedUrl: null` + a note saying what you tried.

## Afterwards

Run `npm run audit:report` to regenerate the review report with your proposals,
and add any newly confirmed aggregator domains (see the report's "suspected"
section) to `data/research/aggregator-domains.json`.
```

- [ ] **Step 2: Commit**

```bash
git add data/research/provider-resolution-prompt.md
git commit -m "docs: provider-resolution runbook for audit resolution agent"
```

---

### Task 8: Execute the audit (full run)

**Files:**
- Create (generated): `data/research/link-audit.json`, `docs/link-audit-YYYY-MM-DD.md`

- [ ] **Step 1: Full audit run**

Run: `npm run audit:links`
Expected: 175 verdict lines, then counts. Takes a few minutes (8-way concurrency, 15 s timeout). Spot-check: `harmony-learning-center` should print `aggregator-link`.

- [ ] **Step 2: Generate the report**

Run: `npm run audit:report`
Expected: `docs/link-audit-<today>.md` written; Summary counts match Step 1's console output; `harmony-learning-center` appears in the "Aggregator links" section; the "Suspected aggregator domains" section lists candidates for registry expansion.

- [ ] **Step 3: Commit the audit artifacts**

```bash
git add data/research/link-audit.json docs/link-audit-*.md
git commit -m "chore: first full link audit of the 175-entry directory"
```

- [ ] **Step 4: Hand off**

This ends the scripted work. What follows (separate sessions, not this plan):
1. A resolution agent works through `provider-resolution-prompt.md` and fills `proposedUrl` fields; report regenerated.
2. The user reviews the report and writes `data/research/link-audit-decisions.json`.
3. `npm run audit:apply`, then `data/research/make.sh --no-fetch && npm run build:explorer`, review the site, commit.
4. Entries still lacking any first-party link after resolution keep `url: null`; the spec wants the UI to say "no official site" for them — a one-line `HubModal.tsx` tweak to bundle with the rebuild in step 3.
5. Stage 2 (discovery channels + candidate inbox) gets its own plan.
