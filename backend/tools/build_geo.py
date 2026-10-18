#!/usr/bin/env python3
"""Türkiye ilçe verisini üretir: backend/src/main/resources/geo/districts.txt

Kaynaklar (ayrıntı: backend/src/main/resources/geo/README.md):
  - geoBoundaries gbOpen TUR ADM2 (ilçe sınırları) ve ADM1 (il sınırları, yalnızca ilçe->il eşlemesi için)
  - Wikidata SPARQL (ilçe merkez koordinatı, CC0)

Kullanım (yalnızca Python 3 standart kütüphanesi):
  python3 backend/tools/build_geo.py [--work DIR] [--tolerance 0.0015] [--out YOL]

Ham indirmeler --work dizininde önbelleğe alınır (varsayılan: sistem geçici dizini/time-portal-geo);
yeniden çalıştırmada tekrar indirilmez. Aynı girdiyle çıktı bire bir aynıdır.
"""
import argparse
import json
import math
import os
import re
import sys
import tempfile
import urllib.parse
import urllib.request

# Sürüme sabitlenmiş indirme (geoBoundaries gbOpen, commit 9469f09; API'nin "current" kaydıyla aynı)
GB_COMMIT = "9469f09"
GB_URL = ("https://github.com/wmgeolab/geoBoundaries/raw/" + GB_COMMIT +
          "/releaseData/gbOpen/TUR/{level}/geoBoundaries-TUR-{level}.geojson")
GB_LICENSE = "Open Data Commons Open Database License 1.0"
SPARQL_URL = "https://query.wikidata.org/sparql"
# Q1147395 = "district of Turkey"
SPARQL = """SELECT ?d ?dLabel ?coord ?pLabel WHERE {
  ?d wdt:P31 wd:Q1147395 ; wdt:P625 ?coord .
  OPTIONAL { ?d wdt:P131 ?p . }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "tr,en". }
}"""
UA = "time-portal-geo-tool/1.0 (https://github.com/batuhanakdeniz/time-portal)"

TR_MAP = str.maketrans({"İ": "i", "I": "i", "ı": "i", "ç": "c", "Ç": "c", "ğ": "g", "Ğ": "g",
                        "ö": "o", "Ö": "o", "ş": "s", "Ş": "s", "ü": "u", "Ü": "u",
                        "â": "a", "Â": "a", "î": "i", "Î": "i", "û": "u", "Û": "u"})
DISPLAY_MAP = str.maketrans({"â": "a", "Â": "A", "î": "i", "Î": "İ", "û": "u", "Û": "U"})


def norm(s):
    s = s.translate(TR_MAP).lower()
    return re.sub(r"[^a-z0-9]", "", s)


# ---------------------------------------------------------------- indirme
def fetch(url, dest, headers=None):
    if os.path.exists(dest) and os.path.getsize(dest) > 0:
        return
    req = urllib.request.Request(url, headers={"User-Agent": UA, **(headers or {})})
    with urllib.request.urlopen(req, timeout=300) as r, open(dest, "wb") as f:
        f.write(r.read())


def load_adm(work, level):
    path = os.path.join(work, f"{GB_COMMIT}-{level}.geojson")
    fetch(GB_URL.format(level=level), path)
    return json.load(open(path, encoding="utf-8"))


def load_wikidata(work):
    path = os.path.join(work, "wikidata-districts.json")
    if not (os.path.exists(path) and os.path.getsize(path) > 0):
        url = SPARQL_URL + "?" + urllib.parse.urlencode({"query": SPARQL})
        fetch(url, path, {"Accept": "application/sparql-results+json"})
    rows = []
    bindings = json.load(open(path, encoding="utf-8"))["results"]["bindings"]
    # P131 birden çok olabilir; girdi sırası ne olursa olsun çıktı aynı kalsın diye sırala
    bindings.sort(key=lambda b: (b["d"]["value"], b.get("pLabel", {}).get("value", "")))
    for b in bindings:
        m = re.match(r"Point\(([-\d.eE]+) ([-\d.eE]+)\)", b["coord"]["value"])
        if not m or "dLabel" not in b or "pLabel" not in b:
            continue
        rows.append((b["dLabel"]["value"], b["pLabel"]["value"], float(m.group(2)), float(m.group(1))))
    return rows


# ---------------------------------------------------------------- geometri
def polygons_of(geom):
    """GeoJSON geometrisini [[dış_halka, delik...], ...] listesine çevirir."""
    if geom["type"] == "Polygon":
        return [geom["coordinates"]]
    return geom["coordinates"]


def ring_area(ring):
    a = 0.0
    for i in range(len(ring) - 1):
        a += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1]
    return a / 2


def seg_dist2(p, a, b):
    ax, ay = a
    bx, by = b
    dx, dy = bx - ax, by - ay
    l2 = dx * dx + dy * dy
    if l2 == 0:
        return (p[0] - ax) ** 2 + (p[1] - ay) ** 2
    t = max(0.0, min(1.0, ((p[0] - ax) * dx + (p[1] - ay) * dy) / l2))
    return (p[0] - ax - t * dx) ** 2 + (p[1] - ay - t * dy) ** 2


def dp(pts, tol):
    """Douglas-Peucker (yinelemesiz); ilk ve son nokta korunur."""
    n = len(pts)
    keep = [False] * n
    keep[0] = keep[-1] = True
    tol2 = tol * tol
    stack = [(0, n - 1)]
    while stack:
        lo, hi = stack.pop()
        best, idx = -1.0, -1
        for i in range(lo + 1, hi):
            d = seg_dist2(pts[i], pts[lo], pts[hi])
            if d > best:
                best, idx = d, i
        if idx != -1 and best > tol2:
            keep[idx] = True
            stack.append((lo, idx))
            stack.append((idx, hi))
    return [p for p, k in zip(pts, keep) if k]


def simplify_ring(ring, tol):
    """Kapalı halkayı (ilk=son) sadeleştirir; 4'ten az nokta kalırsa None."""
    pts = [tuple(p[:2]) for p in ring[:-1]] if ring[0] == ring[-1] else [tuple(p[:2]) for p in ring]
    if len(pts) < 3:
        return None
    far = max(range(len(pts)), key=lambda i: (pts[i][0] - pts[0][0]) ** 2 + (pts[i][1] - pts[0][1]) ** 2)
    if far == 0:
        return None
    a = dp(pts[:far + 1], tol)
    b = dp(pts[far:] + [pts[0]], tol)
    out = a[:-1] + b[:-1]
    # 4 ondalığa yuvarla (~11 m), ardışık kopyaları at
    q = []
    for x, y in out:
        p = (round(x, 4), round(y, 4))
        if not q or q[-1] != p:
            q.append(p)
    if len(q) > 1 and q[0] == q[-1]:
        q.pop()
    if len(q) < 3 or abs(ring_area(q + [q[0]])) < 1e-9:
        return None
    return q


def in_ring(x, y, ring):
    inside = False
    n = len(ring)
    j = n - 1
    for i in range(n):
        xi, yi = ring[i][0], ring[i][1]
        xj, yj = ring[j][0], ring[j][1]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
            inside = not inside
        j = i
    return inside


def in_polygons(x, y, polys):
    for rings in polys:
        if in_ring(x, y, rings[0]) and not any(in_ring(x, y, h) for h in rings[1:]):
            return True
    return False


def ring_dist2(x, y, ring):
    best = float("inf")
    for i in range(len(ring)):
        best = min(best, seg_dist2((x, y), ring[i], ring[i - 1]))
    return best


def interior_point(polys):
    """Poligon İÇİNDE kalan, sınırdan en uzak (yaklaşık) nokta: (lat, lon)."""
    rings = max(polys, key=lambda r: abs(ring_area(r[0] + [r[0][0]])))
    outer = rings[0]
    xs = [p[0] for p in outer]
    ys = [p[1] for p in outer]
    x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
    best, bx, by = -1.0, None, None
    n = 12
    for _ in range(3):
        cand = [(x0 + (x1 - x0) * (i + .5) / n, y0 + (y1 - y0) * (j + .5) / n)
                for i in range(n) for j in range(n)]
        for x, y in cand:
            if not in_polygons(x, y, [rings]):
                continue
            d = min(ring_dist2(x, y, r) for r in rings)
            if d > best:
                best, bx, by = d, x, y
        if bx is None:
            break
        w, h = (x1 - x0) / n, (y1 - y0) / n
        x0, x1, y0, y1 = bx - w, bx + w, by - h, by + h
    if bx is None:  # çok ince şekil: ilk köşeyi hafifçe içeri al
        bx, by = outer[0]
    return by, bx


# ---------------------------------------------------------------- ad temizleme
MERKEZ_RE = re.compile(r"^(?:(?P<base>.*?)\s*[\(\s]\s*)?merkez(?:i)?(?:\s+ilçe)?\)?$", re.IGNORECASE)


# geoBoundaries'te İngilizce/eski yazılmış birkaç ad (resmî Türkçe karşılığı)
RENAMES = {"Imbros": "Gökçeada", "Prince Islands": "Adalar"}


def clean_name(raw, province):
    """'Hakkari merkez', 'Osmaniye (merkez)' -> 'Merkez'. 'Merkezefendi' gibi gerçek adlara dokunmaz."""
    name = RENAMES.get(raw.strip(), raw.strip()).translate(DISPLAY_MAP)
    name = re.sub(r"\s+District$", "", name)
    if norm(name) == norm(province):
        return "Merkez"
    m = MERKEZ_RE.match(name)
    if m:
        base = (m.group("base") or "").strip()
        # taban il adıysa 'Merkez'; değilse ilçe adıdır ('Gediz Merkez' -> 'Gediz')
        if not base or norm(base) == norm(province):
            return "Merkez"
        return base
    return name


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--work", default=os.path.join(tempfile.gettempdir(), "time-portal-geo"))
    ap.add_argument("--tolerance", type=float, default=0.0015, help="Douglas-Peucker toleransı, derece")
    here = os.path.dirname(os.path.abspath(__file__))
    ap.add_argument("--out", default=os.path.join(here, "..", "src", "main", "resources", "geo", "districts.txt"))
    args = ap.parse_args()
    os.makedirs(args.work, exist_ok=True)

    adm2 = load_adm(args.work, "ADM2")
    adm1 = load_adm(args.work, "ADM1")
    wd = load_wikidata(args.work)

    # 1) il poligonları (yalnızca ilçe->il eşlemesi)
    provinces = []
    for f in adm1["features"]:
        polys = polygons_of(f["geometry"])
        xs = [p[0] for r in polys for p in r[0]]
        ys = [p[1] for r in polys for p in r[0]]
        provinces.append((f["properties"]["shapeName"].translate(DISPLAY_MAP), polys,
                          (min(xs), min(ys), max(xs), max(ys))))

    def province_at(lat, lon):
        for name, polys, (a, b, c, d) in provinces:
            if a <= lon <= c and b <= lat <= d and in_polygons(lon, lat, polys):
                return name
        return None

    # 2) ilçeler: sadeleştir, iç nokta, il
    districts = []
    for f in adm2["features"]:
        polys = []
        for rings in polygons_of(f["geometry"]):
            outer = simplify_ring(rings[0], args.tolerance)
            if outer is None:
                continue
            holes = [h for h in (simplify_ring(r, args.tolerance) for r in rings[1:]) if h]
            polys.append([outer] + holes)
        if not polys:
            print("UYARI: sadeleştirmede boşalan ilçe:", f["properties"]["shapeName"], file=sys.stderr)
            continue
        lat, lon = interior_point(polys)
        prov = province_at(lat, lon)
        if prov is None:
            votes = {}
            for p in polys[0][0][::max(1, len(polys[0][0]) // 20)]:
                v = province_at(p[1], p[0])
                if v:
                    votes[v] = votes.get(v, 0) + 1
            prov = max(votes, key=votes.get) if votes else "?"
        districts.append({"raw": f["properties"]["shapeName"], "province": prov, "polys": polys,
                          "ilat": lat, "ilon": lon})
    for d in districts:
        d["name"] = clean_name(d["raw"], d["province"])

    # 3) Wikidata merkezleri: etiket temizlenir, ada göre indekslenir; aday yalnızca koordinatı
    #    ilçe poligonunun İÇİNDE kalıyorsa kabul edilir (mekânsal doğrulama).
    def wd_clean(label, plabel):
        label = re.sub(r"\([^)]*\)", " ", label)
        label = re.sub(r"\bilçesi\b", " ", label, flags=re.IGNORECASE)
        label = re.sub(r"\b(district|central)\b", " ", label, flags=re.IGNORECASE)
        k = norm(label)
        pn = norm(plabel)
        if k.endswith(pn) and len(k) > len(pn):  # 'Kale Tunceli' -> 'kale'
            k = k[:-len(pn)]
        return k

    index = {}
    for label, plabel, lat, lon in wd:
        index.setdefault(wd_clean(label, plabel), []).append((lat, lon))

    def wd_candidates(d):
        pn = norm(d["province"])
        keys = [norm(d["name"]), norm(d["raw"])]
        if d["name"] == "Merkez":
            keys += [pn, pn + "merkez", "merkez"]
        out = []
        for k in keys:
            out += index.get(k, [])
        return out

    matched = unmatched = outside = 0
    unmatched_names = []
    for d in districts:
        cands = sorted(c for c in wd_candidates(d) if in_polygons(c[1], c[0], d["polys"]))
        if cands:
            d["lat"], d["lon"] = cands[0]
            d["src"] = "W"
            matched += 1
        else:
            if wd_candidates(d):
                outside += 1
            d["lat"], d["lon"] = d["ilat"], d["ilon"]
            d["src"] = "I"
            unmatched += 1
            unmatched_names.append(f'{d["province"]}/{d["name"]}')

    districts.sort(key=lambda d: (norm(d["province"]), norm(d["name"]), d["raw"]))

    # 4) yaz
    os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
    with open(args.out, "w", encoding="utf-8", newline="\n") as f:
        f.write(f"# ODbL 1.0 - (c) OpenStreetMap contributors, geoBoundaries gbOpen TUR ADM2 {GB_COMMIT}; "
                "merkezler Wikidata CC0. build_geo.py ile üretildi; biçim: geo/README.md\n")
        for d in districts:
            f.write(f'D\t{d["name"]}\t{d["province"]}\t{d["lat"]:.5f}\t{d["lon"]:.5f}\t{d["src"]}\n')
            for rings in d["polys"]:
                f.write("P\n")
                for i, r in enumerate(rings):
                    flat = " ".join(f"{x:g} {y:g}" for x, y in r)
                    f.write(("O " if i == 0 else "H ") + flat + "\n")

    size = os.path.getsize(args.out)
    print(f"kaynak: geoBoundaries gbOpen TUR ADM2 {GB_COMMIT} ({GB_LICENSE}), {len(adm2['features'])} ilçe")
    print(f"yazılan ilçe: {len(districts)}; dosya: {size/1e6:.2f} MB; tolerans: {args.tolerance}")
    print(f"Wikidata merkezi eşleşen: {matched}; eşleşmeyen (iç nokta): {unmatched} "
          f"(adı eşleşip poligon dışında kalan: {outside})")
    for n in unmatched_names:
        print("  eşleşmedi:", n)


if __name__ == "__main__":
    main()
