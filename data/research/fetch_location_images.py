#!/usr/bin/env python3
"""For entries with no real photo (SVG cover) or only a Facebook/Instagram logo,
download a generic LOCATION photo from Wikipedia (by place name) and save to
hub-images/<id>.jpg. Updates images-map.json. Re-runnable."""
import json, os, re, ssl, io, urllib.request, urllib.parse
from concurrent.futures import ThreadPoolExecutor, as_completed
from PIL import Image

ROOT = os.path.dirname(os.path.abspath(__file__))
IMGDIR = os.path.join(ROOT, "hub-images"); os.makedirs(IMGDIR, exist_ok=True)
MAP = os.path.join(ROOT, "images-map.json")
ctx = ssl.create_default_context(); ctx.check_hostname=False; ctx.verify_mode=ssl.CERT_NONE
HDRS = {"User-Agent":"Mozilla/5.0 (X11; Linux) Chrome/121 Safari/537.36",
        "Api-User-Agent":"worldschool-directory/1.0 (research)"}
SKIP = {"multi","worldwide","online","n/a","n","na","various","tbd","","community",
        "travelling community","traveling community","global","worldwi","worldwide network"}

def fetch(url, binary=False, timeout=10, maxb=5_000_000):
    req = urllib.request.Request(url, headers=HDRS)
    with urllib.request.urlopen(req, timeout=timeout, context=ctx) as r:
        return r.read(maxb) if binary else r.read(200000).decode("utf-8","ignore")

def full(u):
    u=(u or "").strip(); return "" if not u else (u if u.startswith("http") else "https://"+u)
def domain(u):
    try: return urllib.parse.urlparse(full(u)).netloc.replace("www.","")
    except Exception: return ""

def save_cover(img_bytes, path, box=(420,280)):
    im = Image.open(io.BytesIO(img_bytes)).convert("RGB")
    tw,th = box; w,h = im.size
    s = max(tw/w, th/h); nw,nh = max(int(w*s),tw), max(int(h*s),th)
    im = im.resize((nw,nh)); l=(nw-tw)//2; t=(nh-th)//2
    im.crop((l,t,l+tw,t+th)).save(path, "JPEG", quality=74, optimize=True)

def place_queries(e):
    nm = re.split(r'[(/]', e["name"])[0].strip()
    region = re.split(r'[(/,]', e.get("region") or "")[0].strip()
    country = (e.get("country") or "").strip()
    cc = country if country.lower() not in SKIP else ""
    out, seen = [], set()
    for c in [nm, f"{nm}, {cc}" if cc else "", region, f"{region}, {cc}" if region and cc else "", cc]:
        c = c.strip().strip(",").strip()
        if len(c) >= 3 and c.lower() not in SKIP and c.lower() not in seen:
            seen.add(c.lower()); out.append(c)
    return out

import time
def wiki_image(q):
    url = "https://en.wikipedia.org/api/rest_v1/page/summary/" + urllib.parse.quote(q.replace(" ","_"), safe="")
    for attempt in range(2):
        try:
            j = json.loads(fetch(url)); break
        except Exception:
            time.sleep(0.8)
    else:
        return None
    if j.get("type") == "disambiguation": return None
    src = (j.get("originalimage") or {}).get("source") or (j.get("thumbnail") or {}).get("source")
    if src and src.lower().endswith(".svg"): return None
    return src

def needs_location_img(e, imap):
    wdom = domain(e.get("website"))
    if e["id"] in imap and "facebook" not in wdom and "instagram" not in wdom:
        return False                       # already has a real photo or brand logo
    return True                            # SVG-only, or only an FB/IG logo

def work(e):
    out = os.path.join(IMGDIR, e["id"]+".jpg")
    for q in place_queries(e):
        src = wiki_image(q)
        if not src: continue
        try:
            save_cover(fetch(src, binary=True), out); return e["id"], "hub-images/"+e["id"]+".jpg", q
        except Exception: continue
    return e["id"], "", ""

def main():
    data = json.load(open(os.path.join(ROOT,"directory-consolidated-2026-06-09.json")))
    imap = json.load(open(MAP)) if os.path.exists(MAP) else {}
    targets = [e for e in data if needs_location_img(e, imap)]
    print(f"location-photo targets: {len(targets)}")
    got = {}
    with ThreadPoolExecutor(max_workers=4) as ex:
        for f in as_completed({ex.submit(work, e): e["id"] for e in targets}):
            eid, path, q = f.result()
            if path: imap[eid] = path; got[eid] = q
    json.dump(imap, open(MAP,"w"), indent=0)
    print(f"got location photos for {len(got)} / {len(targets)}")
    for eid,q in list(got.items())[:12]: print("   •", eid, "←", q)

if __name__ == "__main__":
    main()
