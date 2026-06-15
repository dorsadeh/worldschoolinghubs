# Organic Category Rework (from mention-mining) — Design

**Date:** 2026-06-15
**Status:** Approved (design); implementation plan pending
**Depends on:** the merged mention-mining pipeline (`data/research/mentions/`,
`organic-places-scored.json`, `mention-ledger.json`).

## Problem

The directory's `organic` category (21 entries) mixes three different things:
genuine organic towns (Bansko, Chiang Mai…), **paid programs miscategorized as organic**
(7 "Bliss Hubs", Hakuba school, Naturally Richer Algarve), and **Facebook community groups**
that merely duplicate a town. Several Bliss entries are also exact **duplicates** of a
`*-bliss-hub-*` entry already in `permanent_commercial`. Meanwhile mention-mining surfaced
strong organic places not in the directory at all (Oaxaca, Luxor, San Miguel de Allende…).

The user wants the organic category curated: keep the genuine towns, **add** the strong mined
places, **evict** the paid programs, and **reclassify Bliss as "Community"**. New organic hubs
should also expose their **blog-mention evidence** so a user can read why each place qualifies.

## Goal & Non-Goals

**Goal:** a curated `organic` category = genuine existing towns + ~10 new mined towns; all Bliss
moved to `permanent_community` ("Community"), deduped; other paid mislabels fixed; each new
organic hub carries clickable blog-mention evidence shown in the hub modal.

**Non-Goals:** no new taxonomy category (reuse `permanent_community`, whose display label is
already "Community"). No full enrichment of the new towns now (season/price/nationality come
later via the existing enrichment pipeline). No change to the mention-mining pipeline itself.
No re-run of extraction.

## Decisions (all user-approved)

### A. Organic membership

**KEEP (11 genuine towns, already `organic`):** `bansko-town-base-city`, `koh-lanta`,
`hoi-an-an-bang`, `chiang-mai`, `koh-phangan`, `pai`, `goa-arambol-mandrem`, `kuala-lumpur`,
`cyprus-limassol-larnaca`, `penang`, `lisbon-cascais`.

**ADD (10 new `organic` towns)** — none has a genuine town entry today (only paid/popup/
spanish/traveling listings exist):
Bali, Oaxaca, San Miguel de Allende, Luxor, Cusco, Krabi, La Barra (Uruguay),
La Herradura (Spain), Antigua (Guatemala), Playa del Carmen.

### B. Bliss → Community

All Bliss entries become `category: permanent_community` (display label is already "Community";
**no `CATEGORY_META` change**). Per location, dedupe to ONE entry, hiding the redundant twin:

| Location | organic entry (currently) | permanent_commercial twin | Result |
|---|---|---|---|
| Bali | bliss-hubs-bali | bali-bliss-hub | keep twin → `permanent_community`; hide `bliss-hubs-bali` (`junk`) |
| Koh Lanta | bliss-hubs-koh-lanta | koh-lanta-bliss-hub-thailand | keep twin → `permanent_community`; hide `bliss-hubs-koh-lanta` |
| Pai | bliss-hubs-pai | pai-bliss-hub-thailand | keep twin → `permanent_community`; hide `bliss-hubs-pai` |
| Siem Reap | bliss-hubs-siem-reap | siem-reap-bliss-hub-cambodia | keep twin → `permanent_community`; hide `bliss-hubs-siem-reap` |
| Kuala Lumpur | bliss-hubs-kuala-lumpur | _(none)_ | `bliss-hubs-kuala-lumpur` → `permanent_community` |
| Krabi | bliss-hubs-krabi | _(none)_ | `bliss-hubs-krabi` → `permanent_community` |

"Hide" = recategorize the redundant entry to the existing hidden `junk` category (already used
for duplicate listings). Net: Bliss appears as exactly 6 "Community" hubs, zero in `organic`.

### C. Other mislabels (user-approved)

- `hakuba-international-term-year` (paid school) → `permanent_commercial`.
- `algarve-worldschooling-hub-naturally-riche` (Naturally Richer, paid) → `permanent_commercial`.
- FB-group entries `worldschoolers-in-kuala-lumpur` and `worldschoolers-of-hoi-an` → fold the
  group's Facebook URL into the matching town entry (`kuala-lumpur`, `hoi-an-an-bang`) as its
  `facebook`, then hide the group entry (`junk`).

### D. New organic hubs carry blog-mention evidence (user request)

Each of the 10 new towns is attached to its mined place by `placeId`. From
`organic-places-scored.json` we take that place's `sources[]`
(`{ domain, kind, url, snippet, date }`) and surface them in the directory so the user can
**click through to the blog posts and read the snippet** explaining why families gather there.

## Data model & mechanics

Build order (existing pipeline; `data/research/make.sh --no-fetch` → `npm run build:explorer`):

1. **Recategorizations & hides → `overrides.json`** (id-keyed; applies `category`). This covers
   all of B and C (Bliss → `permanent_community` or `junk`; Hakuba/Naturally Richer →
   `permanent_commercial`; FB groups → `junk` + `facebook` folded onto the town via the existing
   `facebook` override key). Per the standing rule, the consolidated JSON is never edited directly.

2. **10 new towns → `approved-candidates.csv`** rows: `type=organic`, `name`, `country`,
   `region_city`, `source_directory=mention-mining`, `confidence=mention-mining`,
   `dedup_status=NEW`. `build_directory.py` ingests these (section 1b) with deterministic ids
   `slug(name)`.
   **Collision safety (required):** some bare names/ids already exist in other categories — e.g.
   `antigua` (spanish_immersion); "Bali"/"Krabi" exist only as `*-bliss-hub`/program ids but
   their towns are new. `build_directory.py` dedupes new candidates by NAME (and they lose to
   curated/PDF entries), so a bare "Antigua"/"Bali" row could be dropped or clash. Each new town
   therefore uses a **disambiguated, country-qualified name + id** (e.g. "Antigua, Guatemala" →
   `antigua-guatemala`; "Bali (Ubud)" → `bali-ubud`; "Krabi, Thailand" → `krabi-thailand`) chosen
   so the resulting id does not collide with any existing directory id and the name is not a
   dedup-match of an existing entry. The emit script (step 3) computes ids against the current
   directory id set and fails loudly on any residual collision rather than silently dropping a town.

3. **Precise coords → `geocoded-coords.json`**: seed each new town's id with the exact mining
   `coords` from `organic-places-scored.json`, so they land precisely (not at a country centroid).
   A small script `scripts/mentions-to-directory.ts` (npm `mentions:to-directory`) emits the
   CSV rows + the geocoded-coords entries + a `new-organic` id→placeId map, deterministically
   from the approved place list (the 10 names) — re-runnable.

4. **Mention evidence attached at explorer-build time.** Extend the `DirectoryHub` type with an
   optional `mentions?: HubMention[]` (`HubMention = { domain; url; snippet; date }`).
   `scripts/build-explorer-data.ts` reads the id→placeId map + `organic-places-scored.json`,
   and for each hub with a placeId attaches that place's `sources` as `mentions` (capped, e.g.
   ≤12, blog/press/forum first). This is the same "attach by id at build time" pattern already
   used for `enrichment`. (No new `overrides.json` key is required — mentions are attached from
   the mining data by id, which is cleaner than hand-carrying them through overrides.)

5. **UI — "Mentioned on these blogs" section** in `components/directory/HubModal.tsx`: when
   `hub.mentions?.length`, render a section listing each mention as a clickable link
   (`domain` → `url`, `target=_blank rel=noopener`) with its `snippet` and `date`. Styling
   follows the existing modal/reference sections (Quiet Atlas tokens). Mirrors how the
   `Enrichment` block is conditionally rendered.

## Affected files

- `data/research/overrides.json` — recategorizations/hides (B, C).
- `data/research/approved-candidates.csv` — 10 new organic rows (A).
- `data/research/geocoded-coords.json` — 10 new precise coords.
- `scripts/mentions-to-directory.ts` (new) + npm script — emits rows/coords/id-map from the
  approved place list.
- `lib/directory.ts` — add `HubMention` type + `mentions?` on `DirectoryHub`.
- `scripts/build-explorer-data.ts` — attach `mentions` by placeId.
- `components/directory/HubModal.tsx` — render the blog-mentions section.
- (No `CATEGORY_META` change — `permanent_community` already labeled "Community".)

## Testing & verification

- **Unit (vitest):** the new mapping/emit logic in `mentions-to-directory` (place name → CSV row
  with correct fields; coords carried; id→placeId map) and the build-time mention attachment
  (a hub with a placeId gets its sources as `mentions`, capped + ordered; a hub without one gets
  none). Pure helpers extracted so they're testable without file I/O.
- **Build assertion (post-rebuild):** organic category contains the 11 keepers + 10 new towns and
  **zero Bliss/Hakuba/Naturally-Richer**; Bliss shows as 6 `permanent_community` hubs with no
  duplicates; the FB-group ids are hidden and their town carries the FB link; each new town has
  `coords` and a non-empty `mentions[]`.
- **Visual:** run the app; a new organic hub (e.g. Oaxaca) shows on the map at the right spot and
  its modal lists clickable blog mentions with snippets.
- Existing suite stays green.

## Open follow-ups (out of scope)

- Enrich the 10 new towns (season/price/nationality) via the existing enrichment pipeline.
- Revisit the remaining low-signal "watch" mined places later if desired.
- The directory still has other multi-location paid networks (Boundless) left as
  `permanent_commercial` — reclassifying those to "Community" is a separate decision, not in scope.
