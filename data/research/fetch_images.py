#!/usr/bin/env python3
"""Download a small real image per directory entry (og:image -> favicon),
save resized to hub-images/<id>.jpg, and write images-map.json.
Re-runnable: skips entries already fetched. Network done server-side so the
HTML can load images from disk (no client network needed)."""
import json, os, re, ssl, io, urllib.request, urllib.parse
from concurrent.futures import ThreadPoolExecutor, as_completed
from PIL import Image

ROOT = os.path.dirname(os.path.abspath(__file__))
IMGDIR = os.path.join(ROOT, "hub-images"); os.makedirs(IMGDIR, exist_ok=True)
MAP = os.path.join(ROOT, "images-map.json")
ctx = ssl.create_default_context(); ctx.check_hostname=False; ctx.verify_mode=ssl.CERT_NONE
UA = ("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) "
      "Chrome/121.0 Safari/537.36")
HDRS = {"User-Agent":UA, "Accept":"text/html,image/avif,image/webp,*/*",
        "Accept-Language":"en-US,en;q=0.9"}

def fetch(url, binary=False, timeout=9, maxb=4_000_000):
    req = urllib.request.Request(url, headers=HDRS)
    with urllib.request.urlopen(req, timeout=timeout, context=ctx) as r:
        return r.read(maxb) if binary else r.read(120000).decode("utf-8","ignore")

OG = [re.compile(r'<meta[^>]+(?:property|name)=["\'](?:og:image(?::secure_url)?|twitter:image(?::src)?)["\'][^>]+content=["\']([^"\']+)', re.I),
      re.compile(r'<meta[^>]+content=["\']([^"\']+)["\'][^>]+(?:property|name)=["\'](?:og:image|twitter:image)', re.I),
      re.compile(r'<link[^>]+rel=["\']image_src["\'][^>]+href=["\']([^"\']+)', re.I)]

def og_image(page_url):
    html = fetch(page_url)
    for rx in OG:
        m = rx.search(html)
        if m:
            u = m.group(1).strip()
            if u.startswith("//"): u = "https:"+u
            elif u.startswith("/"):
                p = urllib.parse.urlparse(page_url); u = f"{p.scheme}://{p.netloc}"+u
            elif not u.startswith("http"):
                u = page_url.rstrip("/")+"/"+u
            return u
    return None

def save_resized(img_bytes, path, box=(420,280)):
    im = Image.open(io.BytesIO(img_bytes)).convert("RGB")
    im.thumbnail((box[0]*2, box[1]*2))
    # center-crop to box aspect
    tw, th = box; w, h = im.size
    scale = max(tw/w, th/h); nw, nh = int(w*scale), int(h*scale)
    im = im.resize((nw, nh)); l=(nw-tw)//2; t=(nh-th)//2
    im = im.crop((l, t, l+tw, t+th))
    im.save(path, "JPEG", quality=72, optimize=True)

def full(u):
    u=(u or "").strip()
    return "" if not u else (u if u.startswith("http") else "https://"+u)

def domain(u):
    try: return urllib.parse.urlparse(full(u)).netloc.replace("www.","")
    except Exception: return ""

def work(e):
    eid, web = e["id"], full(e.get("website"))
    out = os.path.join(IMGDIR, eid+".jpg")
    if os.path.exists(out) and os.path.getsize(out) > 700:
        return eid, "hub-images/"+eid+".jpg", "cached"
    if web and "facebook" not in web:
        # 1) try og:image (a real photo)
        try:
            iu = og_image(web)
            if iu:
                save_resized(fetch(iu, binary=True), out); return eid, "hub-images/"+eid+".jpg", "og"
        except Exception: pass
    # 2) favicon fallback (logo) — reliable service
    dom = domain(web) or domain(e.get("facebook"))
    if dom:
        try:
            b = fetch(f"https://www.google.com/s2/favicons?domain={dom}&sz=128", binary=True)
            if b and len(b) > 120:
                Image.open(io.BytesIO(b)).convert("RGB").save(out, "JPEG", quality=80)
                return eid, "hub-images/"+eid+".jpg", "favicon"
        except Exception: pass
    return eid, "", "none"

def main():
    data = json.load(open(os.path.join(ROOT,"directory-consolidated-2026-06-09.json")))
    imap = json.load(open(MAP)) if os.path.exists(MAP) else {}
    stats = {}
    with ThreadPoolExecutor(max_workers=14) as ex:
        futs = {ex.submit(work, e): e["id"] for e in data}
        for i,f in enumerate(as_completed(futs),1):
            eid, path, how = f.result()
            if path: imap[eid] = path
            stats[how] = stats.get(how,0)+1
            if i % 20 == 0: print(f"  …{i}/{len(data)}")
    json.dump(imap, open(MAP,"w"), indent=0)
    print("DONE. results:", stats, "| total mapped:", len(imap))

if __name__ == "__main__":
    main()
