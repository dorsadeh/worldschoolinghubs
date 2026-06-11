#!/usr/bin/env python3
"""
One-off: transcribe data/research/external_llm_researches/deep-research-report-chatgpt-enrichment.md
(prose — ChatGPT had no JSON download this time) into our enrichment schema, keyed by directory id.

The report cites with opaque tokens (citeturn...), not URLs, so events/fields carry the
report's confidence but source=None; sourcesRead holds the hub's own site where known.
Corrections are emitted as flags (review-only, never auto-applied), per the chosen policy.

Output: data/research/external_llm_researches/chatgpt-enriched-2026-06-11.json
(filename contains "enriched" so build-enrichment.ts globs it; source "chatgpt" outranks gemini.)
"""
import json
from pathlib import Path

ASOF = "2026-06-11"
OUT = Path("data/research/external_llm_researches/chatgpt-enriched-2026-06-11.json")

records: list[dict] = []

def ev(title, type, start=None, end=None, recurrence="one-time", age=None, price=None, conf="high"):
    return {"title": title, "type": type, "startDate": start, "endDate": end,
            "recurrence": recurrence, "ageFocus": age, "price": price,
            "url": None, "confidence": conf, "asOf": ASOF}

def rec(id, events=None, timing=None, ageRange=None, priceRange=None, exactLocation=None,
        extras=None, flags=None, status="researched", sourcesRead=None):
    return {"id": id, "events": events or [], "timing": timing, "ageRange": ageRange,
            "priceRange": priceRange, "exactLocation": exactLocation, "extras": extras,
            "flags": flags or [], "researchStatus": status, "sourcesRead": sourcesRead or []}

def flag(field, cur, sug, note, conf="high"):
    return {"field": field, "currentValue": cur, "suggestedValue": sug,
            "evidence": None, "confidence": conf, "note": note}

# ─────────────────────────── event-rich hubs ───────────────────────────

# Worldschool Pop-Up Hub — week-long mobile gatherings, official events page (high conf).
popup_dates = [
    ("Medellín", "2026-06-07"), ("San Francisco", "2026-06-15"), ("Sibiu", "2026-06-17"),
    ("Mendocino", "2026-06-24"), ("Warsaw", "2026-06-28"), ("Austin", "2026-07-11"),
    ("Vienna", "2026-07-20"), ("Dresden", "2026-08-02"), ("Luang Prabang", "2026-08-10"),
    ("Liverpool", "2026-09-02"), ("Cuenca", "2026-09-05"), ("London", "2026-09-16"),
    ("Osaka", "2026-10-11"), ("Cape Town", "2026-10-21"), ("San Miguel de Allende", "2026-10-25"),
    ("Taipei", "2026-11-09"), ("Oaxaca", "2026-11-14"), ("Santiago", "2026-11-22"),
]
records.append(rec(
    "worldschool-pop-up-hub",
    events=[ev(f"Pop-Up Hub — {city} (week-long)", "popup", start=d) for city, d in popup_dates],
    ageRange={"value": "All ages", "minAge": None, "maxAge": None, "audience": "all-ages",
              "source": None, "confidence": "high"},
    extras={"otherNotes": "Week-long mobile gatherings for worldschooling families, not formal school terms."},
))

# WorldWise Learning Adventures — 2026 program slate (high dates; med age on Gazers conflict).
records.append(rec(
    "worldwise-learning",
    events=[
        ev("Mountain to Ocean (Argentina/Peru/Ecuador)", "session", "2026-02-09", "2026-06-05", age="4-13"),
        ev("Alpine Apothecaries (Switzerland)", "session", "2026-07-13", "2026-08-07", age="12-15"),
        ev("Espionage Engineers (Tallinn)", "session", "2026-08-17", "2026-09-10", age="12-15"),
        ev("Galactic Gazers (Provence)", "session", "2026-09-14", "2026-10-08",
           age="9-12 (page also says 8-15 — internal conflict)", conf="med"),
    ],
    ageRange={"value": "Varies by program, roughly 4-15", "minAge": 4, "maxAge": 15,
              "audience": "kids", "source": None, "confidence": "med"},
))

# Worldschooling Journeys (Every Avenue) — land trips + cruises (high dates; med price).
records.append(rec(
    "worldschooling-journeys-every-avenue",
    events=[
        ev("Xcaret Parks Family Adventure", "retreat", "2026-04-26", "2026-05-03"),
        ev("Austrian Mountain Summer Retreat", "retreat", None, None,
           age=None, price=None, conf="med"),  # report: "June/July 2026", no exact dates
        ev("Galapagos Island Hopping Tour", "retreat", "2026-08-24", "2026-08-31"),
        ev("Horseback Riding Dude Ranch Experience", "retreat", "2026-09-06", "2026-09-12"),
        ev("Austrian Mountain Fall Retreat", "retreat", "2026-09-07", "2026-09-21"),
        ev("Austrian Skiing & Christmas Markets Retreat", "retreat", "2026-12-04", "2026-12-18"),
        ev("Egypt & Jordan Adventure", "retreat", "2027-01-25", "2027-02-08"),
        ev("Cruise: Japan & Korea", "retreat", "2026-03-17", "2026-03-28"),
        ev("Cruise: Alaska from Vancouver", "retreat", "2026-05-06", "2026-05-16"),
        ev("Cruise: Transatlantic Florida to Barcelona", "retreat", "2026-08-18", "2026-09-01"),
        ev("Cruise: Japan Roundtrip", "retreat", "2026-08-26", "2026-09-05"),
        ev("Cruise: Icon of the Seas Caribbean", "retreat", "2026-09-19", "2026-09-26"),
        ev("Cruise: Mediterranean & Atlantic", "retreat", "2026-10-15", "2026-11-13"),
        ev("Cruise: Singapore to Bali", "retreat", "2026-11-26", "2026-12-09"),
        ev("Cruise: Panama Canal", "retreat", "2026-12-03", "2026-12-19"),
        ev("Cruise: Caribbean for neurodivergent families", "retreat", "2026-12-05", "2026-12-13"),
        ev("2027 land-trip placeholders: Morocco, Austria summer/fall, Austrian Christmas-market skiing",
           "retreat", None, None, recurrence="annual", conf="low"),
    ],
    priceRange={"value": "Per-trip; homepage routes families to dedicated trip pages for final pricing",
                "amount": None, "currency": None, "basis": "per-child-per-program",
                "source": None, "confidence": "med"},
))

# ÎleO Worldschool (leo-worldschool) — strong cohort structure in Willemstad, Curaçao.
records.append(rec(
    "leo-worldschool",
    events=[
        ev("Fall '26 cohort (arrival from Aug 29)", "cohort", "2026-09-01", "2026-12-02"),
        ev("Winter '27 cohort (arrival from Jan 2)", "cohort", "2027-01-04", "2027-04-02"),
        ev("Spring '27 cohort (arrival from Apr 10)", "cohort", "2027-04-12", "2027-07-02"),
        ev("Flexible December '26 stay window", "cohort", "2026-12-03", "2027-01-02"),
        ev("Summer Camp 1 — Marine Life", "session", "2026-07-05", "2026-07-16", conf="med"),
        ev("Summer Camp 2 — Creativity", "session", "2026-08-16", "2026-08-27", conf="med"),
    ],
    priceRange={"value": "Full Immersion bundle (housing, community, airport pickup); "
                "$250 one-time registration/child; optional $300/child/month meal plan",
                "amount": None, "currency": "USD", "basis": "per-child-per-program",
                "source": None, "confidence": "high"},
    exactLocation={"address": None, "locality": "Willemstad", "region": "Curaçao",
                   "country": "Curaçao", "coords": None, "source": None, "confidence": "high"},
    extras={"communitySize": "Cohorts capped at 6-10 families",
            "participation": "whole-family",
            "otherNotes": "Presented as a family ecosystem rather than a stand-alone school."},
))

# NYsKOOL — dated summer camp + current school fees + expansion.
records.append(rec(
    "nyskool",
    events=[
        ev("Smart Camp 2026 (Barcelona, Lisbon, online; Mon-Fri 9:00-16:00)", "session",
           "2026-06-29", "2026-07-31", age="6-9 and 10-13", price="€250/week (10% off all 5 weeks)"),
    ],
    ageRange={"value": "School accepts ages 5-17 (join any time); camp 6-13", "minAge": 5, "maxAge": 17,
              "audience": "all-ages", "source": None, "confidence": "high"},
    priceRange={"value": "€1,000 enrollment; €900/mo full-time in-person; €750 part-time; "
                "€600 hub-only; €450 online", "amount": 900, "currency": "EUR",
                "basis": "per-child-per-program", "source": None, "confidence": "high"},
    exactLocation={"address": "Carrer d'Espronceda 181, Poblenou", "locality": "Barcelona",
                   "region": "Barcelona", "country": "Spain", "coords": None,
                   "source": None, "confidence": "med"},
    extras={"otherNotes": "Poblenou (Barcelona) + Campolide (Lisbon) hubs operating; by Sep 2026 "
            "expanding to Castelldefels, Colares, Algarve, Estoril."},
    flags=[
        flag("ages", '{"min": 5, "max": 15}', "5-17", "Official site accepts applications for ages 5-17."),
        flag("price", "€600–€850 per month", "€900 FT / €750 PT / €600 hub / €450 online + €1,000 enrollment",
             "Current school-fees page is more specific; old range incomplete."),
        flag("season", "08/09/25 – 31/07/26 (11 months)", "Enrollment year-round; Smart Camp Jun 29-Jul 31 2026; expansion after Sep 2026",
             "Site says learners can join any time and publishes dated camp + expansion milestones."),
    ],
))

# Worldschooling Life — correction-heavy; published 2026-27 cycle start.
records.append(rec(
    "worldschooling-life",
    events=[ev("Inicio de ciclo 2026-2027", "cohort", "2026-09-01", None, recurrence="annual")],
    ageRange={"value": "Young people ages 12-18", "minAge": 12, "maxAge": 18, "audience": "teens",
              "source": None, "confidence": "high"},
    priceRange={"value": "MXN 5,440 registration; MXN 4,290/month (×12); MXN 49,450 annual; "
                "optional US accreditation USD 250", "amount": 4290, "currency": "MXN",
                "basis": "per-child-per-program", "source": None, "confidence": "high"},
    exactLocation={"address": "Parque Juan Diego 550, Zapopan, Jalisco 45040", "locality": "Zapopan",
                   "region": "Jalisco", "country": "México", "coords": None, "source": None, "confidence": "high"},
    flags=[
        flag("ages", '{"min": 6, "max": 18}', "12-18", "Official site explicitly says the program is for young people 12-18."),
        flag("season", "Ongoing (4 seasons)", "2026-27 cycle start Sept 1, 2026; year-round with formal fee schedule",
             "Live site publishes a concrete cycle start + year-round monthly pricing."),
        flag("price", "Varies depending on duration", "MXN 5,440 reg; MXN 4,290/mo; MXN 49,450/yr; USD 250 accreditation",
             "Public pricing page now exposes specific fees."),
    ],
))

# ─────────────────────────── Boundless network ───────────────────────────
# Common network extras + correction flags applied to every live destination.
BL_EXTRAS = {"languageOfInstruction": "English",
             "otherNotes": "Education centers 5 days/week 08:45-15:30, meals included, bi-weekly culture "
             "trips; €400 one-time enrollment/child. Pricing dynamic by destination & season."}
def boundless_flags(extra=None):
    base = [
        flag("season", "Year-round; join 1-12 months",
             "Fixed cohort blocks + camp windows now published for 2026-2027",
             "Every live destination page publishes discrete date blocks, not open-ended 'join anytime'."),
        flag("price", "€5,830-9,130/month",
             "Dynamic by destination; Apr-Jun 2026 examples ~€1,500 Bali / €1,700 Kotor / €2,100 Sintra-Tuscany / €2,300 Syros / €2,600 Andalusia; +€400 enrollment/child",
             "Live pricing calculator contradicts a single network-wide monthly figure.", conf="med"),
    ]
    return base + (extra or [])

def boundless_price(example_eur):
    return {"value": f"Apr-Jun 2026 example from ~€{example_eur:,}/month (dynamic by destination & season); "
            "+€400 one-time enrollment/child", "amount": example_eur, "currency": "EUR",
            "basis": "per-family-per-month", "source": None, "confidence": "med"}

BL_AGE = {"value": "Children 1.5-14 years", "minAge": 1, "maxAge": 14, "audience": "kids",
          "source": None, "confidence": "high"}

# Standard 2026 + 2027 World School blocks + summer camps (most destinations share these).
def bl_std_events(summer2026=None, summer2027=None, extra=None):
    e = [
        ev("World School — Winter block", "cohort", "2026-01-08", "2026-03-29"),
        ev("World School — Spring block", "cohort", "2026-04-04", "2026-06-28"),
        ev("World School — Autumn block", "cohort", "2026-09-08", "2026-11-29"),
        ev("World School 2027 — Winter block", "cohort", "2027-01-03", "2027-03-19"),
        ev("World School 2027 — Spring block", "cohort", "2027-03-25", "2027-06-10"),
    ]
    e += (summer2026 or [
        ev("Summer Camp 1", "session", "2026-07-04", "2026-07-31"),
        ev("Summer Camp 2", "session", "2026-08-06", "2026-09-02"),
    ])
    e += (summer2027 or [
        ev("Summer Camp 2027 — 1", "session", "2027-06-16", "2027-07-21"),
        ev("Summer Camp 2027 — 2", "session", "2027-07-27", "2027-08-21"),
    ])
    return e + (extra or [])

records.append(rec("boundless-sintra", events=bl_std_events(), ageRange=BL_AGE,
                   priceRange=boundless_price(2100), extras=BL_EXTRAS, flags=boundless_flags()))
records.append(rec("boundless-syros", events=bl_std_events(), ageRange=BL_AGE,
                   priceRange=boundless_price(2300), extras=BL_EXTRAS, flags=boundless_flags()))
records.append(rec(
    "boundless-tuscany",
    events=bl_std_events(
        summer2026=[ev("Summer Camp", "session", "2026-07-04", "2026-07-31"),
                    ev("December Camp", "session", "2026-12-10", "2027-01-02")],
        summer2027=[ev("Summer Camp 2027", "session", "2027-06-16", "2027-07-21"),
                    ev("World School 2027 — third block (TBA)", "cohort", None, None, conf="low"),
                    ev("December Camp 2027 (TBA)", "session", None, None, conf="low")],
    ),
    ageRange=BL_AGE, priceRange=boundless_price(2100), extras=BL_EXTRAS,
    flags=boundless_flags([flag("region", "Pelago, Tuscany", "Pistoia, Tuscany",
                                "Current destination page anchors the Tuscany hub in Pistoia.")]),
))
records.append(rec("boundless-kotor", events=bl_std_events(), ageRange=BL_AGE,
                   priceRange=boundless_price(1700), extras=BL_EXTRAS, flags=boundless_flags()))
records.append(rec(
    "boundless-estepona", events=bl_std_events(), ageRange=BL_AGE,
    priceRange=boundless_price(2600), extras=BL_EXTRAS,
    flags=boundless_flags([flag("name", "Boundless Estepona", "Boundless Andalusia (hub in Estepona)",
                                "Better normalized as Boundless Andalusia, with the hub in Estepona.", conf="med")]),
))
records.append(rec(
    "boundless-sanur-bali",
    events=bl_std_events(
        summer2026=[ev("Summer Camp", "session", "2026-07-04", "2026-08-15")],
        summer2027=[ev("Summer Camp 2027", "session", "2027-06-16", "2027-07-31")],
    ),
    ageRange=BL_AGE, priceRange=boundless_price(1500), extras=BL_EXTRAS,
    flags=boundless_flags([flag("region", "Sanur, Bali", "Sanur, Bali",
                                "Destination page frames the hub specifically around Sanur.", conf="low")]),
))
records.append(rec("boundless-kamakura", events=bl_std_events(), ageRange=BL_AGE,
                   priceRange=boundless_price(None) if False else None, extras=BL_EXTRAS,
                   flags=boundless_flags()))
records.append(rec(
    "boundless-la-barra",
    events=[ev("Fall 2026 — first Spanish-English dual-language program launch", "cohort",
               None, None, recurrence="annual", conf="med")],
    ageRange=BL_AGE, extras=BL_EXTRAS, status="ambiguous",
    flags=[flag("season", "Year-round; join 1-12 months",
                "Treat as stale; highest-confidence live change is the Fall 2026 dual-language rollout",
                "No location-specific date block surfaced in crawl; official post announces Fall 2026 dual-language program.")],
))

# ─────────────────── permanent hubs: location/age/price only (events: []) ───────────────────

records.append(rec(
    "tfa-worldschooling-hub", status="ambiguous",
    ageRange={"value": "7-17 for 8-week Worldschooling; WFS usually all ages to 17 (parents join)",
              "minAge": 7, "maxAge": 17, "audience": "all-ages", "source": None, "confidence": "high"},
    exactLocation={"address": None, "locality": "Raub", "region": "Pahang", "country": "Malaysia",
                   "coords": None, "source": None, "confidence": "high"},
    extras={"participation": "both",
            "otherNotes": "8-week Nomadic Worldschooling in Raub, Pahang (Sat-Wed); World Forestschooling "
            "min 2 days/1 night across Malaysia/Thailand/Indonesia. No public fixed 2026-2027 dates "
            "(families pushed to Telegram/application channels)."},
    flags=[
        flag("participation", "dropoff", "Mixed: flexible in 8-week WS; parents compulsory in WFS",
             "Official site says parent involvement depends on program type."),
        flag("ages", "Mixed", "7-17 (8-week WS); WFS all ages to 17 with parents",
             "Official FAQ is more explicit than the current value."),
    ],
))
records.append(rec(
    "wise-education", status="ambiguous",
    timing={"bestWindow": None, "avoidWindow": None, "note": "Rolling / flexible enrollment; no public dated calendar surfaced.",
            "source": None, "confidence": "med"},
    ageRange={"value": "School-age through teens (7-18)", "minAge": 7, "maxAge": 18, "audience": "all-ages",
              "source": None, "confidence": "med"},
    priceRange={"value": "$35/day, $150/week, $550/month", "amount": 550, "currency": "USD",
                "basis": "per-child-per-program", "source": None, "confidence": "med"},
    exactLocation={"address": "La Garita Nueva, Tamarindo", "locality": "Tamarindo", "region": "Guanacaste",
                   "country": "Costa Rica", "coords": None, "source": None, "confidence": "high"},
    flags=[flag("price", "~$150", "$35/day, $150/week, $550/month", "Live public listing shows a full day/week/month ladder.")],
))
records.append(rec(
    "madrasa-dunya-worldschool-morocco", status="ambiguous",
    ageRange={"value": "Age-structured groups ~1-7, 6/7-13, 12/13-18", "minAge": 1, "maxAge": 18,
              "audience": "all-ages", "source": None, "confidence": "high"},
    exactLocation={"address": "Route d'Ourika km 45, Belhouane-Aghbalou, 42152 Setti Fatma-Marrakech Safi",
                   "locality": "Belhouane (Ourika Valley)", "region": "Marrakech-Safi", "country": "Morocco",
                   "coords": None, "source": None, "confidence": "high"},
    extras={"otherNotes": "Reads as an evergreen hub; no dated 2026-2027 cohort calendar on public pages."},
))
records.append(rec(
    "wonder-intercultural-school", status="ambiguous",
    ageRange={"value": "Early Years + Primary Years 1-6", "minAge": 3, "maxAge": 12, "audience": "kids",
              "source": None, "confidence": "high"},
    exactLocation={"address": "Dusun Sekar Kuning, Desa Kuta, Kabupaten Lombok Tengah, Nusa Tenggara Barat",
                   "locality": "Kuta", "region": "Lombok", "country": "Indonesia", "coords": None,
                   "source": None, "confidence": "high"},
    extras={"participation": "drop-off", "otherNotes": "IPC transition + Indonesian curriculum support; no public 2026-2027 term grid."},
))
records.append(rec(
    "elate", status="ambiguous",
    ageRange={"value": "K-12 (ages 5+)", "minAge": 5, "maxAge": 18, "audience": "all-ages",
              "source": None, "confidence": "high"},
    priceRange={"value": "From 8,900 THB/month (~$260); STEAM 'Young Entrepreneurs' (5+) 5,950 THB/wk "
                "(1-8 wks), 5,550 (9-12), 4,950 (13-16) at Hua Hin", "amount": 8900, "currency": "THB",
                "basis": "per-child-per-program", "source": None, "confidence": "med"},
    exactLocation={"address": "Ramkhamhaeng 21, Bangkok; and 62/63 Phet Kasem Rd, Nong Kae, Hua Hin District, Prachuap Khiri Khan 77110",
                   "locality": "Bangkok / Hua Hin", "region": "Bangkok", "country": "Thailand",
                   "coords": None, "source": None, "confidence": "high"},
))
records.append(rec(
    "lumina-academy", status="ambiguous",
    ageRange={"value": "Ages 3-12, bilingual English-Spanish (Waldorf-inspired)", "minAge": 3, "maxAge": 12,
              "audience": "kids", "source": None, "confidence": "high"},
    exactLocation={"address": None, "locality": "El Puerto de Santa María", "region": "Cádiz",
                   "country": "Spain", "coords": None, "source": None, "confidence": "high"},
    extras={"languageOfInstruction": "Bilingual English-Spanish (Waldorf-inspired)",
            "otherNotes": "Limited spaces, first-come enrollment; Summer Camps/events sections exist but no public 2026-2027 dates/tuition surfaced."},
))
records.append(rec(
    "nature-lore", status="ambiguous",
    ageRange={"value": "Ages 5-17", "minAge": 5, "maxAge": 17, "audience": "all-ages",
              "source": None, "confidence": "med"},
    extras={"otherNotes": "Nature-centered worldschooling/homeschooling groups + regular/pop-in groups, "
            "workshops, camps; no public dated 2026-2027 calendar surfaced."},
))
records.append(rec(
    "tazgha-resort-essaouira", status="ambiguous",
    exactLocation={"address": "~15 miles north of Essaouira (Tazgha House, beachfront villa)",
                   "locality": "Essaouira", "region": "Essaouira", "country": "Morocco",
                   "coords": None, "source": None, "confidence": "med"},
    extras={"otherNotes": "Public front door is now Tazgha House retreat villa (retreats, halal holidays, "
            "Arabic immersion); homepage foregrounds a Muslim Men Retreat 2026, not a family worldschool calendar."},
    flags=[flag("season / price", "June – December; £1,200/month/family",
                "Treat as stale until revalidated — no public worldschool dates/prices surfaced",
                "Current public site no longer exposes a clear school-season or family tuition model.")],
))

# Worldschooling Bansko — program listing now shows dated winter/early-spring sessions.
records.append(rec(
    "worldschooling-bansko",
    events=[
        ev("Worldschooling Bansko — Session 1 (winter/ski)", "session", "2026-01-04", "2026-02-14",
           age="all-family"),
        ev("Worldschooling Bansko — Session 2 (winter/ski)", "session", "2026-02-22", "2026-04-04",
           age="all-family"),
    ],
    timing={"bestWindow": "Jan-early Apr (program winter/ski season)", "avoidWindow": None,
            "note": "Live program timing is winter/early spring; a separate organic family-cluster calendar "
            "was not verified.", "source": None, "confidence": "high"},
))

# ─────────────────── organic timing / risk windows (Thailand) ───────────────────
THAI_HAZE = {"bestWindow": "Nov-early Feb (cool, clear)",
             "avoidWindow": "Feb-Apr burning-season haze (worst Mar-early Apr)",
             "note": "Northern Thailand haze is a recurring Feb-Apr problem; spring 2026 saw severe Chiang Mai "
             "pollution in tourist season. Thailand also requires the Digital Arrival Card (since 2025-05-01).",
             "source": None, "confidence": "high"}
records.append(rec("pai", timing=dict(THAI_HAZE), status="researched"))
records.append(rec("chiang-mai", timing=dict(THAI_HAZE), status="researched"))
records.append(rec("our-land-thailand", timing=dict(THAI_HAZE), status="ambiguous",
    extras={"legalVisaRisk": "Thailand enforces foreign-work-scope rules; late-2025 Koh Phangan arrest of a "
            "foreign teacher for teaching outside permitted scope. Informal/parent-led education carries compliance risk."}))
records.append(rec("koh-phangan", status="researched",
    extras={"legalVisaRisk": "Late-2025: Thai authorities on Koh Phangan arrested a foreign teacher for teaching "
            "outside permitted document scope, framed as broader enforcement against unauthorized foreign work."},
    flags=[flag("legal risk", "(none recorded)", "Foreign-work-scope enforcement risk for informal teaching",
                "Real compliance risk for low-structure/parent-led education hubs in Thailand.", conf="med")]))
records.append(rec("narnia-arkee", status="researched",
    extras={"legalVisaRisk": "Koh Phangan informal-teaching enforcement risk (late-2025 arrest for out-of-scope teaching)."}))

# ─────────────────────────── write ───────────────────────────
OUT.write_text(json.dumps(records, ensure_ascii=False, indent=2) + "\n")
n_events = sum(len(r["events"]) for r in records)
n_flags = sum(len(r["flags"]) for r in records)
print(f"Wrote {len(records)} records, {n_events} events, {n_flags} flags → {OUT}")
