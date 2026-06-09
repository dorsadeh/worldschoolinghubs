# Worldschool Directory Explorer — Design

**Date:** 2026-06-09
**Status:** Approved for planning

## Goal

Replace the home page with a beautiful, Airbnb-style **split-view explorer** for the full
168-entry consolidated worldschooling directory: a scrollable grid of hub cards beside a live
map, both driven by one shared filter bar. Filters: months, cost, hub type, participation
(🎒 drop-off / 👪 family), Spanish-immersion, country/region, and free-text search.

Aesthetic direction: **Bold & Playful** — Baloo 2 + Hanken Grotesk, candy accents, thick ink
outlines, offset hard shadows, sticker badges. Deliberately not a generic Airbnb clone; the
playful, illustrative style is chosen because ~half the directory images are emoji-on-gradient
placeholders rather than photographs, so the design must not depend on photography.

## Data source

`data/research/directory-consolidated-2026-06-09.json` — 168 entries. Relevant fields:
`name, host, category, spanish, participation, country, region, season, ages, price,
nationality, validity, website, facebook, source, notes, id, summary, references, thumb, photo, fit`.

Three gaps make this data not directly filterable on the client:
1. `season` is free text ("Best Dec-Apr", "Year-round", "Nov–early Feb", "May 31 – July 12 2026").
2. `price` is free text **and blank for ~half** the entries ("Low cost of living", "Free",
   "$720 USD per month", "Varies", "").
3. **No entry has coordinates** (`category` counts: permanent_commercial 39, popup 39,
   permanent_community 24, traveling 21, online 21, organic 15, spanish_immersion 9).

Hard constraint carried from the prior session: **no client-side network calls** — all data
and images must be local. This forces a build-time enrichment step.

## Architecture

### Build-time enrichment

New script `data/research/build_explorer_data.py` reads the consolidated directory and emits a
client-ready **`public/directory.json`**. For each entry it adds:

- **`months: number[]`** — set of calendar months (1–12) the hub is active, parsed from `season`:
  - "Year-round" / "Year round" → `[1..12]`.
  - Ranges → inclusive span, wrapping across year end: "Best Dec-Apr" → `[12,1,2,3,4]`;
    "Nov–early Feb" → `[11,12,1,2]`; "May–Jul" → `[5,6,7]`.
  - Explicit single months / multiple fragments → union of all mentioned months.
  - Unparseable or blank → `[]`, meaning **"flexible" — never hidden by the month filter**.
- **`costBucket: "free" | "low" | "mid" | "high" | "unlisted"`** — parsed from `price`:
  - "Free" (and "Free …") → `free`.
  - "Low cost of living" / qualitative-low → `low`.
  - Numeric amounts bucketed (normalized toward a monthly figure where the unit is given):
    `low` < ~$800/mo, `mid` ~$800–2500/mo, `high` > ~$2500/mo. Per-person/per-week amounts are
    bucketed on their face value with the same thresholds; exact boundaries are an implementation
    detail captured by the parser's unit tests, not a product requirement.
  - "Varies" / "TBD" / blank → `unlisted` — **never hidden unless the user filters it out**.
- **`coords: [lat, lng]`** — from a bundled country/region centroid lookup table committed
  alongside the script. Where an entry matches one of the 46 `data/hubs/*.json` by id or name,
  reuse that hub's precise lat/lng instead of the centroid. Entries that still resolve to nothing
  (e.g. "Worldwide / rotating") are flagged `coords: null` and rendered in the grid but omitted
  from the map (shown via a "+N not on map" note).

The script also **resolves images** so the client needs no network: inline `data:` URIs in
`thumb`/`photo` pass through unchanged; any file-path references are copied into
`public/directory-images/` and rewritten to that path.

`parseMonths` and `costBucket` logic is mirrored as small pure TS/Python units and built
**test-first** (see Testing). `public/directory.json` and `public/directory-images/` are committed
so the app builds without re-running research scripts.

### Frontend (Next.js)

> Per `AGENTS.md`, the bundled Next docs in `node_modules/next/dist/docs/` are read before any
> Next code is written — this project's Next.js differs from training data.

Routing:
- `/` — the new **DirectoryExplorer** split view (home).
- `/map` — the existing 46-hub `HubExplorer` Leaflet map, kept intact (it has precise coords).

Modules:
- `lib/directory.ts` — `DirectoryHub` type and the pure `filterDirectory(hubs, filters)` function.
- `components/directory/DirectoryExplorer.tsx` — client component; owns filter state + selected
  hub; reads `public/directory.json`; renders the bar, grid, map, and modal. Map is dynamically
  imported (`ssr:false`) like the existing `HubMap`, because Leaflet touches `window`.
- `components/directory/FilterBar.tsx` — month pills, cost buckets, 7 hub-type pills (with a
  "+N" expander), 🎒/👪/🗣 toggles, country select, search box, result-count badge, reset.
- `components/directory/HubGrid.tsx` + `HubCard.tsx` — the card grid.
- `components/directory/DirectoryMap.tsx` — Leaflet map with clustered, color-by-hub-type pins,
  adapted from the existing `HubMap`/`MapErrorBoundary` pattern.
- `components/directory/HubModal.tsx` — opens on card/pin click; shows summary + documented
  `references` (reuses the existing `HubDetail` content pattern).

### Filtering model

`filterDirectory` applies facets with **AND across facets, OR within a facet**:
- **months**: match if any selected month ∈ `hub.months`, OR `hub.months` is empty (flexible).
- **cost**: match if `hub.costBucket` ∈ selected buckets; `unlisted` is only excluded when the
  user explicitly deselects it (default = visible).
- **hub type**: match if `hub.category` ∈ selected types.
- **participation**: match selected of {dropoff, family}; entries with blank participation match
  when no participation filter is active.
- **spanish**: when on, keep only `hub.spanish === true`.
- **country/region**: match selected country.
- **search**: case-insensitive substring over name/host/summary/country/region.

No filter active ⇒ all 168 shown.

## Aesthetic system

- **Type** (`next/font/google`): Baloo 2 (display — headings, pills, badges), Hanken Grotesk (body).
- **Color**: cream `#fff4e6`, ink `#20140d`. Per-hub-type accents: organic=mint `#caffbf`,
  popup=coral `#ff9aa2`, traveling=sky `#a0c4ff`, permanent_commercial=violet `#caa8ff`,
  permanent_community=teal `#8fe0d0`, spanish_immersion=sunshine `#ffca3a`, online=slate.
  Active month pills=mint, cost pills=peach `#ffd6a5`.
- **Primitives**: 2.5px ink outlines; offset hard shadows (`6px 7px 0 ink`); 20–22px radii;
  rotated sticker badges; color-coded category badge + participation icon on every card.
- **Motion**: staggered card reveal on first load (`animation-delay`); hover lift (translate +
  shadow grow); filter-change cross-fade of the grid; pin bounce on hover/select.

## Testing

Test-first (TDD) for the risky pure logic:
- `parseMonths`: "Best Dec-Apr"→[12,1,2,3,4]; "Nov–early Feb"→[11,12,1,2]; "May–Jul"→[5,6,7];
  "Year-round"→[1..12]; "" / unparseable→[].
- `costBucket`: "Free"→free; "Low cost of living"→low; "$720 USD per month"→low/mid per threshold;
  "€3,500 (14 nights)"→high; "Varies"/""→unlisted.
- `filterDirectory`: AND-across / OR-within; unlisted-cost and empty-months entries never hidden
  except by explicit deselection; spanish toggle; search.

Components get a light smoke test (renders, filter toggle updates count). The Python enrichment
script gets unit tests for `parseMonths`/`costBucket` parity with the TS versions (shared cases).

## Out of scope

- Enriching missing `price` data (cost stays sparse; `unlisted` handles it).
- Per-entry precise geocoding beyond country/region centroids + reuse of the 46 known hubs.
- Merging the 46 `hubs.json` records into the directory (kept separate at `/map`).
- Facebook-screenshot and user-link inputs still pending from the prior session.
