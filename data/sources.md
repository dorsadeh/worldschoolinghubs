# Sources Registry

Where hub data comes from, and what's left to mine. Every hub's `sources[]` should
reference one of these. Workflow: research a source → draft JSON into `data/hubs/`
with `verified: false` and full `sources[]` → review/confirm → set `verified: true`.

## Seed sources

- **Worldschooling Hubs Worldwide (Listing) — June 2026** (`manual_sources/`) —
  user-provided spreadsheet. ✅ **Fully ingested — 46 hubs** in `data/hubs/`.
- **Hub Listing 2024** (`manual_sources/`) — older version of the same sheet. Not yet
  ingested; use it to cross-check long-running hubs and add a second `sources[]`
  entry where a hub appears in both years (raises confidence / dedup signal).

## Open dedup reviews (flagged by `npm run validate`)

- `worldschool-antigua-guatemala` ↔ `antigua-guatemala-global-explorers` — different
  hosts (Alana O'Donohue vs Gabriela Alfaro), same town. Likely distinct; keep both.
- `austria-summer-retreat` ↔ `austria-winter-retreat` — same host/venue, different
  season. Intentionally separate records.

## Online directories to ingest (higher signal, structured-ish)

- The Worldschool Atlas — https://theworldschoolatlas.com/ ✅ mined 2026-06-08
- Worldschooly hub directory — https://worldschooly.com/hubs/ ✅ mined 2026-06-08 (70+ listings, paginated — only p1 captured so far)
- Worldly Tribe directory — https://worldlytribe.com/worldschooling-hubs-directory/ ✅ mined 2026-06-08 (richest single source)
- WorldSchool Hubs blog/directory — https://blog.worldschoolhubs.com/worldschooling-hubs/ ✅ mined 2026-06-08
- World School Pop-Up Hub events — https://worldschoolpopuphub.com/upcoming-events ✅ mined 2026-06-08 (17 dated 2026 cities)
- Worldschooling Pop-Ups events map — https://www.worldschoolingpopups.com/events/map (JS map — not yet mined)
- Passport Explorers list — https://passportexplorers.com/worldschooling-communities/ ✅ mined 2026-06-08
- Naturally Richer hubs (Algarve, Slovakia, Sardinia) — https://www.naturallyricher.com (Algarve hub captured via blog; direct page 404'd)
- Remote Family worldschooling database — https://remotefamily.com (filterable DB — not yet mined directly)
- WorldSchool Collective — https://worldschoolcollective.com (directory — not yet mined)

## Research queue (drafted, awaiting review)

- **`data/research/candidate-hubs-2026-06-08.csv`** — ~97 new candidates deduplicated
  against the existing 46, each with a confidence rating and dedup status. See
  `data/research/README.md` for the legend and open modeling decisions. Approve rows →
  ingest into `data/hubs/`.
- **`data/research/family-gathering-places-2026-06-08.md`** — a *different* signal:
  places where traveling/"nesting" families cluster (not necessarily formal hubs), mined
  from personal/family blogs in **English + Hebrew**, ranked by # of independent family
  references (key **R1–R101**; ~54 read/extracted, ~47 catalogued [lead] journals to mine).
  Keeps **digital-nomad signal separate from family signal** (see
  [[nomads-vs-families-distinction]]) and now carries a **Season (family-hub)** column +
  validation notes ([[hub-seasonality-and-validation]]) — e.g. Bansko is a *summer* family
  hub (Jul–Aug), Pai empties Feb–May (burning season). Includes **Section B: Israeli
  intentional / nesting communities** (Narnia/Koh Phangan, Naorma/Greece, Sentira/Italy,
  Spirala/Portugal, a Bulgaria co-op, the "משפחות מטיילות" conference). Gathering spots
  with no formal hub yet: Koh Phangan, Sri Lanka (Ahangama/Weligama), San Cristóbal.

## Hub candidates backlog (found via blog research, NOT yet in candidate-hubs CSV)

Surfaced 2026-06-09 via the Purely Pacha worldschool directory (R63) + others; need the
same draft→review→ingest workflow as the main CSV:
- Worldschooling Andalusia (S. Spain) · CADÍ Community (Spanish Pyrenees) · A Cielo Aperto
  (S. Italy) · Tribodar & Unter den Kiwis (Portugal eco-communities) · Die Lernwerkstatt
  Berlin (Germany) · Manitoulin Worldschooling Community (Canada, warm months) · Abraxas
  Fun & Devela World School (Mexico — Yucatán / Guanajuato) · Anahata (Yucatán, **Jun–Aug**)
  · Altos Eco Village (Colonia del Sacramento, Uruguay) · Lombok Learning Village (Indonesia)
  · Be Wild and Free (location-independent). Plus festivals: Schulfreifestival (Brandenburg,
  Sep), European Unschooling Conference (NL).

## Facebook groups & searches (discovery channel)

FB is login-walled — don't scrape. Instead, browse these and paste posts/pinned
content here or to the assistant for extraction.

- **Worldschooling Central** (~10K members) — very active, daily meetups.
- **Worldschoolers** — one of the most established communities.
- **WorldSchooling Hub** — facebook.com/WorldSchoolingHub (runs its own map).
- **Worldschool Hubs & Events** — facebook.com/groups/worldschool.hubs.events

In-group searches that surface hubs: `hub`, `pop-up` / `popup`, `summit`, `camp`,
`retreat`, `"this winter" / "this spring" + <country>`; also check each group's
**pinned posts** and **Events** tab.
