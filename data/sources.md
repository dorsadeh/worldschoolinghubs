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

- The Worldschool Atlas — https://theworldschoolatlas.com/
- Worldschooly hub directory — https://worldschooly.com/hubs/
- Worldly Tribe directory — https://worldlytribe.com/worldschooling-hubs-directory/
- WorldSchool Hubs blog/directory — https://blog.worldschoolhubs.com/worldschooling-hubs/
- Worldschooling Pop-Ups events map — https://www.worldschoolingpopups.com/events/map
- Passport Explorers list — https://passportexplorers.com/worldschooling-communities/
- Naturally Richer hubs (Algarve, Slovakia, Sardinia) — https://www.naturallyricher.com

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
