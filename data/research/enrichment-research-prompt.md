# DEEP RESEARCH TASK: Enrich each known worldschooling hub (events · ages · price · location)

> Portable prompt — feed to any LLM with web access, **together with the directory markdown**
> you want enriched. Unlike `deep-research-prompt.md` (which DISCOVERS new hubs), this one does
> NOT find new places: it takes the hubs I give it and fills in concrete, actionable, sourced
> facts for each one — above all the **upcoming events** that are currently missing.
> Copy everything below the line and paste my directory right after it.

---

You are a meticulous research analyst. I will give you a markdown directory of worldschooling /
traveling-family hubs. **For every entry I provide**, research the open web and return a single
structured record. Do not add hubs I didn't give you, and do not drop any — every input entry
gets exactly one output record, even if it comes back mostly empty.

Use each entry's **name + country + website / reference links as your research anchors.** Echo
back a stable key per record: the entry's `id` if the input has one, otherwise `name|country`.

## WHAT I WANT FOR EACH HUB

1. **Upcoming events — the priority.** Specific dated things a family could actually show up to,
   from **today through the end of 2027**:
   - **Programs / pop-ups / retreats:** enrollment cohorts and sessions with start/end dates.
   - **Recurring gatherings:** worldschooling summits/conferences, festivals, regular family
     meetups tied to the place.
   - Past events are excluded. Far-future or tentative dates are allowed but marked low
     confidence.
2. **Timing (when there are no formal events).** Many entries are *organic towns* (e.g. Pai,
   Bansko) with no calendar. For those, give the **best window** families cluster AND an
   **avoid window** with the reason — e.g. *"Pai: avoid ~Feb–May, burning-season haze"*;
   *"Bansko: best Jul–Aug for the summer family cluster."* A town can have BOTH a program
   (dated events) and an organic season (timing) — report both.
3. **Age range.** Who is it for — young kids, teens, all ages, adults-too? Give the stated text
   and a best-effort numeric min/max.
4. **Price range.** What it costs and on what basis — per-family-per-month, per-child-per-program,
   general cost-of-living, or free. Include currency and a number where you can.
5. **Exact location.** Street/area address, locality, region, and precise coordinates if findable
   (upgrade vague country-level guesses).
6. **Useful extras** (fill what you find): official website, booking/enrollment URL, nationality
   skew of the families there, drop-off vs. whole-family participation, language of instruction
   (and any Spanish-immersion angle), community size, and any **legal / visa / sovereignty risk**
   (e.g. school-licensing raids, visa-run cadence).
7. **Flag wrong existing values.** Where the value in MY input contradicts what you find, flag it:
   the field, my current value, your suggested value, the evidence URL, and a one-line why.
   (This works best when my input includes the current values — category, coords, season, ages,
   participation, nationality. Compare against them.)

## METHOD (do this, don't shortcut)

- **A homepage read is NOT a source read.** Dates, prices, and ages live on the inner pages —
  the calendar / pricing / enrollment / "apply" / contact pages. Go there.
- **Never invent an event.** If a hub has no dated events, return `events: []` and let
  `researchStatus` say why. Do not manufacture cohorts or dates to fill the field.
- **Cite every fact.** Each field carries a `source` URL, a `confidence` (high / med / low),
  and an `asOf` date. Nothing is "confirmed" — it's all blog/press/site-derived until I validate.
- **Surface conflicts, don't average them.** If two sources disagree (especially on season or
  price), report both with their URLs.
- **Research in English AND Hebrew** where the hub has an Israeli-family angle — Hebrew press
  (Ynet, Maariv, Mako) and Israeli family blogs are first-class sources and often hold details
  the English web misses.

## OUTPUT FORMAT

Return a **JSON array**, one object per input entry, **in the input's order**. A short prose
preamble is fine, but the array is the contract. Use exactly this shape (omit a field only when
you truly found nothing; prefer `null` + low confidence over silence):

```jsonc
{
  "id": "bansko-town-base-city",            // or "name|country" if no id in input
  "name": "Bansko Town",
  "country": "Bulgaria",

  "events": [
    {
      "title": "Boundless Life Bansko — Autumn cohort",
      "type": "cohort | session | retreat | popup | festival | conference | meetup | recurring-gathering",
      "startDate": "2026-09-01",            // ISO 8601; null if only a month/season is known
      "endDate": "2026-12-15",              // ISO 8601 or null
      "recurrence": "annual | one-time",
      "ageFocus": "families, kids 3-12",
      "price": "from €X / family / cohort",
      "url": "https://...",                 // the page the date came from
      "confidence": "high | med | low",
      "asOf": "2026-06-10"
    }
  ],

  "timing": {                               // for organic towns with no formal events
    "bestWindow": "Nov–early Feb",
    "avoidWindow": "Feb–May (burning-season haze)",
    "note": "...",
    "source": "https://...",
    "confidence": "high | med | low"
  },

  "ageRange": {
    "value": "families with kids 3-12; some teens",
    "minAge": 3,                            // null if only "all ages" stated
    "maxAge": 12,
    "audience": "kids | teens | all-ages | adults-too",
    "source": "https://...",
    "confidence": "high | med | low"
  },

  "priceRange": {
    "value": "≈ €3,500 / family / month",
    "amount": "3500",                       // numeric where possible; else null
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
    "coords": [41.83, 23.48],               // [lat, lng] precise if findable; else null
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
    "legalVisaRisk": "school-licensing raids; 90-day visa-run cadence",
    "otherNotes": "free text"
  },

  "flags": [                                // existing input values that look wrong
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

### Rules for the fields

- **Events window:** today → end of 2027. Nothing in the past.
- **Events vs. timing:** programs/pop-ups → real dated `events[]`; organic towns → `events: []`
  plus a populated `timing` block. If a place is both, emit the events AND the timing block.
- **Empty entries still ship:** if you couldn't find anything, return the object with the key,
  `researchStatus: "not-found"`, and whatever little you have — don't silently skip it.

## QUALITY BAR

Cite a source for every claim and keep `confidence` honest. Separate what you read from what you
inferred. Prefer "the program page lists a Sep 1–Dec 15 cohort at €X" over vague superlatives.
**End with one line of honesty:** how many entries you genuinely researched vs. left `not-found`,
and which hubs had the thinnest evidence.

---

## How to use this prompt

- **Paste my directory markdown directly after the line above.** Best results when each entry
  carries its current values (id, name, country, website, category, coords, season, ages,
  participation, nationality) so the `flags[]` comparison has something to check against.
- **This is the enrichment pass, not discovery.** To find NEW hubs, use
  `deep-research-prompt.md` instead. Keep the two outputs separate.
- **If the model truncates,** ask it to continue the JSON array from the last completed object —
  the per-entry key makes resuming unambiguous.
