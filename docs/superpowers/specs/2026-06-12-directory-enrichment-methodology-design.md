# Directory Enrichment & Update Methodology — Design

**Date:** 2026-06-12
**Status:** Approved design, pending implementation plan

## Problem

The directory (175 entries) has three structural problems, illustrated by real cases:

1. **Coverage gaps** — many hubs are missing (e.g. a known hub in Slovakia in July). New hubs are announced mostly in Facebook groups and scattered web sources; today there is no systematic intake.
2. **Residual clutter & wrong links** — some entries are dead or low-quality, and some link to aggregator directories instead of the provider (e.g. Harmony Learning Center's `url` points to an aggregated directory although it has its own site).
3. **Staleness** — no mechanism keeps entries or their events fresh (aggregators themselves go stale: theworldschoolatlas.com carries many out-of-date links).

The user will not do sustained manual Facebook work. The methodology must be automated/semi-automated, with the user's role reduced to **reviewing proposed diffs**.

**Excluded by decision:** purchasing/ingesting the LinkEase "Worldschooling Atlas & Calendar" ($19.99 PDF, 333+ places, 100+ dated events). Payment is currently broken, and wholesale ingestion of a curated compilation is copying someone's editorial work. All facts in it originate from public primary sources; we reach them by independent discovery instead. If purchased later, it serves only as a cross-check, never a foundation.

## Goals

- Every entry links to a **provider** (first-party) destination or is explicitly marked as having none.
- A repeatable, multi-source discovery loop that surfaces new hubs as reviewable candidates.
- Dated facts carry provenance and freshness; stale signal is flagged, not ingested.
- Eventually runs on a schedule with zero user effort beyond reviewing diffs.

## The source model (load-bearing rule)

Every source is classified as **aggregator** or **provider**, and the class determines what it may contribute:

| | Aggregator (worldschooly.com, famunity.net, theworldschoolatlas.com, Pop-Up Hub directory, linkease.app, …) | Provider (anahataworldschoolingcommunity.com, boundless.life, …) |
|---|---|---|
| Role | **Discovery only** — "a hub named X exists in Y" + harvested outbound links | **Source of truth** — prices, dates, ages, exact location, events |
| Linkable as an entry's `url`? | **Never** | Yes |
| Facts ingested | Existence, name, rough location (leads) | Everything |

**Provider link hierarchy** for the `url` field: own website → own Facebook/Instagram page or community (first-party social counts as a provider link) → `null`. The link *type* (`site` / `social`) is recorded so social links can be upgraded later. `url: null` ⇒ status `no-provider-site`, shown honestly in the UI as "no official site" — never silently linked to an aggregator. The `no-provider-site` list doubles as the target list for the manual Facebook ritual, since web-absent hubs are exactly the FB-announced ones.

**Enforcement:**

1. `data/research/aggregator-domains.json` — maintained registry of aggregator domains (seeded by the Stage-1 audit). All intake and audit validate every `url` against it; an aggregator URL in a `url` field is automatically a flag, forever. Registry entries can carry a quality note (e.g. theworldschoolatlas.com = *low-freshness*: its listings are leads to re-verify, never evidence).
2. **Provider-resolution step** — any entry/candidate lacking a provider URL triggers: (a) follow the aggregator's own outbound link (aggregators often link providers correctly), then (b) web search (name + location + "worldschool"), then (c) Instagram/Facebook page search. Failure ⇒ `url: null` + `no-provider-site`.

**Freshness:** every harvested fact carries `source` + `asOf` (matching the existing enrichment-schema discipline). Aggregator-derived leads get a freshness check: provider link resolves AND page mentions a date ≥ 2026, else flag `possibly-defunct`. Date-bearing facts that can't be confirmed current are flagged, not ingested as live.

## Architecture — three stages, one review gate

```
 STAGE 1: AUDIT                STAGE 2: DISCOVERY               STAGE 3: AUTOMATION
 (one-time, then quarterly)    (repeatable on demand)           (scheduled, after 1–2 proven)

 audit agent visits            LLM deep-research sweeps   ┐
 all 175 entry URLs            aggregator diffs           │     scheduled cloud agent
        │                      operator watch             ├──►  re-runs Stage 2 sources,
        ▼                      Reddit/forums/Hebrew sweep │     pushes branch + summary
 link-audit report             FB screenshot drop-folder  ┘
 (ok-provider/ok-social/                │
  aggregator/dead/junk)                 ▼
        │                      data/research/inbox/candidates.json
        │                      (uniform shape, provenance, dedupe)
        └──────────┬───────────────────┘
                   ▼
        USER REVIEW (nothing auto-applies)
                   ▼
        build_directory.py → make.sh → directory.json → site
```

Sources are pluggable; the inbox format is fixed. Adding a source never changes review or build machinery. Intake never writes `directory.json` directly — `make.sh` → `npm run build:explorer` remains the single rebuild path.

## Stage 1 — Link audit of existing entries

An agent pass over all 175 entries. Per entry, fetch the current `url` and record:

- **Verdict:** `ok-provider` / `ok-social` / `aggregator-link` / `dead` / `redirect` / `parked`
- For `aggregator-link` and `dead`: proposed replacement provider link via the resolution step
- **Freshness signal:** latest date mentioned on the page (newest mention ≤ 2024 ⇒ `possibly-defunct`)
- **Junk recommendation:** dead AND unresolvable ⇒ propose move to the existing hidden `junk` category

Output: `docs/link-audit-YYYY-MM-DD.md` (human report, proposed changes grouped by action) + `data/research/link-audit.json` (machine). User approves per-group or per-row; approved fixes are applied to the build inputs (curated dicts in `build_directory.py` / `data/hubs/*.json`), then rebuild. The audit also seeds `aggregator-domains.json` with every aggregator domain encountered.

## Stage 2 — Discovery channels

All channels emit candidates in one **inbox format** (`data/research/inbox/candidates.json`): `name`, claimed location/dates, category guess (per the 5-type taxonomy), provider link or `null`, evidence URLs + `asOf`, `source` channel tag, dedupe verdict (`new` / `possible-dup-of:<id>` / `known`).

1. **LLM deep-research sweeps** — existing `deep-research-prompt.md` re-run periodically with a "what's new since `<date>`" preamble + current id list to suppress known hubs. Output lands in `data/research/external_llm_researches/` as today.
2. **Aggregator diffs** — script fetches each registry aggregator, extracts listing names + outbound provider links, diffs against our ids and the previous snapshot (`data/research/snapshots/`). Only the *diff* reaches the inbox.
3. **Operator watch** — known multi-edition providers (Boundless, Worldschool Pop-Up Hub, Worldschooling Journeys, ÎleO, …) checked for new locations/cohorts. New events → enrichment layer; new locations → inbox.
4. **Community text sources** — Reddit (r/worldschooling and family-travel threads), public forums, newsletters, blogs — enumerated explicitly in the sweep prompt, plus a dedicated cheap pass searching these for hub names we don't have. Includes the **Hebrew sweep** (Hebrew keywords, Israeli forums/blogs) for Israeli-family clustering signal.
5. **FB/WhatsApp/Telegram drop-folder** — `data/research/inbox/fb-screenshots/`. The user screenshots relevant posts opportunistically (no cadence, no obligation); a parsing script OCRs + extracts them into inbox candidates with `source: fb-screenshot`. This is the entire manual Facebook commitment.

## Review workflow

Single gate for everything (audit fixes, inbox candidates, enrichment flags): user marks rows `approve` / `reject` / `edit`; an apply script ingests approved rows into build inputs. Rejected names persist in `data/research/inbox/rejected.json` so no channel re-proposes them — the user only ever sees *new* decisions. Existing discipline preserved: flags are surfaced, never auto-applied.

## Stage 3 — Scheduled automation

Only after Stages 1–2 have each run manually at least once. A scheduled cloud agent runs weekly/biweekly (aggregator diffs + operator watch) and monthly (LLM sweep + community pass), then pushes a branch containing the updated inbox plus a short summary report. The user reads the summary, approves rows, merges. A run that finds nothing says so and changes nothing. Quarterly, it re-runs the Stage-1 audit.

## Error handling

- One fetch failure ⇒ `unreachable` + `asOf`, never `dead`. `dead` requires two failures ≥ 1 week apart (Stage 3 provides the second look).
- Dedupe is conservative: name similarity + same country ⇒ `possible-dup-of`, surfaced for the user, never auto-merged.
- Screenshot parsing failures land in the report as "unparsed, see image" rather than being dropped.

## Testability / structure

Every piece is a standalone command — `npm run audit:links`, `npm run discover:aggregators`, `npm run discover:operators`, `npm run inbox:parse-screenshots`, `npm run inbox:apply` — individually testable; Stage 3 is cron around proven commands. Shared logic (inbox schema, dedupe, aggregator registry, provider resolution) lives in small modules with the inbox JSON schema as the contract between channels and review.

## Out of scope

- Purchasing/ingesting the LinkEase atlas (see Problem).
- Scraping Facebook (ToS; the drop-folder keeps the human in the loop).
- Auto-applying any change without user review.
- UI changes beyond surfacing `no-provider-site` honestly.
