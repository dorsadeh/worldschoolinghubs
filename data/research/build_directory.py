#!/usr/bin/env python3
"""Build one consolidated worldschooling-hub directory from all inputs
(PDF=46 JSONs, web candidates CSV, curated organic/traveling/Spanish entries),
auto-categorize per the 5-type taxonomy + participation tag, and emit JSON+CSV+HTML.
Auto-categorization is heuristic — meant for human review in the HTML."""
import json, glob, csv, html, urllib.parse, re, os
try:
    from PIL import Image as _PILImage
except Exception:
    _PILImage = None

def img_fit(path):
    """logos / small square images -> 'contain' (centered); photos -> 'cover'."""
    if not path or not _PILImage or not os.path.exists(path): return "cover"
    try:
        with _PILImage.open(path) as im: w,h = im.size
        if max(w,h) <= 180 and 0.7 <= (w/h) <= 1.4: return "contain"
    except Exception: pass
    return "cover"

ROOT = os.path.dirname(os.path.abspath(__file__))
HUBS = os.path.join(ROOT, "..", "hubs")

# ---- category + participation vocab -------------------------------------
CATS = {
    "organic":            ("🌍 Organic hub", "#2e7d32"),
    "permanent_commercial":("🏫 Permanent · commercial", "#1565c0"),
    "permanent_community": ("🌱 Permanent · community/eco", "#00897b"),
    "popup":              ("⚡ Pop-up", "#ef6c00"),
    "traveling":          ("🧭 Traveling program", "#6a1b9a"),
    "spanish_immersion":  ("🗣️ Spanish-immersion", "#c2185b"),
    "online":             ("💬 Online / discovery", "#757575"),
}
PART = {"dropoff":"🎒 drop-off", "family":"👪 whole-family", "mixed":"🔀 mixed", "":"—"}

# operators that MOVE with consistent staff -> traveling
TRAVELING = {"deliberate detour","project world school","wander & wonder","wander and wonder",
 "travelling village","traveling village","exploring families","arctic terns",
 "worldschooling journeys","every avenue","think global school","together explorers",
 "global classroom project","outside the box adventures","dream big travels",
 "unschool adventures","learn to sail","worldschooling dude ranch experience",
 "worldschooling austria","austria worldschooling","wanderlust schoolers","storylines",
 "worldschooling journeys (every avenue)"}
# standing resident communities / eco-villages -> permanent_community
COMMUNITY = {"kallipoli","panya forest","sacred roots hub","wild hearts collective",
 "folkortation","las semillitas","semillitas spanish in nature","selong bay worldschooling hub",
 "campus da terra","minga house","cohli family coliving","islowcoliving","noma collective",
 "we are tribe","kiriwi forest school","earthbound","ubuntu worldschool","mirleft cultural cove",
 "iyari play family learning retreat","the creative world"}
SPANISH_HINT = {"spanish","immersion","montessori","reggio"}
SPANISH_COUNTRIES = {"mexico","guatemala","spain","colombia","peru","ecuador","bolivia",
 "costa rica","el salvador","uruguay","argentina","dominican republic"}

# curated overrides keyed by lowercased name fragment: nationality / validity / season / cat / part
OV = {
 "bansko": dict(nat="UK / Dutch / Israeli", valid="High"),
 "bliss hubs pai": dict(nat="Israeli", valid="High", cat="organic", season="Nov–early Feb"),
 "worldschooling hub goa": dict(nat="Israeli (+ Russian)", valid="High", season="Nov–Apr"),
 "bliss hubs koh lanta": dict(nat="Swedish / Scandinavian", season="Nov–Apr"),
 "sas academy": dict(nat="US/Canadian + Israeli (Playa)", valid="Med"),
 "deliberate detour": dict(nat="US/Canadian + intl", valid="High"),
 "the hive": dict(valid="High", nat="Mixed intl"),
 "future human": dict(valid="DUP→Future Human School Bali", part="dropoff"),
 "worldschool pop-up hub": dict(valid="High", nat="Mixed intl"),
 "world school pop up el salvador": dict(valid="Med"),
 "amani light": dict(valid="Med (≈Worldschooling Tanzania)"),
 "languaventure": dict(part="dropoff", nat="British + intl"),
 "valencia forest school": dict(part="dropoff"),
 "green school": dict(part="dropoff", nat="Anglo-Western"),
 "nyskool": dict(part="dropoff"),
 "worldly teens": dict(part="dropoff", cat="online", valid="Low"),
 "jewish worldschoolers": dict(nat="Israeli/Jewish", cat="online", valid="Low"),
 "madrasa dunya": dict(nat="Mixed European"),
 "inside romania": dict(season="Jun–Jul (summer)"),
 "egyptian adventures": dict(season="Oct–Apr"),
 "sacred roots hub": dict(nat="Mixed intl (Spanish)", cat="permanent_community"),
 "cacao coast": dict(nat="Mixed intl"),
 "antigua guatemala global explorers": dict(nat="Mixed intl (Spanish)", cat="spanish_immersion"),
 "worldschool antigua guatemala": dict(cat="spanish_immersion", nat="Mixed intl"),
}

# directory sources -> their URLs (for the references list)
DIRS = {
 "WorldlyTribe":"https://worldlytribe.com/worldschooling-hubs-directory/",
 "Worldschooly":"https://worldschooly.com/hubs/",
 "Worldschool Atlas":"https://theworldschoolatlas.com/",
 "WorldschoolHubs blog":"https://blog.worldschoolhubs.com/worldschooling-hubs/",
 "RemoteFamily":"https://remotefamily.com/",
 "Bliss Hubs":"https://blissinvestor.com/",
 "PassportExplorers":"https://passportexplorers.com/worldschooling-communities/",
 "educationnext":"https://www.educationnext.in/",
}
# documented research references (R-keys) that mention specific places
REFS_BY_NAME = {
 "bansko":[("Parenting&Passports — Bansko (R8)","https://parentingandpassports.com/worldschooling-community-bansko-bulgaria/"),("Education Next — Bansko (R12)","https://www.educationnext.in/posts/bansko-the-world-schooling-capital-of-the-world"),("TRVbox (HE) — Bansko with kids (R94)","https://www.trvbox.co.il/bansko-with-kids/")],
 "pai":[("Bliss Investor — Pai (R19)","https://blissinvestor.com/community/world-schoolers-in-pai-thailand/"),("Bangkok Post — Pai nationalities (R105)","https://www.bangkokpost.com/thailand/general/2964833/israelis-under-immigration-microscope-in-pai")],
 "goa":[("Education Next — Goa (R13)","https://www.educationnext.in/posts/goa-a-paradise-for-worldschooling-families-with-a-global-flair"),("Tablet — Lost in Goa (R104)","https://www.tabletmag.com/sections/news/articles/lost-in-goa")],
 "koh lanta":[("Scandasia — Koh Lanta Swedish (R103)","https://scandasia.com/3397-taking-thaim-out-immensely-popular-among-the-swedes/"),("Parenting&Passports — Koh Lanta (R9)","https://parentingandpassports.com/")],
 "koh phangan":[("Mako (HE) — Narnia forest school (R34)","https://www.mako.co.il/home-family-kids/back_to_school/Article-0fb52656bdb0281027.htm"),("East34 (HE) — Israeli communities (R33)","https://east34.com/all-site/life-leisure/21542/")],
 "chiang mai":[("Worldly Tribe — Chiang Mai families (R6)","https://worldlytribe.com/family-friendly-guide-to-living-in-chiang-mai-thailand-for-digital-nomads/"),("Maariv (HE) — Israeli families Chiang Mai (R32)","https://www.maariv.co.il/news/world/article-1251250")],
 "hoi an":[("World Travel Ambitions — Hoi An (R15)","https://worldtravelambitions.com/blog/worldschooling-hoi-an-vietnam-5-year-journey-accident-to-intention/"),("Thinking Nomads — Hoi An (R109)","https://thinkingnomads.com/living-in-vietnam-with-children-hoi-an/")],
 "cyprus":[("Ynet (HE) — Limassol (R27)","https://www.ynet.co.il/news/article/yokra14738200"),("Times of Israel — ~800 families (R30)","https://www.timesofisrael.com/")],
 "limassol":[("Ynet (HE) — Limassol (R27)","https://www.ynet.co.il/news/article/yokra14738200")],
 "lisbon":[("Vital & Omer (HE) — Cascais/Lisbon (R98)","https://vitalandomer.co.il/kids")],
 "cascais":[("Vital & Omer (HE) — Cascais/Lisbon (R98)","https://vitalandomer.co.il/kids")],
 "antigua":[("Antigüeña Spanish Academy (R110)","https://www.spanishacademyantiguena.com/"),("No Back Home — Guatemala schools (R110)","https://nobackhome.com/spanish-schools-in-guatemala/")],
 "atitl":[("San Pedro Spanish School (R111)","https://sanpedrospanishschool.com/spanish-for-kids/")],
 "oaxaca":[("Instituto Cultural Oaxaca (R112)","https://www.icomexico.com/"),("Deliberate Detour (R76)","https://deliberatedetour.com/")],
 "san crist":[("Fluenz — Chiapas (R113)","https://fluenz.com/spanish-immersion/chiapas")],
 "sucre":[("Destinationless Travel — Sucre (R114)","https://destinationlesstravel.com/sucre-spanish-school/")],
 "cuenca":[("Andean Global Studies — Cuenca (R115)","https://www.andeanglobalstudies.org/spanish-schools-programs/cuenca-school-overview")],
 "granada":[("Escuela Montalbán — family Spanish (R118)","https://www.escuela-montalban.com/en/courses/spanish-for-families.php")],
 "think global":[("THINK Global School (R120)","https://thinkglobalschool.org/")],
 "together explorers":[("Together Explorers (R119)","https://www.facebook.com/thetogetherexplorers/")],
 "travelling village":[("Traveling Village","https://travelingvillage.com/village-3")],
 "boundless":[("Boundless Life — destinations","https://www.boundless.life/topic/destinations"),("Heath&Alyssa — Boundless ranked","https://heathandalyssa.com/we-tried-6-boundless-life-locations-heres-how-they-rank/")],
 "deliberate detour":[("Deliberate Detour","https://deliberatedetour.com/")],
 "project world school":[("Project World School","https://projectworldschool.com/")],
 "penang":[("TraveLynn Family — Penang (R44)","https://www.travelynnfamily.com/")],
 "kuala lumpur":[("Parenting&Passports — KL (R2)","https://parentingandpassports.com/worldschooling-slow-travel-southeast-asia/")],
 "spirala":[("Ynet (HE) — Israeli communities (R35)","https://www.ynet.co.il/news/article/yokra14738200")],
 "sentira":[("Ynet (HE) — Israeli communities (R35)","https://www.ynet.co.il/news/article/yokra14738200")],
 "progetto baita":[("Delikaktus (HE) — Valsesia (GPT R32)","https://www.tabletmag.com/")],
 "narnia":[("Mako (HE) — Narnia (R34)","https://www.mako.co.il/home-family-kids/back_to_school/Article-0fb52656bdb0281027.htm")],
 "storylines":[("Storylines — worldschooling","https://www.storylines.com/worldschooling")],
}
# one-line summaries for curated extras (keyed by lowercased name fragment)
CURATED_SUMMARY = {
 "pai":"Cool-season mountain town in N. Thailand where worldschooling families—heavily Israeli—cluster Nov–Feb, emptying out when burning-season haze arrives.",
 "chiang mai":"Decade-old SE-Asia family base with cafes, meetups and an intl/Israeli scene; families leave Feb–Apr for the burning season.",
 "goa (arambol":"Long-running Israeli (Arambol) and Russian (Morjim) winter-nesting coast in India with Hebrew kindergartens and beach playgroups, Nov–Mar.",
 "koh lanta":"The 'Swedish island' of Thailand—two accredited Swedish schools and a Scandinavian family bubble that runs Nov–Apr with the school calendar.",
 "koh phangan":"Tropical island with a dense (~2,500–4,000) Israeli family community and Hebrew forest/alt-schools; under legal scrutiny after 2026 school raids.",
 "hoi an":"Charming, walkable, affordable central-Vietnam base with a 30+ family worldschool community; comfortable Jan–May, avoid Oct–Nov floods.",
 "kuala lumpur":"Year-round Malaysian city repeatedly named the best SE-Asia base for homeschooling community and flexible long stays.",
 "penang":"Stable Malaysian 'school base' for SE-Asia slow travel, with deep German and British expat societies.",
 "cyprus":"Relocation-grade Israeli nesting base (~800 families Limassol/~400 Larnaca) with British/IB schools, Hebrew daycares and Chabad—year-round.",
 "lisbon":"Safe, walkable EU base; a US/British international scene plus a growing Israeli relocation cluster around Cascais/Lisbon.",
 "antigua":"The classic Latin-American Spanish-immersion town since the 1980s—cheap one-on-one lessons, homestays and flexible 1–5 week family stays.",
 "lake atitl":"Lakeside Guatemalan village whose cooperative Spanish schools run explicit kids-and-family immersion courses; long-stay traveler scene.",
 "oaxaca (spanish":"Cultural Mexican city with long-running immersion schools (Instituto Cultural Oaxaca) plus Deliberate Detour programs; worldschooling families nest here Nov–Apr.",
 "san crist":"Highland Chiapas town with Spanish schools (Tierras Mayas, Fluenz) where worldschooling families have based for months.",
 "sucre":"Bolivia's bargain Spanish-immersion capital (~$6/hr, clear accent) with a long-stay learner community where friendships form through the schools.",
 "cuenca":"Colonial highland Ecuadorian city—cheap Spanish immersion and bilingual schools anchor an established expat-family base.",
 "granada (family":"Andalusian city offering family Spanish courses (Escuela Montalbán, Enforex) with teacher-homestays—the EU option for immersion.",
 "think global school":"The world's first traveling high school: a boarding cohort of ~30 teens that moves to a new country every 8-week term (drop-off, not family co-travel).",
 "together explorers":"A traveling cohort of six families plus a teacher who journey together through Italy, Morocco, Egypt, Israel and Greece.",
 "travelling village":"A 20-family traveling community (American/Danish-founded) spending ~5 weeks each across Vietnam, Taiwan and South Korea per 4-month cohort.",
 "boundless life":"The biggest paid network—turn-key family campuses (co-living + learning + co-working) across 8 countries on rotating 3-month cohorts, ~€6–9k/mo.",
 "storylines":"A residential cruise-ship community offering 'traveling youth education' as the ship circumnavigates the globe (verify family fit).",
 "sentira":"Israeli 'international kibbutz' on ~160 acres near Arezzo, Italy—a standing intentional community for nesting families, warm-season peak.",
 "spirala":"Israeli ecological community on ~104 forested acres near Castelo Branco, Portugal.",
 "progetto baita":"Intentional international community in Italy's Valsesia Alps with ~25 permanent families and ~55 children, including Israelis.",
 "mama adama":"Israeli-founded eco-village network (founder Yariv Paz) helping families relocate to rural Portuguese natural-farming communes.",
 "narnia":"Israeli-founded forest/green school on Koh Phangan serving the island's large Israeli family community (under regulatory scrutiny).",
}

def norm(s): return re.sub(r"\s+"," ",(s or "").strip()).lower()

def host_domain(url):
    if not url: return ""
    u = url.strip()
    if not u.startswith("http"): u = "https://"+u
    try: return urllib.parse.urlparse(u).netloc.replace("www.","")
    except Exception: return ""

def fullurl(u):
    u = (u or "").strip()
    if not u: return ""
    return u if u.startswith("http") else "https://"+u

CATWORD = {"organic":"family-gathering destination","permanent_commercial":"commercial worldschool hub",
 "permanent_community":"intentional community / eco-village","popup":"pop-up gathering",
 "traveling":"traveling program","spanish_immersion":"Spanish-immersion cluster","online":"online community"}

def make_summary(e):
    n = norm(e["name"])
    notes = (e.get("notes") or "").strip()
    INTERNAL = ("merge","dedup","duplicate","verify","decide","treat as","flag","probable",
                "likely same","relate","could merge","possible same","dup","not yet","upcoming")
    # 1) prefer the entry's OWN description (PDF educational / candidate notes)
    if len(notes) >= 25 and not any(w in notes.lower() for w in INTERNAL):
        sents = re.split(r'(?<=[.!?])\s+', notes)
        out = " ".join(sents[:2]).strip()
        return (out[:240] + "…") if len(out) > 241 else out
    # 2) curated destination/program summaries (mostly for entries with no own text)
    for k,s in CURATED_SUMMARY.items():
        if k in n: return s
    loc = e.get("region") or e.get("country") or ""
    p = {"dropoff":"drop-off","family":"whole-family","mixed":"mixed"}.get(e.get("participation"),"")
    base = f"A {p+' ' if p else ''}{CATWORD.get(e['category'],'worldschooling hub')}"
    return (base + (f" in {loc}." if loc else ".")).strip()

def build_refs(e):
    refs = []
    w = fullurl(e.get("website"))
    if w and "facebook" not in w: refs.append(("Website", w))
    fb = fullurl(e.get("facebook"))
    if fb: refs.append(("Facebook / Instagram", fb))
    src = e.get("source") or ""
    if "PDF" in src:
        refs.append(("Worldschooling Hubs Worldwide (Listing) — June 2026  ·  manual_sources/", ""))
    for dn,du in DIRS.items():
        if dn.lower() in src.lower(): refs.append((dn+" directory", du))
    for k,lst in REFS_BY_NAME.items():
        if k in norm(e["name"]): refs += lst
    out, seen_u = [], set()
    for lbl,url in refs:
        key = url or lbl
        if key in seen_u: continue
        seen_u.add(key); out.append((lbl,url))
    return out

def _darken(hexc, f=0.6):
    h = hexc.lstrip("#"); r,g,b = int(h[0:2],16),int(h[2:4],16),int(h[4:6],16)
    return "#%02x%02x%02x" % (int(r*f),int(g*f),int(b*f))

def _xml(s):
    return (str(s or "").replace("&","&amp;").replace("<","&lt;").replace(">","&gt;")
            .replace('"',"&quot;").replace("'","&#39;"))

def _wrap(s, n=22, lines=2):
    words, out, cur = (str(s or "").split()), [], ""
    for w in words:
        if len(cur)+len(w)+1 <= n: cur = (cur+" "+w).strip()
        else:
            out.append(cur); cur = w
            if len(out) == lines: break
    if cur and len(out) < lines: out.append(cur)
    return out[:lines] or [str(s)[:n]]

def svg_thumb(e):
    """Locally-rendered cover image (data URI) — always displays, no network."""
    col = CATS.get(e["category"], ("","#475569"))[1]; col2 = _darken(col)
    emoji = CATS.get(e["category"], ("🌍",""))[0].split(" ")[0]
    tspans = "".join(f'<tspan x="26" dy="{34 if i else 0}">{_xml(t)}</tspan>'
                     for i,t in enumerate(_wrap(e["name"])))
    loc = e.get("region") or e.get("country") or ""
    svg = (f'<svg xmlns="http://www.w3.org/2000/svg" width="480" height="300">'
      f'<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">'
      f'<stop offset="0" stop-color="{col}"/><stop offset="1" stop-color="{col2}"/></linearGradient></defs>'
      f'<rect width="480" height="300" fill="url(#g)"/>'
      f'<text x="26" y="96" font-size="62">{emoji}</text>'
      f'<text font-family="system-ui,Arial,sans-serif" font-size="27" font-weight="700" fill="#fff" y="184">{tspans}</text>'
      f'<text x="26" y="262" font-family="system-ui,Arial,sans-serif" font-size="19" fill="#ffffffcc">{_xml(loc)}</text>'
      f'</svg>')
    return "data:image/svg+xml," + urllib.parse.quote(svg)

def screenshot(e):
    """Optional live website screenshot (progressive enhancement over the SVG)."""
    web = fullurl(e.get("website"))
    if web and "facebook" not in web:
        return "https://s.wordpress.com/mshots/v1/"+urllib.parse.quote(web, safe="")+"?w=480&h=300"
    return ""

def categorize(name, typ, audience, country, notes, edu):
    n, blob = norm(name), norm(" ".join([name or "", notes or "", edu or "", typ or ""]))
    cat = ""
    if any(t in n for t in TRAVELING): cat = "traveling"
    elif typ == "base_city" or "destination" in blob: cat = "organic"
    elif typ == "recurring_event" or any(k in blob for k in ["pop-up","pop up","gathering","summit","conference","camp","retreat","cruise","sailing"]):
        cat = "popup"
    elif typ == "online_community": cat = "online"
    elif typ == "permanent" or any(k in blob for k in ["school","academy","centre","center","coliving","co-living","hub","forest"]):
        cat = "permanent_commercial"
    else: cat = "permanent_commercial"
    if any(t in n for t in TRAVELING): cat = "traveling"
    if n in COMMUNITY or any(c in n for c in COMMUNITY):
        if cat in ("permanent_commercial","popup"): cat = "permanent_community"
    # spanish-immersion overlay (only if clearly language-led)
    spanish = (norm(country) in SPANISH_COUNTRIES) and any(w in blob for w in SPANISH_HINT)
    return cat, spanish

def participation(audience, name, edu, notes):
    a = norm(audience); blob = norm(" ".join([name or "", edu or "", notes or ""]))
    if "famil" in a or any(k in blob for k in ["coliving","co-living","gathering","whole family","together"]):
        p = "family"
    elif "child" in a or any(k in blob for k in ["school","academy","forest school","kindy","drop-off","drop off","kids program","enrichment program"]):
        p = "dropoff"
    elif a in ("adults",): p = "mixed"
    else: p = "family" if "famil" in a else ""
    return p

entries = []

# ---- 1. PDF (= 46 JSONs) -------------------------------------------------
for f in sorted(glob.glob(os.path.join(HUBS, "*.json"))):
    d = json.load(open(f))
    loc = d.get("location", {}) or {}
    name = d.get("name","")
    typ = d.get("type",""); aud = d.get("audience","")
    edu = d.get("educational",""); notes = (d.get("safety","") or "")
    cat, sp = categorize(name, typ, aud, loc.get("country",""), notes, edu)
    part = participation(aud, name, edu, notes)
    season = (d.get("schedule",{}) or {}).get("note","") or d.get("status","")
    entries.append(dict(name=name, host=d.get("host",""), category=cat, spanish=sp,
        participation=part, country=loc.get("country",""), region=loc.get("city",""),
        season=season, ages=json.dumps(d.get("ages",{}))[:60] if isinstance(d.get("ages"),dict) else str(d.get("ages","")),
        price=d.get("price",""), nationality="", validity="from PDF",
        website=(d.get("links",{}) or {}).get("website",""),
        facebook=(d.get("links",{}) or {}).get("facebook",""),
        source="PDF (June-2026 listing)", notes=edu[:200]))

# ---- 2. web candidates CSV ----------------------------------------------
cpath = os.path.join(ROOT, "candidate-hubs-2026-06-08.csv")
with open(cpath) as fh:
    for r in csv.DictReader(fh):
        name = r.get("name","")
        typ = {"permanent":"permanent","recurring_event":"recurring_event",
               "online_community":"online_community","base_city":"base_city"}.get(r.get("type",""), r.get("type",""))
        aud = r.get("ages",""); audfor = "families" if "famil" in (r.get("notes","")+name).lower() else ""
        cat, sp = categorize(name, typ, audfor, r.get("country",""), r.get("notes",""), "")
        part = participation(audfor, name, "", r.get("notes",""))
        entries.append(dict(name=name, host=r.get("host",""), category=cat, spanish=sp,
            participation=part, country=r.get("country",""), region=r.get("region_city",""),
            season=r.get("season_dates",""), ages=r.get("ages",""), price=r.get("price",""),
            nationality="", validity="web candidate ("+r.get("confidence","")+")",
            website=r.get("website",""), facebook=r.get("facebook_instagram",""),
            source="web research ("+r.get("source_directory","")+")", notes=r.get("notes","")[:200]))

# ---- 2b. inbox-approved candidates (Stage-2 discovery → user-approved) ----
apath = os.path.join(ROOT, "approved-candidates.csv")
if os.path.exists(apath):
    with open(apath, encoding="utf-8") as fh:
        for r in csv.DictReader(fh):
            name = r.get("name","")
            if not name: continue
            aud = r.get("ages",""); audfor = "families" if "famil" in (r.get("notes","")+name).lower() else ""
            cat, sp = categorize(name, r.get("type",""), audfor, r.get("country",""), r.get("notes",""), "")
            part = participation(audfor, name, "", r.get("notes",""))
            entries.append(dict(name=name, host=r.get("host",""), category=cat, spanish=sp,
                participation=part, country=r.get("country",""), region=r.get("region_city",""),
                season=r.get("season_dates",""), ages=r.get("ages",""), price=r.get("price",""),
                nationality="", validity="inbox-approved",
                website=r.get("website",""), facebook=r.get("facebook_instagram",""),
                source="inbox ("+r.get("source_directory","")+")", notes=r.get("notes","")[:200]))

# ---- 3. curated extras (organic destinations, Spanish towns, traveling) --
EXTRA = [
 ("Pai","organic","family","Thailand","Mae Hong Son","Nov–early Feb","Israeli (visible) / UK by headcount","High","",""),
 ("Chiang Mai","organic","family","Thailand","Chiang Mai","Nov–early Feb","Intl + Israeli","High","",""),
 ("Goa (Arambol/Mandrem)","organic","family","India","Arambol","Nov–Mar","Israeli + Russian","High","",""),
 ("Koh Lanta","organic","family","Thailand","Koh Lanta","Nov–Apr/May","Swedish/Scandinavian","High","",""),
 ("Koh Phangan","organic","family","Thailand","Koh Phangan","Nov–Apr","Israeli (+Russian/French)","High","",""),
 ("Hoi An / An Bang","organic","family","Vietnam","Hoi An","Jan–May","Anglophone intl + Israeli","High","",""),
 ("Kuala Lumpur","organic","family","Malaysia","KL","Year-round","Mixed intl","High","",""),
 ("Penang","organic","family","Malaysia","Penang","Year-round","German + British","Med","",""),
 ("Cyprus (Limassol/Larnaca)","organic","family","Cyprus","Limassol","Year-round","Israeli + British + Russian","High","",""),
 ("Lisbon / Cascais","organic","family","Portugal","Lisbon","Year-round","US/British + Israeli","Med","",""),
 ("Antigua","spanish_immersion","family","Guatemala","Antigua","Year-round (dry Nov–Apr)","Mixed intl","High","https://www.spanishacademyantiguena.com/",""),
 ("Lake Atitlán (San Pedro)","spanish_immersion","family","Guatemala","San Pedro La Laguna","Year-round","Mixed intl","High","https://sanpedrospanishschool.com/",""),
 ("Oaxaca (Spanish schools)","spanish_immersion","family","Mexico","Oaxaca","Nov–Apr","US/Canadian + intl","High","https://www.icomexico.com/",""),
 ("San Cristóbal de las Casas","spanish_immersion","family","Mexico","San Cristóbal","Nov–Apr","Mixed intl","Med","",""),
 ("Sucre","spanish_immersion","family","Bolivia","Sucre","Year-round","Mixed intl","Med","https://destinationlesstravel.com/sucre-spanish-school/",""),
 ("Cuenca","spanish_immersion","family","Ecuador","Cuenca","Year-round","Mixed intl","Med","",""),
 ("Granada (family Spanish)","spanish_immersion","family","Spain","Granada","Year-round","Mixed European","Med","https://www.escuela-montalban.com/",""),
 ("THINK Global School","traveling","dropoff","multi","4 countries/yr","Year-round (8-wk terms)","Mixed intl","High","https://thinkglobalschool.org/",""),
 ("Together Explorers","traveling","family","multi","Italy→Morocco→Egypt→Israel→Greece","Multi-country cohort","American/Danish-led","High","https://www.facebook.com/thetogetherexplorers/",""),
 ("Travelling Village","traveling","family","multi","Vietnam/Taiwan/S.Korea","Jan–Apr 2026 cohort","American/Danish-led","High","https://travelingvillage.com/",""),
 ("Boundless Life","permanent_commercial","family","multi","8 campuses","Year-round (3-mo cohorts)","US/UK/German/Brazilian","High","https://www.boundless.life/",""),
 ("Storylines (ship)","traveling","family","multi","Global (ship)","Year-round","Mixed intl","Low (verify)","https://www.storylines.com/worldschooling",""),
 ("Sentira","permanent_community","family","Italy","Arezzo","Apr–Oct","Israeli","Med","",""),
 ("Spirala Eco Village","permanent_community","family","Portugal","Castelo Branco","Year-round","Israeli","Med","",""),
 ("Progetto Baita","permanent_community","family","Italy","Valsesia","Year-round","Israeli + intl","Med","",""),
 ("Mama Adama","permanent_community","family","Portugal","Alentejo","Year-round","Israeli","Med","",""),
 ("Narnia / Arkee","permanent_community","dropoff","Thailand","Koh Phangan","Nov–Apr","Israeli","Med (⚠ legal)","",""),
]
for (name,cat,part,country,region,season,nat,valid,web,fb) in EXTRA:
    entries.append(dict(name=name, host="", category=cat, spanish=(cat=="spanish_immersion"),
        participation=part, country=country, region=region, season=season, ages="", price="",
        nationality=nat, validity=valid, website=web, facebook=fb,
        source="web research (gathering-places + Spanish cut + traveling)", notes=""))

# ---- apply curated overrides --------------------------------------------
for e in entries:
    n = norm(e["name"])
    for key,ov in OV.items():
        if key in n:
            if ov.get("nat"): e["nationality"] = ov["nat"]
            if ov.get("valid"): e["validity"] = ov["valid"]
            if ov.get("season"): e["season"] = ov["season"]
            if ov.get("cat"): e["category"] = ov["cat"]
            if ov.get("part"): e["participation"] = ov["part"]

# ---- dedup by normalized name (keep first; merge sources) ----------------
seen = {}
for e in entries:
    k = norm(e["name"])
    if k in seen:
        if e["source"] not in seen[k]["source"]:
            seen[k]["source"] += " + " + e["source"].split(" (")[0]
        seen[k]["dups"] = seen[k].get("dups",1)+1
    else:
        seen[k] = e
final = list(seen.values())
for e in final:
    for k in list(e.keys()):
        if e[k] is None: e[k] = ""

# 0af7902 split Boundless Life into per-location hubs directly in the JSON artifact;
# reproduce that split here so rebuilds keep the 8 granular ids (enrichment/geocoding key on them).
BOUNDLESS_LOCATIONS = [
    ("boundless-sintra",     "Boundless Sintra",   "Portugal",   "Sintra"),
    ("boundless-syros",      "Boundless Syros",    "Greece",     "Syros (Ermoupoli)"),
    ("boundless-tuscany",    "Boundless Tuscany",  "Italy",      "Pelago, Tuscany"),
    ("boundless-estepona",   "Boundless Estepona", "Spain",      "Estepona"),
    ("boundless-kotor",      "Boundless Kotor",    "Montenegro", "Kotor"),
    ("boundless-sanur-bali", "Boundless Sanur",    "Indonesia",  "Sanur, Bali"),
    ("boundless-la-barra",   "Boundless La Barra", "Uruguay",    "La Barra, Maldonado"),
    ("boundless-kamakura",   "Boundless Kamakura", "Japan",      "Kamakura"),
]
_expanded = []
_boundless_split_fired = False
for e in final:
    if norm(e["name"]) == "boundless life":
        _boundless_split_fired = True
        for (_id, _name, _country, _region) in BOUNDLESS_LOCATIONS:
            clone = dict(e)
            clone["id"] = _id
            clone["name"] = _name
            clone["country"] = _country
            clone["region"] = _region
            clone["notes"] = f"Boundless Life location in {_region}. " + e["notes"]
            clone.pop("dups", None)  # clones are fresh splits, not dedup merges
            _expanded.append(clone)
    else:
        _expanded.append(e)
if not _boundless_split_fired:
    raise SystemExit("ERROR: 'Boundless Life' source row missing — Boundless split did not fire; "
                     "enrichment/geocoding ids (boundless-*) would be lost. Check the CSV/EXTRA inputs.")
final = _expanded

final.sort(key=lambda e:(list(CATS).index(e["category"]) if e["category"] in CATS else 9, (e.get("country") or ""), (e.get("name") or "")))

# ---- enrich: id, summary, references, photo -----------------------------
_imap_path = os.path.join(ROOT, "images-map.json")
IMAP = json.load(open(_imap_path)) if os.path.exists(_imap_path) else {}
_ov_path = os.path.join(ROOT, "overrides.json")
OVERRIDES = {}
if os.path.exists(_ov_path):
    with open(_ov_path, encoding="utf-8") as _f:
        OVERRIDES = json.load(_f)
used_ids = set()
for e in final:
    # Honor a pre-set id (e.g. from the Boundless split) as the slug base.
    if e.get("id"):
        base = e["id"]
    else:
        base = re.sub(r"[^a-z0-9]+","-",norm(e["name"])).strip("-")[:42] or "entry"
    eid, j = base, 2
    while eid in used_ids: eid = f"{base}-{j}"; j += 1
    used_ids.add(eid); e["id"] = eid
    # id-keyed overrides from audit:apply; applied after the name-keyed OV heuristics so these win.
    # NOTE: eid derives from the deduped sorted name — a future duplicate slug gains a -2 suffix
    # and an override keyed to the old bare id silently no-ops. Re-check after adding entries.
    o = OVERRIDES.get(eid)
    if o:
        for k in ("website", "facebook", "category", "categories", "websiteType"):
            if k in o: e[k] = o[k]
    e["summary"] = make_summary(e)
    e["references"] = build_refs(e)
    e["thumb"] = svg_thumb(e)              # always-render local cover (data URI)
    e["photo"] = IMAP.get(e["id"], "")     # real local image overlay (hub-images/…), if any
    e["fit"] = img_fit(e["photo"])         # 'contain' for logos, 'cover' for photos

# ---- outputs: JSON + CSV -------------------------------------------------
json.dump(final, open(os.path.join(ROOT,"directory-consolidated-2026-06-09.json"),"w"), indent=2, ensure_ascii=False)
cols = ["name","category","spanish","participation","country","region","season","summary","ages","price","nationality","validity","website","facebook","source","host"]
with open(os.path.join(ROOT,"directory-consolidated-2026-06-09.csv"),"w",newline="") as fh:
    w = csv.DictWriter(fh, fieldnames=cols+["references"], extrasaction="ignore"); w.writeheader()
    for e in final:
        row = dict(e); row["references"] = " ; ".join(f"{l}: {u}" for l,u in e["references"])
        w.writerow(row)

# ---- HTML report ---------------------------------------------------------
def esc(s): return html.escape(str(s or ""))
cards_by_cat = {}
for e in final: cards_by_cat.setdefault(e["category"], []).append(e)
DATA = {e["id"]: {k:e.get(k) for k in ("name","category","summary","photo","thumb","fit",
        "country","region","season","ages","price","nationality","validity","participation",
        "source","references")} for e in final}

CSS = """<style>
:root{font-family:system-ui,Segoe UI,Roboto,Helvetica,Arial,sans-serif}
body{margin:0;background:#f4f5f7;color:#1a1a1a}
header{background:#0f172a;color:#fff;padding:18px 22px;position:sticky;top:0;z-index:5}
header h1{margin:0 0 4px;font-size:20px}header p{margin:0;opacity:.8;font-size:13px}
.controls{padding:12px 22px;background:#fff;border-bottom:1px solid #e5e7eb;position:sticky;top:62px;z-index:4;display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.controls input{flex:1;min-width:200px;padding:8px 10px;border:1px solid #cbd5e1;border-radius:8px;font-size:14px}
.chip{font-size:11px;padding:3px 8px;border-radius:999px;color:#fff;white-space:nowrap}
.filterbtn{cursor:pointer;border:1px solid #cbd5e1;background:#fff;border-radius:999px;padding:5px 10px;font-size:12px}
.filterbtn.off{opacity:.35}
section{padding:6px 22px 26px}
section h2{font-size:16px;margin:18px 0 10px;border-left:5px solid #999;padding-left:10px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:14px}
.card{background:#fff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;display:flex;flex-direction:column;box-shadow:0 1px 2px rgba(0,0,0,.05);cursor:pointer;transition:box-shadow .15s,transform .15s}
.card:hover{box-shadow:0 6px 18px rgba(0,0,0,.14);transform:translateY(-2px)}
.thumb{height:148px;background:#e2e8f0 center/cover no-repeat;overflow:hidden;position:relative}
.thumb img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block;opacity:0;transition:opacity .4s}
.thumb img.contain,.mphoto img.contain{object-fit:contain;background:#fff;padding:14px;box-sizing:border-box}
.body{padding:10px 12px;display:flex;flex-direction:column;gap:5px;flex:1}
.card h3{margin:0;font-size:15px;line-height:1.2}
.meta{font-size:12px;color:#475569;display:flex;flex-wrap:wrap;gap:5px;align-items:center}
.summary{font-size:12px;color:#475569;margin:1px 0;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
.kv{font-size:12px;color:#334155}.kv b{color:#0f172a}
.cardfoot{display:flex;justify-content:space-between;align-items:center;margin-top:auto;padding-top:4px}
.badgeval{font-size:11px;font-weight:600}.reflink{font-size:11px;color:#1d4ed8}
.count{font-size:12px;color:#64748b;font-weight:400}
.modal{display:none;position:fixed;inset:0;background:rgba(15,23,42,.62);z-index:20;overflow:auto}
.modal.open{display:block}
.sheet{background:#fff;max-width:620px;margin:34px auto;border-radius:14px;overflow:hidden;position:relative}
.mphoto{height:250px;background:#e2e8f0 center/cover no-repeat;position:relative;overflow:hidden}
.mphoto img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:0;transition:opacity .4s}
.sheet h2{margin:14px 16px 4px;font-size:20px}
#mbadges{margin:0 16px 8px;display:flex;gap:6px;flex-wrap:wrap}
#msum{margin:0 16px 12px;color:#334155;font-size:14px;line-height:1.45}
.mmeta{margin:0 16px 12px;font-size:13px;display:grid;grid-template-columns:1fr 1fr;gap:5px 14px}
.mmeta b{color:#0f172a}
.sheet h4{margin:12px 16px 4px;font-size:13px;color:#0f172a;text-transform:uppercase;letter-spacing:.03em}
ul.refs{margin:0 16px 20px;padding-left:18px;font-size:13px}ul.refs li{margin:4px 0}
ul.refs a{color:#1d4ed8}
.x{position:absolute;top:10px;right:12px;border:none;background:rgba(0,0,0,.5);color:#fff;width:32px;height:32px;border-radius:50%;cursor:pointer;font-size:16px}
</style>"""

def valcolor(v):
    v=v or ""
    if v.startswith("High"): return "#16a34a"
    if "DUP" in v: return "#9333ea"
    if v.startswith("Low"): return "#dc2626"
    return "#d97706"

parts = ["<!doctype html><html lang=en><head><meta charset=utf-8>",
 "<meta name=viewport content='width=device-width,initial-scale=1'>",
 "<title>Worldschooling Hub Directory</title>", CSS, "</head><body>"]
parts.append("<header><h1>Worldschooling Hub Directory — consolidated</h1>"
 f"<p>{len(final)} entries · PDF (June-2026 listing) + web research + curated · click any card for its summary & the references that mention it · auto-categorized for review (2026-06-09)</p></header>")
parts.append("<div class=controls><input id=q placeholder='Search name, country, nationality…' oninput=flt()>")
for c,(lbl,col) in CATS.items():
    parts.append(f"<span class=filterbtn data-cat='{c}' style='border-color:{col}' onclick=tog(this)>{esc(lbl)}</span>")
parts.append("</div>")

for c,(lbl,col) in CATS.items():
    items = cards_by_cat.get(c,[])
    if not items: continue
    parts.append(f"<section data-sec='{c}'><h2 style='border-color:{col}'>{esc(lbl)} <span class=count>({len(items)})</span></h2><div class=grid>")
    for e in items:
        overlay = (f"<img class={'contain' if e.get('fit')=='contain' else 'cover'} loading=lazy src=\"{esc(e['photo'])}\" onload=\"this.style.opacity=1\" onerror=\"this.remove()\" alt=\"\">") if e["photo"] else ""
        img = f"<div class=thumb style=\"background-image:url('{e['thumb']}')\">{overlay}</div>"
        part = esc(PART.get(e["participation"],""))
        nref = len(e["references"])
        blob = esc(" ".join([e["name"],e["country"],e.get("region",""),e.get("nationality",""),e.get("season","")]).lower())
        parts.append(
         f"<div class=card data-cat='{e['category']}' data-s=\"{blob}\" onclick=\"openModal('{e['id']}')\">{img}"
         f"<div class=body><h3>{esc(e['name'])}</h3>"
         f"<div class=meta>📍 {esc(e['country'])}{(' · '+esc(e['region'])) if e.get('region') else ''} <span class=chip style='background:{col}'>{part}</span></div>"
         f"<p class=summary>{esc(e['summary'])}</p>"
         f"<div class=cardfoot><span class=badgeval style='color:{valcolor(e.get('validity'))}'>{esc(e.get('validity') or '—')}</span>"
         f"<span class=reflink>🔗 {nref} ref{'s' if nref!=1 else ''} ›</span></div>"
         "</div></div>")
    parts.append("</div></section>")

parts.append("<div id=modal class=modal onclick='if(event.target==this)closeModal()'><div class=sheet>"
 "<button class=x onclick=closeModal()>✕</button><div class=mphoto id=mphoto></div>"
 "<h2 id=mname></h2><div id=mbadges></div><p id=msum></p><div class=mmeta id=mmeta></div>"
 "<h4>Referenced in / sources</h4><ul class=refs id=mrefs></ul></div></div>")

CATLBL = {k:v[0] for k,v in CATS.items()}; CATCOL = {k:v[1] for k,v in CATS.items()}
parts.append("<script>")
parts.append("const DATA="+json.dumps(DATA, ensure_ascii=False)+";")
parts.append("const CATLBL="+json.dumps(CATLBL)+";const CATCOL="+json.dumps(CATCOL)+";")
parts.append("const PARTLBL="+json.dumps(PART)+";")
parts.append(r"""
function openModal(id){const d=DATA[id];if(!d)return;
 const mp=document.getElementById('mphoto');mp.style.backgroundImage="url(\""+d.thumb+"\")";
 mp.innerHTML=d.photo?"<img class='"+(d.fit=='contain'?'contain':'cover')+"' src='"+d.photo+"' onload='this.style.opacity=1' onerror='this.remove()'>":"";
 document.getElementById('mname').textContent=d.name;
 const col=CATCOL[d.category]||'#555';
 document.getElementById('mbadges').innerHTML=
   "<span class=chip style='background:"+col+"'>"+(CATLBL[d.category]||d.category)+"</span>"+
   (d.participation?"<span class=chip style='background:#374151'>"+(PARTLBL[d.participation]||d.participation)+"</span>":"")+
   (d.nationality?"<span class=chip style='background:#0f766e'>"+d.nationality+"</span>":"");
 document.getElementById('msum').textContent=d.summary||"";
 const m=[["Country",d.country],["Region",d.region],["Season",d.season],["Ages",d.ages],["Price",d.price],["Validity",d.validity],["Source",d.source]];
 document.getElementById('mmeta').innerHTML=m.filter(x=>x[1]).map(x=>"<div><b>"+x[0]+":</b> "+x[1]+"</div>").join("");
 const refs=d.references||[];
 document.getElementById('mrefs').innerHTML=refs.length?refs.map(r=>r[1]?"<li><a href='"+r[1]+"' target=_blank rel=noopener>"+r[0]+"</a></li>":"<li>"+r[0]+"</li>").join(""):"<li>No documented links captured yet.</li>";
 document.getElementById('modal').classList.add('open');document.body.style.overflow='hidden';}
function closeModal(){document.getElementById('modal').classList.remove('open');document.body.style.overflow='';}
document.addEventListener('keydown',e=>{if(e.key=='Escape')closeModal();});
const on=new Set(Object.keys(CATLBL));
function tog(el){const c=el.dataset.cat;el.classList.toggle('off');on.has(c)?on.delete(c):on.add(c);flt();}
function flt(){const q=document.getElementById('q').value.toLowerCase();
 document.querySelectorAll('.card').forEach(c=>{c.style.display=(on.has(c.dataset.cat)&&(!q||c.dataset.s.includes(q)))?'':'none';});
 document.querySelectorAll('section').forEach(s=>{s.style.display=[...s.querySelectorAll('.card')].some(c=>c.style.display!=='none')?'':'none';});}
""")
parts.append("</script></body></html>")
open(os.path.join(ROOT,"hub-directory-report-2026-06-09.html"),"w").write("\n".join(parts))

# ---- console summary -----------------------------------------------------
from collections import Counter
print("TOTAL entries:", len(final))
print("by category:", dict(Counter(e["category"] for e in final)))
print("with summary:", sum(1 for e in final if e.get("summary")))
print("with ≥1 reference link:", sum(1 for e in final if any(u for _,u in e["references"])))
print("avg refs/entry:", round(sum(len(e["references"]) for e in final)/len(final),2))
print("covers: %d SVG (all) + %d live-screenshot overlays" % (
    len(final), sum(1 for e in final if e['photo'])))
