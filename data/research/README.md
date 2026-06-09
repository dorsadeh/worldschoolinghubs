# Hub research — review queue

`candidate-hubs-2026-06-08.csv` is a **review sheet**, not ingested data. Nothing here
is in `data/hubs/` yet. Workflow: you review/approve rows → I turn approved rows into
validated `data/hubs/*.json` (with `verified: false`, full `sources[]`).

## Where these came from
Mined from the structured directories in `data/sources.md`:
Worldschooly, The Worldschool Atlas, Worldly Tribe, WorldSchool Hubs blog,
World School Pop-Up Hub (events), Naturally Richer, plus targeted searches for the
Israeli seasonal-community hint (Bansko, Pai, Hoi An, Goa, Playa del Carmen).

All ~97 candidates are **already deduplicated against the existing 46** — exact matches
(Egyptian Adventures, Cacao Coast, Inside Romania, Antigua Global Explorers, The Hive,
Madrasa Dunya, Tazgha, El Salvador pop-up, Hoi An, KL, Austria retreats, etc.) were
dropped. The `dedup_status` column flags anything that *touches* an existing record.

## Columns
`confidence` — my trust in the data as captured:
- **High** — real website + clear single location + appears in 2+ directories, or famous/long-running. Safe to ingest with light checking.
- **Medium** — appears in a directory with a location and a site, but thin/single-source. Worth a quick verify before ingest.
- **Low** — mentioned in passing, no site, or an online/FB community/directory (per project rules these are discovery channels, not entries). Decide case-by-case.

`dedup_status` —
- **NEW** — genuinely new hub.
- **NEW-LOCATION of X** — another site of a brand you already have (e.g. Deliberate Detour Oaxaca/Guatemala).
- **RELATED to X** — same town/brand as an existing record; needs a keep-both-or-merge call (e.g. Worldschooling Tanzania ↔ Amani Light, both in Moshi).

## Open modeling decisions (these change what gets ingested)
1. **Networks** — Boundless Life (8 countries) and World School Pop-Up Hub (17 dated 2026 cities): one record each, or split per location? My recommendation: one record for true networks, but the 17 dated pop-up cities are good candidates for individual `recurring_event` records since they have real dates.
2. **Borderline "full schools"** — Green School Bali/SA/NZ, Camp Stomping Ground: include as hubs families orbit, or out of scope?
3. **Online/FB/directories** — bottom 4 rows: list as `online_community`, or log in `sources.md` only (current project rule leans to the latter)?

## Israeli-community seasonal hubs (your hint)
All five confirmed as worldschooling locations with public sources; the *specific
Israeli-run* programs mostly live in login-walled Facebook groups, so those rows are
Medium confidence and tagged "needs FB confirmation":
- **Bansko BG** — Worldschooling Bansko, winter ski season; Israeli families documented.
- **Pai TH** — Bliss Hubs Pai; an Israeli "forest school" relocated Goa→Pai.
- **Hoi An VN** — already in `data/hubs/`; Feb–May; strong Israeli/Chabad infrastructure.
- **Goa IN** — Worldschooling Hub Goa; Israeli community in Arambol.
- **Playa del Carmen MX** — Wildroots Worldschool + existing Sas Academy; large Israeli/Chabad presence.
