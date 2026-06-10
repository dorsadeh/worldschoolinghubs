# Design: Per-Entry Enrichment Deep-Research Prompt

**Date:** 2026-06-10
**Status:** Approved (design); pending spec review

## Purpose

A portable, LLM-agnostic prompt that takes the existing worldschooling-hub directory
(as a markdown file pasted in by the user) and, **for each hub**, returns a structured
record that:

1. Adds the missing **events** dimension (dated cohorts/sessions + recurring gatherings).
2. Adds **timing** guidance (best window / avoid window) for hubs with no formal events.
3. Upgrades the coarse existing fields — **age range, price range, exact location**.
4. Captures useful **extras** (booking link, nationality skew, participation, legal/visa risk…).
5. **Flags existing directory values that look wrong** (mis-tagged category, bad coords, stale season).

This is an **enrichment** prompt. It does NOT re-discover new hubs — that remains the job of
the existing discovery prompt (`data/research/deep-research-prompt.md`). It only enriches the
entries it is fed.

## Input contract

The user pastes a markdown list/table of directory entries. The prompt instructs the model to:

- Treat each entry's `name`, `country`, and `website`/reference links as **research anchors**.
- Echo back a stable key per record: the `id` if the input provides one, else `name|country`,
  so output rows line up on merge.
- Work best when the input carries the **current field values** (category, coords, season, ages,
  participation, nationality) — those are what the `flags[]` dimension compares against.

## Per-hub output schema

Output is **machine-first**: a JSON array, one object per input entry, keyed by `id`.

```jsonc
{
  "id": "bansko-town-base-city",
  "name": "Bansko Town",
  "country": "Bulgaria",

  "events": [
    {
      "title": "Boundless Life Bansko — Autumn cohort",
      "type": "cohort | session | retreat | popup | festival | conference | meetup | recurring-gathering",
      "startDate": "2026-09-01",      // ISO; null if only a month/season is known
      "endDate": "2026-12-15",        // ISO or null
      "recurrence": "annual | one-time",
      "ageFocus": "families, kids 3-12",
      "price": "from €X / family / cohort",
      "url": "https://...",           // the page the date came from
      "confidence": "high | med | low",
      "asOf": "2026-06-10"
    }
  ],

  "timing": {                          // for hubs with no formal events (organic towns)
    "bestWindow": "Nov–early Feb",
    "avoidWindow": "Feb–May (burning-season haze)",
    "note": "...",
    "source": "https://...",
    "confidence": "high | med | low"
  },

  "ageRange": {
    "value": "families with kids 3-12; some teens",
    "minAge": 3,
    "maxAge": 12,
    "audience": "kids | teens | all-ages | adults-too",
    "source": "https://...",
    "confidence": "high | med | low"
  },

  "priceRange": {
    "value": "≈ €3,500 / family / month",
    "amount": "3500",
    "currency": "EUR",
    "basis": "per-family-per-month | per-child-per-program | cost-of-living | free",
    "source": "https://...",
    "confidence": "high | med | low"
  },

  "exactLocation": {
    "address": "...",
    "locality": "Bansko",
    "region": "Blagoevgrad",
    "country": "Bulgaria",
    "coords": [41.83, 23.48],          // precise if findable; else null
    "source": "https://...",
    "confidence": "high | med | low"
  },

  "extras": {
    "officialWebsite": "https://...",
    "bookingUrl": "https://...",
    "nationalitySkew": "UK / Dutch / Israeli",
    "participation": "drop-off | whole-family | both",
    "languageOfInstruction": "English; Spanish-immersion option",
    "communitySize": "~200 families in season",
    "legalVisaRisk": "e.g. school-licensing raids; visa run cadence",
    "otherNotes": "free text"
  },

  "flags": [                           // existing input values that look wrong
    {
      "field": "category",
      "currentValue": "organic",
      "suggestedValue": "permanent-commercial",
      "evidence": "https://...",
      "confidence": "high | med | low",
      "note": "Site sells fixed cohorts — not an organic town."
    }
  ],

  "researchStatus": "researched | not-found | ambiguous",
  "sourcesRead": ["https://...", "https://..."]
}
```

### Field rules

- **Events window:** today (2026-06-10) → end of 2027. Past events excluded; far-future
  tentative dates allowed but marked `confidence: low`.
- **Events vs timing:** a *program/pop-up* gets real dated `events[]`; an *organic town* gets
  `events: []` plus a populated `timing` block. A town can have both (a winter program + an
  organic summer cluster) — emit multiple events and a timing block.
- **Audience parsing:** `audience` is the coarse bucket; `minAge`/`maxAge` are best-effort
  numeric extraction (null when only "all ages" is stated).

## Discipline rules (carried from the existing discovery prompt)

1. **Cite every fact.** Each field carries a `source` URL, `confidence`, and `asOf` date.
   Nothing is presented as confirmed; everything is blog/press-derived until the user validates.
2. **No hallucinated events.** If no dated events exist, `events: []` and `researchStatus`
   says why. Never invent cohorts or dates to fill the field.
3. **A homepage read is not a source read.** Go to the actual pricing / calendar / enrollment /
   contact pages. Homepages are thin; the date and price live on inner pages.
4. **Surface conflicts, don't smooth them.** If two sources disagree (especially on season or
   price), report both with their URLs rather than averaging.
5. **Research in English AND Hebrew** where relevant (Israeli-family sub-type), consistent with
   the project's Hebrew-source-as-first-class value.

## Output discipline

- Emit the JSON array and nothing else binding (a short prose preamble is fine but the array is
  the contract).
- Preserve input order and echo the key for every entry, including ones that came back empty —
  so the user can see coverage at a glance.
- End with a one-line honesty note: how many entries were genuinely researched vs. left
  `not-found`.

## Deliverable

A single new prompt file: `data/research/enrichment-research-prompt.md`, mirroring the structure
and "how to use" footer style of the existing `deep-research-prompt.md`.

## Out of scope

- Discovering new hubs (existing discovery prompt).
- Any pipeline/code change to ingest the output — that's a separate follow-up once the user has
  run the prompt and seen the shape of real results.
