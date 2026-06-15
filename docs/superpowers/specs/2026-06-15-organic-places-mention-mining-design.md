# Organic-Places Mention Mining — Design

**Date:** 2026-06-15
**Status:** Approved (design); implementation plan pending
**Branch (proposed):** `feat/mention-mining`

## Problem

The directory grows by ingesting *named programs* from aggregators (worldschooly, wanderworks,
famunity, theworldschoolatlas). But the most valuable family-nesting destinations are often
**organic places** — a town *is* the hub (Pai, Bansko) — that no aggregator "lists" as a product.
The signal for these is corroboration: **if an organic place is mentioned across many independent
personal blogs and press, it is worth considering**, even with no program attached.

We also already hold a rich, untapped source layer in the existing hub `references`: directories not
in the aggregator registry (worldlytribe.com — 56 hubs, blog.worldschoolhubs.com — 18,
remotefamily.com — 12) and dozens of personal blogs / press (parentingandpassports, heathandalyssa,
nobackhome, plus Hebrew press: trvbox, ynet, mako, timesofisrael…).

We want a methodology to **extract information from all these sources, and the sources they link to,
without creating duplicates**, that surfaces and ranks the most popular organic places for
digital-nomad families.

## Goal & Non-Goals

**Goal (this build):** an extraction → place-resolution → scoring pipeline that outputs a **ranked
organic-places dataset** and a **self-contained review HTML page**, plus a reusable, organized
**source registry** (the "directory of blogs"). Discovery-first; secondary lightweight enrichment.

**Non-goals (explicitly deferred):**
- Wiring approved organic places into the site as a map layer or into the directory. Separate later step.
- Auto-applying any fact into existing hubs. The review page proposes; nothing edits `overrides.json`
  in this build.
- Crawling beyond 1 hop, or crawling frontier domains before approval.
- Full structured per-hub enrichment — that stays the existing `enrichment.json` flow.

## Core principles

1. **Agents do the messy part; node does the deterministic part.** A cheap read-only LLM agent reads
   pages and returns context-aware place mentions. Node scripts geocode, dedup, score, and render.
2. **Geocoding is the dedup key.** All name variants that geocode to the same point are one place.
3. **Independent corroboration is the ranking signal.** One domain = one vote; weighted by source kind
   and recency.
4. **Token discipline.** Cheapest model (Haiku) for scale; bounded pages per domain; snapshot+diff so
   re-runs never re-extract unchanged pages.
5. **Approval-gated expansion.** Outbound links discover new domains as `frontier` status — recorded,
   never crawled until the user approves.

## Data model

All files live in `data/research/mentions/`.

### 1. `source-registry.json` — the reusable source/blog directory

```json
{
  "updatedAt": "2026-06-15T...",
  "sources": [
    {
      "domain": "parentingandpassports.com",
      "name": "Parenting & Passports",
      "kind": "personal-blog",
      "lang": "en",
      "weight": 1.0,
      "status": "active",
      "seedUrls": ["https://parentingandpassports.com/worldschooling-community-bansko-bulgaria/"],
      "addedAt": "2026-06-15",
      "notes": ""
    }
  ]
}
```

- `kind` ∈ `personal-blog` | `press` | `directory` | `hub-site` | `forum`.
- `status` ∈ `active` (crawl it) | `frontier` (discovered via 1-hop, awaiting approval, NOT crawled) |
  `rejected` (never crawl).
- `weight` is an optional per-source override of the kind-default weight (default `null` → use kind default).
- `seedUrls` — the bounded set of pages to extract for this domain. Empty ⇒ use the domain homepage only.
  This is the primary token-control lever (we do not crawl whole blogs).

**Seeding:** generated once from the existing directory's `references` domain tally (script:
`mentions:seed-registry`). Aggregator/directory domains already in `aggregator-domains.json` are
included with `kind: "directory"`. Personal blogs and press are classified by a starter mapping in the
seed script; the user can re-classify any entry by editing the file. This file is the durable,
future-reusable artifact.

### 2. `snapshots/<domain>.json` — raw agent extraction (atomic, diffable)

```json
{
  "domain": "parentingandpassports.com",
  "extractedAt": "2026-06-15T...",
  "pages": [
    {
      "url": "...",
      "contentHash": "<sha256 of fetched text — computed by the node planner, not the agent>",
      "placeMentions": [
        { "place": "Bansko", "country": "Bulgaria",
          "snippet": "families nest here for the ski season Dec–Apr",
          "nestingClaim": true, "asOfDate": "2024-11" }
      ],
      "outboundLinks": [ { "url": "...", "anchor": "Bansko worldschooling group" } ]
    }
  ]
}
```

`contentHash` lets the planner skip unchanged pages on re-runs.

### 3. `places.json` — canonical place store

```json
{
  "updatedAt": "...",
  "places": [
    {
      "placeId": "pai--th",
      "canonicalName": "Pai",
      "country": "Thailand",
      "coords": [19.36, 98.44],
      "aliases": ["Pai", "Pai Thailand", "the Pai community"],
      "existingHubIds": ["pai"],
      "firstSeen": "2026-06-15"
    }
  ]
}
```

- `placeId = slug(canonicalName)--<ISO2 country code>`.
- `existingHubIds` — directory organic hubs whose coords are within the proximity radius (see Dedup).

### 4. `mention-ledger.json` — append-only, domain-deduped votes

One row per **(placeId, domain)** pair. A domain mentioning a place many times is one row (one vote);
re-extraction updates the row in place (idempotent), never adds a second vote.

```json
{
  "updatedAt": "...",
  "mentions": [
    { "placeId": "pai--th", "domain": "parentingandpassports.com", "kind": "personal-blog",
      "url": "...", "snippet": "...", "nestingClaim": true, "date": "2024-11", "addedAt": "2026-06-15" }
  ]
}
```

### 5. `organic-places-scored.json` — ranked output

```json
{
  "computedAt": "...",
  "places": [
    { "placeId": "pai--th", "canonicalName": "Pai", "country": "Thailand",
      "coords": [19.36, 98.44], "score": 6.4, "tier": "established",
      "independentDomains": 7, "matchedExistingHubIds": ["pai"],
      "sources": [ { "domain": "...", "kind": "...", "url": "...", "snippet": "...", "date": "..." } ] }
  ]
}
```

### 6. `organic-places-review.html` — self-contained reviewer

Mirrors `scripts/inbox-review-page.ts`: data embedded, `file://`-safe, localStorage state,
Approve/Reject/Edit, exports `organic-places-decisions.json` to `~/Downloads`. Each row shows score,
tier, independent-domain count, contributing sources (with snippets + links), geocoded location, and an
**"already in directory"** badge when `matchedExistingHubIds` is non-empty. Decisions are NOT applied
to the directory in this build — the export is the deliverable for the (future) ingestion step.

## The agent: `.claude/agents/mention-extractor.md`

- **Tools:** WebFetch, Read (read-only; never edits files).
- **Model:** Haiku (cheapest, for scale).
- **Input (dispatch prompt):** one source URL and its `kind`.
- **Effort bound:** fetch the one page; do not browse onward.
- **Filter rule:** return a place ONLY when it is framed as a **family / worldschool nesting
  destination** (a place families gather/stay in), not every geographic name on the page. This context
  filter is the reason an LLM is used over a gazetteer.
- **Output — strict JSON, nothing around it:**

```json
{ "sourceUrl": "https://...",
  "placeMentions": [
    { "place": "Pai", "country": "Thailand",
      "snippet": "families nest here Nov–Feb", "nestingClaim": true, "asOfDate": "2025-03|unknown" } ],
  "outboundLinks": [ { "url": "https://...", "anchor": "..." } ] }
```

`nestingClaim: true` when the place is explicitly described as a family-gathering/worldschool base;
`false` when merely a travel mention (kept, but scored lower / surfaced separately). `asOfDate` is the
page's own date when discernible, else `"unknown"`.

## Orchestration

Node cannot spawn Claude subagents, so dispatch follows the existing validation-runbook pattern:
a node **planner** emits a worklist, a **controller** (Claude) dispatches batches of Haiku agents per a
runbook, then node **resolves/scores/renders**.

1. `mentions:seed-registry` (node, one-off) — build `source-registry.json` from the directory's
   reference-domain tally.
2. `discover:mentions` (node, `--plan`) — read `source-registry.json` (status `active` only), expand
   each source's `seedUrls`, **fetch each page and compute its `contentHash`** (sha256 of extracted
   text), skip pages whose hash is unchanged vs the existing snapshot, and write a worklist
   `mentions/worklist.json` (URL + kind + fresh `contentHash` to stamp onto the agent's result).
3. **Controller dispatches N parallel `mention-extractor` (Haiku) agents** over the worklist per
   `data/research/mentions/runbook.md`; each agent's JSON is written into the per-domain
   `snapshots/<domain>.json`. (Controller writes the files; agents are read-only.)
4. `mentions:resolve` (node) — for every new/changed mention: geocode the raw place name (reuse the
   existing Nominatim geocoder), assign/look-up `placeId`, record aliases, upsert into `places.json`,
   link to existing directory hubs by proximity, and upsert the **(placeId, domain)** row in
   `mention-ledger.json`. Outbound links → new domains added to `source-registry.json` as `frontier`.
5. `mentions:score` (node) — compute weighted scores, tiers, and write `organic-places-scored.json`.
6. `mentions:review` (node) — render `organic-places-review.html`.

`npm` scripts: `mentions:seed-registry`, `discover:mentions`, `mentions:resolve`, `mentions:score`,
`mentions:review`.

## Scoring

For a place `p`, over the **distinct domains** in the ledger that mention it:

```
score(p) = Σ_d  kindWeight(d) × recencyFactor(date_d) × claimFactor
```

- **kindWeight:** `personal-blog 1.0 · press 0.9 · forum 0.7 · directory 0.5 · hub-site 0.2`
  (a hub's own marketing is discounted — it is not independent corroboration).
- **recencyFactor:** `1.0` if date ≤ 18 months old; linear/stepped decay to `~0.5` at 5 years and
  `~0.3` beyond; `0.6` when date is `unknown` (mild penalty for undateable mentions).
- **claimFactor:** `1.0` when `nestingClaim` is true, `0.4` when it is a mere travel mention.
- **Surface threshold:** a place is surfaced (tiered) when it has **≥ 3 distinct *independent*
  domains** mentioning it, where independent = `kind != "hub-site"`. Below threshold → `tier: "watch"`,
  shown separately, not promoted.

**Tiers** (by independent-domain count): `established` ≥ 6 · `emerging` 3–5 · `watch` 1–2.

The exact decay breakpoints live in one `lib/intake/mentions.ts` constant table so they are tunable and
unit-tested, not scattered.

## Dedup guarantees

1. **Name variants** ("Pai", "Pai, Thailand", "the Pai community") → same geocode → same `placeId`;
   every surface form recorded in `aliases`.
2. **Same domain, many mentions** of a place → exactly one ledger row (one vote); re-extraction is an
   idempotent upsert.
3. **Place already a directory organic hub** → matched by geocode **proximity ≤ 25 km** (and, when both
   are known, same country) → `existingHubIds`/`matchedExistingHubIds` populated; the review page flags
   "already in directory." No new competing entity is created.
4. **Re-runs are idempotent:** `contentHash` snapshot+diff skips unchanged pages; the ledger keyed by
   (placeId, domain) absorbs repeats.
5. **Frontier never auto-crawls:** outbound domains are added as `status: "frontier"` and excluded from
   the planner until promoted to `active` by the user.

Geocoding ambiguity (a name resolving to multiple candidates): the resolver takes the top Nominatim hit
constrained by the agent-provided `country` when present; if confidence is ambiguous (no country and
multiple strong hits), the mention is parked in `places.json` with `coords: null` and surfaced on the
review page as **"needs location confirmation"** rather than guessed — never silently merged into the
wrong place.

## Enrichment (secondary)

Each ledger mention already carries a `snippet`, `nestingClaim`, and `date` — lightweight evidence
(season windows, nationality-cluster hints surface naturally in blog prose). These are shown on the
review page per place. They are **evidence only**; nothing is auto-written into `overrides.json` or
`enrichment.json` in this build. Promoting confirmed facts into existing hubs is a later, separate step.

## Libraries & tests

New code in `lib/intake/mentions.ts`:
- `placeId(canonicalName, countryCode)`, alias merge, `upsertPlace`.
- `ledgerUpsert` (idempotent by placeId+domain).
- `kindWeight`, `recencyFactor`, `claimFactor`, `scorePlace`, `tierOf` (the tunable constant table).
- `matchExistingHub(coords, country, hubs, radiusKm)`.
- `nextFrontierDomains(outboundLinks, registry)`.

Vitest (mirrors the existing suite, new file `test/mentions.test.ts`):
- Variant collapse (same geocode → one place; distinct places stay distinct).
- Ledger domain-dedup idempotency (re-running adds no votes).
- Scoring: kind weights, recency decay, claimFactor, threshold, tier boundaries.
- Existing-hub proximity match (inside vs outside 25 km; country guard).
- Frontier: outbound domains land as `frontier`, excluded from the planner worklist.
- Ambiguous geocode → parked with `coords: null`, not merged.

## Open follow-ups (out of scope, recorded)

- Map layer for approved organic places (separate layer from programs).
- Ingestion of approved places + their evidence into the directory / `overrides.json`.
- Promoting `frontier` domains in bulk; periodic (scheduled) re-runs.
- Hebrew-source coverage expansion (the registry supports `lang: "he"`; seed includes the known press).
