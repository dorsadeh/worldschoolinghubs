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
   - `proposedCategory`: `"inactive"` — when the hub appears REAL (not a dead listing) but neither current nor any found link works; it stays in the data, hidden from the site, until a link surfaces.
   - `resolutionNote`: one sentence — what you found and the evidence
     (e.g. "official site found via worldschooly outbound link; 2026 cohort dates on page")
6. Never invent. No evidence = `proposedUrl: null` + a note saying what you tried.

## Afterwards

Run `npm run audit:report` to regenerate the review report with your proposals,
and add any newly confirmed aggregator domains (see the report's "suspected"
section) to `data/research/aggregator-domains.json`.
