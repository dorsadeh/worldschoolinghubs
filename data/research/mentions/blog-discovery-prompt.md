# Blog & source discovery prompt (for worldschooling "nesting place" mining)

Paste everything below the line into an LLM with web browsing (ChatGPT, Gemini, Claude,
Perplexity…). Run it in several LLMs and/or several times — each run should find a fresh
batch. Save each run's JSON output; it ingests directly into `source-registry.json`.

When new output arrives, update the **"Already known — do NOT return these"** list at the
bottom by appending the domains you ingested, so the next run doesn't repeat them.

---

## Your task

I am building a dataset of the most popular **organic places where worldschooling /
digital-nomad FAMILIES nest** — towns and regions where traveling families cluster for a
season or longer (e.g. Pai in Thailand, Bansko in Bulgaria). My signal for "popular" is:
*a place mentioned, independently, across many credible blogs/press*. So I need you to
find me the **SOURCES** — the blogs, articles, directories, and community pages that
describe these family-gathering places.

Find **as many high-quality sources as you can** this run (aim for 40+). Breadth matters,
but every entry must be real and verifiable.

### What counts as a good source (in rough priority order)
1. **Personal family blogs** — parents who worldschool / travel long-term and write about
   *where families gather* ("best worldschooling destinations", "where we based for the
   winter", town/destination guides written for traveling families).
2. **Press / magazine articles** about worldschooling or family digital-nomad hubs.
3. **Directories / community sites / forums** that list family-gathering towns, hubs, or
   meetups (including Facebook/Reddit/forum threads that name specific towns).
4. **Non-English sources — especially HEBREW** (Israeli families are a major worldschooling
   cohort): blogs, press (Ynet, Mako, etc.), and Facebook groups in Hebrew that discuss
   where Israeli families nest abroad. Also welcome: Spanish, German, Dutch, Russian.

### What is NOT what I want — exclude these
- Generic travel blogs / luxury-travel / honeymoon / backpacker content with **no
  family-gathering or worldschooling angle**.
- A single school's or program's own marketing site **unless** it also names the broader
  town/region as a place families gather (a program's homepage alone is low value here).
- Tourism-board pages, hotel/booking sites, listicles of "things to do."
- SEO content farms and AI-generated link lists.
- Anything where you cannot give a REAL, working URL.

### For each source, give me the page that actually NAMES places
The most useful URL is not always the homepage. Prefer the specific post/article that
*lists or describes the places families gather* — a "best worldschooling towns" listicle,
a destination round-up, a "where we worldschooled this year" post, or the blog's
destinations/location category page. Give 1–6 such URLs per source as `seedUrls`.

## Output format — STRICT JSON only

Return ONLY a JSON array (no prose around it). Each element:

```json
{
  "name": "Parenting & Passports",
  "domain": "parentingandpassports.com",
  "kind": "personal-blog | press | directory | forum",
  "lang": "en",
  "seedUrls": [
    "https://parentingandpassports.com/best-worldschooling-destinations/"
  ],
  "examplePlaces": ["Bansko", "Pai", "Chiang Mai"],
  "why": "Family worldschooling blog; this post ranks the towns where families cluster.",
  "asOf": "2025-08"
}
```

Field rules:
- `domain`: the bare registrable domain, lowercase, no `www`, no path.
- `kind`: your best single classification from the four allowed values.
- `lang`: ISO code (`en`, `he`, `es`, `de`, `nl`, `ru`, …).
- `seedUrls`: REAL URLs you have actually seen resolve. The post(s) that name places.
  Never invent a URL. If you only have the homepage, give the homepage and say so in `why`.
- `examplePlaces`: 1–8 specific towns/regions that source frames as family-gathering
  places (this proves the source is on-topic). Use [] only if truly none.
- `why`: one sentence — what the source is and why it qualifies.
- `asOf`: the source's most recent relevant date you can see ("YYYY-MM"), else `"unknown"`.

## Discipline (important)
- **Never fabricate** a domain, URL, or place. Unverifiable ⇒ omit it.
- Prefer sources updated in the last ~3 years; older is OK but note it in `asOf`.
- Deduplicate by domain within your output.
- Do **NOT** return any domain in the "Already known" list below — I already have those.
- Quality over quantity if forced to choose, but push for breadth.

## Already known — do NOT return these domains

actonacademyelsalvador.com, amanilight.com, anahataworldschoolingcommunity.com,
andeanglobalstudies.org, andorra.agorainternationalschool.es, antiguaworldschool.com,
arcticterns.global, bangkokpost.com, blattwerk-natur.de, blissinvestor.com,
blog.worldschoolhubs.com, boundless.life, brightsteps.worldschoolinghub.com,
cacaocoastcr.com, campstompingground.org, campusdaterra.org, cohli.com, culturechalk.org,
deliberatedetour.com, destinationlesstravel.com, dreambigtravels.com.au, earthbound.living,
earthschool.nz, east34.com, ecovillagegeorgia.ge, educationnext.in, educationthatinspires.com,
elateth.com, elaulaazul.com, escuela-montalban.com, espacioubuntu.org, exploringfamilies.eu,
facebook.com, fieldschoolhvar.org, fluenz.com, freedommontessoriacademy.com, futurehumanproject.co,
futurehumanschoolbali.com, gccckids.com, greencoco.org, greenschool.org, hakuba-is.jp,
harmonyalternative.com, harmonyeducation.net, heathandalyssa.com, holss.org, icomexico.com,
ileo.life, insideromania.ro, instagram.com, islowcoliving.com, iyariplay.org, kallipoli.org,
languaventure.com, luminaedu.org, m.facebook.com, maariv.co.il, mako.co.il, mama-adama.pt,
md-worldschoolmorocco.com, mingahousefoundation.org, naturallyricher.com, naturelore.co.za,
naturemind-ed.com, nobackhome.com, noma-collective.com, nyskool.org, ourlandthailand.com,
outsidetheboxadventures.com, panyaforest.com, parentingandpassports.com, pelangischoolbali.com,
portograna.wixsite.com, portugalpopup.com, projectworldschool.com, puntalabarca.com,
recreation.org, remotefamily.com, sacredrootshub.base44.app, samanainternationalacademy.com,
sanpedrospanishschool.com, sas.ac, scandasia.com, sekolykintana.org, selongbayschool.com,
semillitasspanishinnature.com, shantivillage.com, shepherdsrest.org, silvermistacademy.co.za,
soymontesser.com, spanishacademyantiguena.com, spiralaecovillage.com, storylines.com,
tabletmag.com, tazgha.com, thefutureiswise.com, thegoodlifemountainclub.com,
thehiveadventure.com, thehub.community, theredroadfoundation.org, theworld.school,
theworldschoolatlas.com, thinkglobalschool.org, thinkingnomads.com, tikaranch.com,
timesofisrael.com, travelingvillage.com, travelynnfamily.com, treehousebansko.com,
trvbox.co.il, twineagles.org, unschooladventures.com, valenciaforestschool.es, virtuosity.art,
vitalandomer.co.il, wanderworks.life, whalecamp.com, wildlingsforestschool.com,
wildrootsworldschool.com, wonderschool.cc, woodschoolbali.com, worldlytribe.com, worldschool.au,
worldschoolantigua.com, worldschoolcollective.com, worldschooling.life, worldschoolinghub.my,
worldschoolingjourneys.com, worldschoolmexico.com, worldschoolpopuphub.com, worldschooly.com,
worldtravelambitions.com, worldwiselearningadventures.org, wshluxor.com, ynet.co.il
