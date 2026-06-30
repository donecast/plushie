#!/usr/bin/env python3
"""Plush Crypt photo-watch — find newly-photographable store-only items.

Runs unauthenticated and read-only. Each run it:
  1. pulls the live Plushie Dreadfuls catalog (products.json),
  2. keeps RELEASED full-size plush (available / sold out / retired — skips
     coming-soon / FYC, which never have customer photos; minis are excluded
     for now — see the candidate filter in main()),
  3. asks the DB which products/variants ALREADY have a community cover, via the
     public covered_photo_targets() RPC (db/0070 — exposes only public handles +
     variant ids),
  4. for each still-uncovered target, checks Plushie Dreadfuls' Okendo customer
     reviews for photos (multi-variant products are split by the review's
     variantId, so each colour is handled on its own),
  5. builds a numbered contact-sheet montage per find, uploads it to litterbox
     (72h temp host), and writes /tmp/pw_finds.json.

The scheduled agent reads pw_finds.json, posts new finds to Slack #plush-vault,
and applies the human's pick (insert catalog_photos + catalog_variant_covers via
MCP). This script does NO writes and needs no secrets — handles/variant ids are
already public on the storefront.

Usage:  python3 scripts/plush_photo_watch.py
Output: /tmp/pw_finds.json  (+ /tmp/pw_montage_*.jpg, uploaded)
"""
import json, re, io, os, sys, urllib.request, urllib.error

SUPABASE_URL = "https://ixymtbrvtysikhuitfta.supabase.co"
ANON_KEY = "sb_publishable_QHMgOMOWHLTPhjW5S07Ryg_WqfaY0aR"
OKENDO_SUB = "6ac55ea6-967a-48aa-a7d9-0cd454ae4e18"
UA = {"User-Agent": "Mozilla/5.0", "Accept": "application/json"}

# ── tiny HTTP helpers ───────────────────────────────────────────────
def _get_json(url, headers=UA, timeout=40):
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.load(r)

def fetch_feed():
    prods = []
    for pg in range(1, 8):
        try:
            d = _get_json(f"https://plushiedreadfuls.com/products.json?limit=250&page={pg}")
        except Exception as e:
            print(f"feed page {pg} failed: {e}", file=sys.stderr); break
        ps = d.get("products", [])
        if not ps:
            break
        prods += ps
    return prods

def fetch_excluded():
    """Keys the watcher should NOT surface: already-covered handles + variant ids,
    plus anything on the skip list. One flat set (handles and variant ids never
    collide — slugs vs numeric ids)."""
    req = urllib.request.Request(
        f"{SUPABASE_URL}/rest/v1/rpc/photo_watch_excluded",
        data=b"{}",
        headers={"apikey": ANON_KEY, "Authorization": "Bearer " + ANON_KEY,
                 "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=40) as r:
        rows = json.load(r)
    return {str(x["key"]) for x in rows if x.get("key")}

def okendo_reviews(product_id):
    try:
        d = _get_json(f"https://api.okendo.io/v1/stores/{OKENDO_SUB}/products/shopify-{product_id}/reviews?limit=100")
    except Exception:
        return []
    return d.get("reviews", [])

# ── catalog classification (port of app-core catalogCategory) ───────
OTHER_TYPES = {'sticker','pin','lanyard','home decoration','mouse pad','notepad','ipad case','phone grip',
  'shopping bag','gym bag','ita bag','crossbody bag','leather wallet','shirts','shirts & tops','sweater',
  'hat','sleep mask','clothing','jewelry','jewelry sets','necklace','necklaces','earring','bracelet','coin',
  'makeup','game','skull','head tube','car accessory'}
NON_PLUSHIE_NAME = re.compile(r'\b(standee|acrylic|trading card|enamel)\b', re.I)
NON_PLUSHIE_TYPES = {'pen', 'gift card'}
PLUSH_CLOTHING_LINES = re.compile(r'plush outfit|dreadful disguises', re.I)
CLOTHING_RE = re.compile(r'\b(outfit|hoodie|sweater|sweatshirt|cardigan|jacket|coat|dress|gown|skirt|overalls|'
  r'romper|onesie|jumpsuit|jumper|pinafore|pajamas?|robe|vest|tunic|kimono|poncho|cape|capelet|cloak|costume|'
  r'wings|tutu|scarf|shawl|beanie|bonnet|mask)\b', re.I)
COLLECTIBLE_OPTION_NAMES = {'color', 'colour', 'type', 'edition', 'style', 'variant', 'character', 'design'}

def cat_override(it):
    n = it.get('name', '') or ''
    if re.search(r'\btooth scary\b', n, re.I): return 'plush'
    if str(it.get('id')) == '8991250350312': return 'mini'
    if str(it.get('id')) == '9031367786728': return 'plush'
    if re.search(r'\b(gas|plague)\s*-?\s*mask\b', n, re.I): return 'clothing'
    return None

def is_clothing(it):
    if cat_override(it) == 'clothing': return True
    n = (it.get('name', '') or '').lower(); t = (it.get('type', '') or '').lower()
    if PLUSH_CLOTHING_LINES.search(n): return True
    if t == 'accessory' and CLOTHING_RE.search(n): return True
    return False

def is_mini(it):
    ov = cat_override(it)
    if ov: return ov == 'mini'
    tags = [x.lower() for x in it.get('tags', [])]
    n = (it.get('name', '') or '').lower(); t = (it.get('type', '') or '').lower()
    if t == 'keychain' and ('plush' in tags or 'plushie' in tags or 'plush' in n): return True
    if 'mini' in tags and ('plush' in tags or 'plushie' in tags): return True
    if re.search(r'\bmini\b', n) and t in ('plush', 'toy', 'stuffed toy') and not is_clothing(it): return True
    return False

def category(it):
    ov = cat_override(it)
    if ov: return ov
    t = (it.get('type', '') or '').lower(); n = it.get('name', '') or ''
    if NON_PLUSHIE_NAME.search(n): return 'other'
    if t in OTHER_TYPES: return 'other'
    if it.get('isBundle'): return 'bundle'
    if is_clothing(it): return 'clothing'
    if is_mini(it): return 'mini'
    if t in ('plush', 'toy', 'stuffed toy'): return 'plush'
    if t in ('accessory', 'plush accessory', 'hair clip', 'keychain', 'patch', 'plush backpack', 'charms', 'grab bag'):
        return 'accessory'
    if re.search(r'\bplush\b|\bstuffed (animal|toy)\b', n, re.I): return 'plush'
    return 'other'

def status(p):
    tags = p.get('tags', []); lc = [t.lower() for t in tags]; name = p.get('title', '')
    variants = p.get('variants', [])
    available = any(v.get('available') for v in variants)
    coming = 'coming soon' in lc or 'tba' in lc
    retired = 'retired' in lc or (not available and not coming and 'last chance' in lc)
    n = name.lower()
    if retired: return 'retired'
    if coming or 'tba' in n or 'coming soon' in n or 'future design' in n: return 'coming_soon'
    if 'fyc' in lc: return 'fyc'
    if not available: return 'sold_out'
    return 'available'

def feed_item(p):
    tags = p.get('tags', [])
    return {'id': p.get('id'), 'name': p.get('title', ''), 'type': p.get('product_type', ''),
            'tags': tags, 'isBundle': any('bundle' in x.lower() for x in tags), 'handle': p.get('handle')}

def collectible_variants(p):
    """Variant ids+titles when this is a collectible multi-variant product, else []."""
    opts = [o for o in p.get('options', []) if isinstance(o.get('values'), list) and len(o['values']) > 1]
    if len(opts) != 1 or (opts[0].get('name', '').strip().lower() not in COLLECTIBLE_OPTION_NAMES):
        return []
    return [(str(v['id']), v.get('title')) for v in p.get('variants', []) if v.get('title') and v['title'] != 'Default Title']

# ── Okendo photo extraction ─────────────────────────────────────────
def normalize_url(u, size="1000x1000"):
    if not u: return u
    return re.sub(r'\?d=\d+x\d+', f'?d={size}', u) if '?d=' in u else (u + f'?d={size}')

def photos_by_variant(reviews):
    """{ variant_id_or_'' : [ {url, media_id} ] } from the review media."""
    out = {}
    for rev in reviews:
        vid = str(rev.get('variantId') or '')
        for m in (rev.get('media') or []):
            if m.get('type') == 'image':
                u = m.get('fullSizeUrl') or m.get('largeUrl')
                if not u: continue
                mid = (m.get('dynamicKey') or m.get('streamId') or u.split('/')[-1].split('.')[0])
                out.setdefault(vid, []).append({'url': normalize_url(u), 'media_id': mid})
    return out

# ── montage + upload ────────────────────────────────────────────────
def build_montage(label, options, out_path):
    from PIL import Image, ImageDraw, ImageFont
    cell, cols, pad, labelh = 420, 4, 10, 46
    def fetch(u):
        req = urllib.request.Request(u, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=60) as r:
            return Image.open(io.BytesIO(r.read())).convert("RGB")
    tiles = []
    for opt in options:
        try:
            tiles.append((opt['n'], fetch(opt['url'])))
        except Exception:
            continue
    if not tiles:
        return None
    rows = (len(tiles) + cols - 1) // cols
    W, H = cols * cell + (cols + 1) * pad, rows * cell + (rows + 1) * pad
    canvas = Image.new("RGB", (W, H), (28, 22, 38))
    try:
        font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 30)
    except Exception:
        font = ImageFont.load_default()
    for i, (n, im) in enumerate(tiles):
        im.thumbnail((cell - labelh, cell - labelh))
        rr, cc = i // cols, i % cols
        x, y = pad + cc * (cell + pad), pad + rr * (cell + pad)
        tile = Image.new("RGB", (cell, cell), (45, 38, 58))
        tile.paste(im, ((cell - im.width) // 2, labelh + (cell - labelh - im.height) // 2))
        td = ImageDraw.Draw(tile)
        td.rectangle([0, 0, cell, labelh], fill=(120, 60, 140))
        td.text((12, 6), f"#{n}", font=font, fill=(255, 255, 255))
        canvas.paste(tile, (x, y))
    canvas.save(out_path, quality=85)
    return out_path

def upload_litterbox(path):
    """POST to litterbox (72h). Returns URL or None. Uses a manual multipart body."""
    boundary = "----pwwatch7f3a2b"
    def part(name, value, filename=None, ctype=None):
        h = f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"'
        if filename: h += f'; filename="{filename}"'
        h += "\r\n"
        if ctype: h += f"Content-Type: {ctype}\r\n"
        return h.encode() + b"\r\n" + (value if isinstance(value, bytes) else value.encode()) + b"\r\n"
    with open(path, "rb") as f:
        filedata = f.read()
    body = (part("reqtype", "fileupload") + part("time", "72h")
            + part("fileToUpload", filedata, os.path.basename(path), "image/jpeg")
            + f"--{boundary}--\r\n".encode())
    req = urllib.request.Request("https://litterbox.catbox.moe/resources/internals/api.php",
        data=body, headers={"Content-Type": f"multipart/form-data; boundary={boundary}",
                            "User-Agent": "Mozilla/5.0"})
    try:
        with urllib.request.urlopen(req, timeout=90) as r:
            out = r.read().decode().strip()
        return out if out.startswith("http") else None
    except Exception as e:
        print(f"upload failed for {path}: {e}", file=sys.stderr)
        return None

# ── main ────────────────────────────────────────────────────────────
def main():
    excluded = fetch_excluded()
    prods = fetch_feed()
    by_handle = {p.get("handle"): p for p in prods}
    # Released FULL-SIZE PLUSH only (top priority tier). Minis are intentionally
    # excluded for now — flip this back to {'plush','mini'} to widen the net.
    candidates = []
    for p in prods:
        if (p.get("product_type", "") or "").lower() in NON_PLUSHIE_TYPES:
            continue
        cat = category(feed_item(p))
        if cat != "plush":
            continue
        if status(p) not in ("available", "sold_out", "retired"):
            continue
        candidates.append(p)

    finds = []
    checked = 0   # store-only targets we actually looked up on Okendo (the "needs pictures" set)
    for p in candidates:
        handle = p.get("handle")
        cvars = collectible_variants(p)
        if cvars:
            # Per-variant: only variants without their own cover, not skipped.
            need = [(vid, vtitle) for (vid, vtitle) in cvars if vid not in excluded]
            if not need:
                continue
            checked += 1
            reviews = okendo_reviews(p.get("id"))
            pv = photos_by_variant(reviews)
            for vid, vtitle in need:
                opts = pv.get(vid, [])
                if not opts:
                    continue
                finds.append({"kind": "variant", "name": p.get("title"), "handle": handle,
                              "variant_id": vid, "variant_name": vtitle,
                              "options": [{"n": i + 1, **o} for i, o in enumerate(opts)]})
        else:
            if handle in excluded:
                continue
            checked += 1
            reviews = okendo_reviews(p.get("id"))
            pv = photos_by_variant(reviews)
            opts = [o for lst in pv.values() for o in lst]   # single product: all photos
            if not opts:
                continue
            finds.append({"kind": "product", "name": p.get("title"), "handle": handle,
                          "variant_id": None, "variant_name": None,
                          "options": [{"n": i + 1, **o} for i, o in enumerate(opts)]})

    # Build + upload a montage per find.
    for i, f in enumerate(finds):
        label = f["name"] + (f" — {f['variant_name']}" if f["variant_name"] else "")
        path = f"/tmp/pw_montage_{i}_{(f['variant_id'] or f['handle'])[:24]}.jpg"
        if build_montage(label, f["options"], path):
            f["montage_url"] = upload_litterbox(path)
        else:
            f["montage_url"] = None

    json.dump(finds, open("/tmp/pw_finds.json", "w"), indent=2)
    # `checked` = the store-only full plushes still needing a picture (the small
    # set that matters). `candidates` is just the released-plush universe we
    # filtered from — not a per-item Okendo lookup.
    print(f"full plushes still needing a picture: {checked} (of {len(candidates)} released)  |  NEW photos found: {len(finds)}")
    for f in finds:
        label = f["name"] + (f" — {f['variant_name']}" if f["variant_name"] else "")
        print(f"  • {label}  ({len(f['options'])} photos)  {f.get('montage_url') or '[no montage]'}")
    return finds

if __name__ == "__main__":
    main()
