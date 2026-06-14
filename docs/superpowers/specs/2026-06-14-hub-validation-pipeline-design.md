# Hub-Validation Pipeline — Design

**Date:** 2026-06-14
**Status:** Approved design, pending implementation plan

## Problem

The directory holds 296 entries; ~150 are newly bulk-applied discovery candidates that are **unvalidated** — many lack a verified first-party link, carry only an aggregator listing URL, have missing facts (ages/price/season), wrong categories, are duplicates of existing operators, are dead/phantom listings, or have no usable image. Reviewing them by hand is exactly the manual load the user wants to eliminate. A 10-hub pilot (2026-06-14) proved an LLM agent can validate a hub from the open web — filling facts, swapping aggregator links for real provider sites, catching phantoms (junk) and duplicates (merge), and reviving wrongly-dead entries — with web evidence.

## Goal

An end-to-end, mostly-autonomous pipeline that takes a hub (an existing directory entry **or** a new inbox candidate), validates it against the open web, sources a real image, and updates the directory — with the user reviewing only the genuinely-uncertain minority.

## Architecture

Four stages; two already exist, two are new. The new work is the **validator** and **image** stages plus the **controller orchestration** that wires them to the existing apply path.

```
 discovery (built, Stage 2) → VALIDATE (new) → IMAGE (new) → apply (built)
   inbox candidates +          per-hub agent     fetch images    overrides.json
   existing 296 entries        → verdict JSON     on fixed link   → rebuild → map
```

The validator and image stages are **separate by design** (different jobs, different failure modes); image runs *after* validation so it pulls from the corrected link.

## Stage 1 — Validator

**Deliverable:** a committed agent definition `.claude/agents/hub-validator.md` encoding the validation contract (piloted 2026-06-14).

**Input (per hub):** id, name, current country/region/category/link, and — for dup detection — the list of existing operator domains/names already in the directory.

**Rules baked into the agent prompt:**
- **Source model:** a hub's link must be FIRST-PARTY (its own website, or its own Facebook/Instagram page/group). Aggregator domains (`worldschooly.com`, `famunity.net`, `theworldschoolatlas.com`, `linkease.app`, `wanderworks.life`, + the maintained `data/research/aggregator-domains.json`) are discovery-only and NEVER acceptable as the link; if the current link is an aggregator, find the real provider site.
- **Freshness:** record the newest sign of life; nothing newer than ~18 months ⇒ suspect/possibly-defunct.
- **Taxonomy:** organic · permanent_commercial · permanent_community · popup · traveling · spanish_immersion · summer_camp.
- **Effort bound:** ≤ ~6 web actions (fetch + searches), then conclude; never invent — unverifiable ⇒ `uncertain`.

**Output (strict JSON per hub):**
```json
{ "id": "...", "status": "active|dead|uncertain", "confidence": "high|medium|low",
  "fields": { "country":"", "region":"", "category":"", "ages":"", "price":"",
              "season":"", "website":"", "websiteType":"site|social" },
  "latestSignOfLife": "YYYY-MM|unknown",
  "dupOf": "<existing-id|null>",
  "disposition": "keep|fix|inactive|junk|merge",
  "evidence": ["url — what it showed"], "note": "one sentence" }
```
`fields` are filled only where confirmed (else `""`). Disposition meanings: `keep` = valid as-is; `fix` = valid, apply the corrected fields/link; `inactive` = real but no working link (hidden category); `junk` = not a real hub / dead/phantom listing (hidden category); `merge` = duplicate of `dupOf`.

Note: the agent does NOT source images (the pilot showed og:image extraction is unreliable — FB login walls, logos-as-images). Images are Stage 2.

**Model strategy — Haiku-default with Sonnet escalation.** The pilot's Haiku/Sonnet comparison showed Haiku does the *web research* well (sometimes better) but is less reliable on the *structured decision* (`keep` vs `fix`, `junk` vs `merge`, setting `dupOf`). Therefore:
- Default model: **Haiku**.
- **Escalate to Sonnet** when any escalation trigger holds: the hub is a dup-candidate (shares an operator name/domain with an existing entry), has no current link, is currently categorized `inactive` (recheck), OR the Haiku run returns `confidence` ≠ `high`. Escalation = re-dispatch the same hub on Sonnet; the Sonnet verdict wins.

**Orchestration:** the controller (main session) dispatches the agent per hub, **batched ~10 in parallel**, collects verdicts into `data/research/validation/results.json` (keyed by id, each record stores the verdict + which model produced it).

## Stage 2 — Image

**Deliverable:** a script that, for hubs lacking a usable image, sources one and writes it into the existing local image store (`data/research/hub-images/` + `images-map.json`) — local files only, no client-side network (a hard project requirement).

**Source chain (first hit wins):**
1. **Free location/stock photo by keyword** — query a free, key-less photo source (Wikimedia Commons API, falling back to Openverse) using the hub's place keywords (e.g. `"<region> <country>"`), download the top relevant CC-licensed image locally.
2. **Hub's own og:image / favicon** — the existing `fetch_images.py` path, run against the validator-corrected link.
3. **Keep the current emoji-on-gradient placeholder** if nothing real is found.

Image generation is explicitly **out of scope** (no image-gen tool available in-environment; a generated photo of a real place risks being misleading). Free real imagery only.

Runs only on hubs whose image is missing or on the existing `data/image-blocklist.json` (junk-image) list, after validation has corrected links.

## Stage 3 — Autonomous apply with confidence gate

Deterministic controller code (not the LLM editing live data). For each validation result:

- **High confidence** → auto-applied:
  - `fix` → write corrected `website`/`websiteType`/`category`/region/etc. into `data/research/overrides.json` (the existing id-keyed override mechanism).
  - `junk` / `inactive` → set that hidden category via `overrides.json` (data preserved, removed from map).
  - `merge` → hide the duplicate by overriding **its** category to the hidden `junk` bucket via `overrides.json`, and record `dupOf` in the override `notes` (so the link to the surviving entry is preserved for a later field-merge curation pass). Concrete and deterministic — reuses the same hidden-category mechanism as `junk`; does NOT rely on the build's name-dedup (which only catches exact-name matches).
  - `keep` → no-op (already correct).
- **Medium / low confidence** → written to `data/research/validation/flags.md` (a human-review report grouped by disposition), **never auto-applied**.

After a batch applies, the controller rebuilds via the existing path (`data/research/make.sh --no-fetch && npm run build:explorer`) and commits the batch, so every autonomous change is visible in the git diff and reversible.

## Rollout

1. Behaviour is the version validated on the 10-hub pilot.
2. Run the **unvalidated subset first**: the ~150 newly-applied discovery entries + any current inbox candidates.
3. Then the remaining existing entries (up to all 296), batched.
Cost is bounded by Haiku-default + ~10-parallel batching; escalation touches only the hard minority.

## Error handling

- A hub the agent cannot reach/verify ⇒ `uncertain` + low confidence ⇒ flagged, not applied (never auto-junked on a single failed fetch).
- Aggregator URL proposed as a link ⇒ stripped at apply time (reuse `isAggregatorUrl` enforcement).
- Image download failure ⇒ fall through the chain to the placeholder; never block the hub.
- Each batch commits independently; a bad batch is revertable without unwinding the rest.

## Reuses (does not reinvent)

Source model + `aggregator-domains.json`; freshness rule; taxonomy + hidden categories (`junk`/`inactive`); `overrides.json` → `build_directory.py` → `build:explorer` apply path; `fetch_images.py` + `images-map.json` + `image-blocklist.json`; the parallel-agent dispatch pattern.

## Out of scope

- Image **generation** (no tool; authenticity risk) — free real imagery only.
- Re-running discovery (Stage 2 owns that).
- Scheduling the pipeline on a cron (Stage 3 of the broader roadmap).
- Auto-merging duplicate *records* field-by-field — `merge` drops/hides the dup; combining enrichment from both is a later curation pass.
