"""Arazi panoraması (#67, rapor B §3.2 adım 1–2): yükseklik karoları → ışın izleme → ERP derinlik + maske.

Kaynak: AWS Terrain Tiles, Terrarium PNG (anahtarsız). yükseklik = R*256 + G + B/256 - 32768 (metre).
Kamera: yer seviyesi + 1,7 m. ERP: x → azimut, orta sütun = kuzey, sağa doğru saat yönü (doğu = 3W/4);
y → yükseklik açısı, üst satır +90°, alt satır −90°.

Işın izleme her azimut için yatay mesafe örneklerinde yükseklik açısını hesaplar (dünya eğriliği ve
standart kırılma ile); birikimli en büyük açı, satır açısını ilk aştığı yerde ışın araziye çarpar.
Hiç aşmazsa gökyüzüdür (ya da yarıçap dışındaki ufuk: yarıçap sınırı rapora yazılır).

Çıktılar (<OUTPUT_DIR>/<yer>/terrain/): depth_m.npy (float32, gökyüzü inf), depth.png (gri, açık = yakın),
mask.png (0 gökyüzü, 1 kara, 2 su), render.jpg (gölgeli önizleme / img2img başlangıç görüntüsü),
horizon.json (sütun başına ufuk açısı ve mesafesi), terrain.json (özet ve tarif ipuçları).

Kullanım: python terrain.py [yer-id ...] [--zoom 11] [--radius-km 45]
"""

from __future__ import annotations

import argparse
import io
import json
import math
import sys
import time
import urllib.request
from dataclasses import dataclass
from pathlib import Path

import numpy as np
from PIL import Image

import depthmath
from pilot_common import ERP_HEIGHT, ERP_WIDTH, PLACE_BY_ID, PLACES, TERRAIN_SOURCE, TILE_CACHE, place_dir

EARTH_RADIUS = 6_371_000.0
REFRACTION = 0.13  # standart atmosferik kırılma katsayısı
EYE_HEIGHT = 1.7
TILE = 256

SKY, LAND, WATER = 0, 1, 2


# ---------------------------------------------------------------- yükseklik alanı

@dataclass
class HeightField:
    """Yerel metrik koordinatta (doğu, kuzey; metre) örneklenebilen yükseklik alanı."""

    grid: np.ndarray  # [satır, sütun] metre
    origin_x: float  # grid[0,0]'ın küresel Web Mercator piksel x'i
    origin_y: float
    zoom: int
    lat0: float
    lon0: float

    def global_px(self, east: np.ndarray, north: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
        lat = self.lat0 + np.degrees(north / EARTH_RADIUS)
        lon = self.lon0 + np.degrees(east / (EARTH_RADIUS * math.cos(math.radians(self.lat0))))
        return lonlat_to_px(lon, lat, self.zoom)

    def sample(self, east: np.ndarray, north: np.ndarray) -> np.ndarray:
        gx, gy = self.global_px(east, north)
        return bilinear(self.grid, gx - self.origin_x, gy - self.origin_y)

    def meters_per_px(self) -> float:
        return 2 * math.pi * EARTH_RADIUS * math.cos(math.radians(self.lat0)) / (TILE * 2 ** self.zoom)


def lonlat_to_px(lon, lat, zoom: int):
    n = TILE * 2 ** zoom
    lat_r = np.radians(lat)
    x = (np.asarray(lon) + 180.0) / 360.0 * n
    y = (1.0 - np.log(np.tan(lat_r) + 1.0 / np.cos(lat_r)) / math.pi) / 2.0 * n
    return x, y


def bilinear(grid: np.ndarray, x: np.ndarray, y: np.ndarray) -> np.ndarray:
    """Piksel merkezi = tam sayı koordinat; kenarlar sıkıştırılır."""
    h, w = grid.shape
    x = np.clip(x - 0.5, 0, w - 1.000001)
    y = np.clip(y - 0.5, 0, h - 1.000001)
    x0 = np.floor(x).astype(np.int64)
    y0 = np.floor(y).astype(np.int64)
    fx = (x - x0).astype(np.float32)
    fy = (y - y0).astype(np.float32)
    x1 = np.minimum(x0 + 1, w - 1)
    y1 = np.minimum(y0 + 1, h - 1)
    top = grid[y0, x0] * (1 - fx) + grid[y0, x1] * fx
    bottom = grid[y1, x0] * (1 - fx) + grid[y1, x1] * fx
    return top * (1 - fy) + bottom * fy


def decode_terrarium(rgb: np.ndarray) -> np.ndarray:
    rgb = rgb.astype(np.float32)
    return rgb[..., 0] * 256.0 + rgb[..., 1] + rgb[..., 2] / 256.0 - 32768.0


def fetch_tile(z: int, x: int, y: int) -> np.ndarray:
    path = TILE_CACHE / str(z) / str(x) / f"{y}.png"
    if not path.exists():
        url = TERRAIN_SOURCE["url"].format(z=z, x=x, y=y)
        req = urllib.request.Request(url, headers={"User-Agent": "time-portal-pilot/1.0"})
        with urllib.request.urlopen(req, timeout=60) as r:
            data = r.read()
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp = path.with_suffix(".tmp")
        tmp.write_bytes(data)
        tmp.replace(path)
    with Image.open(path) as im:
        return decode_terrarium(np.asarray(im.convert("RGB")))


def load_heightfield(lat: float, lon: float, radius_m: float, zoom: int, fetch=fetch_tile) -> HeightField:
    cx, cy = lonlat_to_px(lon, lat, zoom)
    mpp = 2 * math.pi * EARTH_RADIUS * math.cos(math.radians(lat)) / (TILE * 2 ** zoom)
    r_px = radius_m / mpp + 2
    tx0, tx1 = int((cx - r_px) // TILE), int((cx + r_px) // TILE)
    ty0, ty1 = int((cy - r_px) // TILE), int((cy + r_px) // TILE)
    rows = []
    for ty in range(ty0, ty1 + 1):
        rows.append(np.concatenate([fetch(zoom, tx, ty) for tx in range(tx0, tx1 + 1)], axis=1))
    grid = np.concatenate(rows, axis=0).astype(np.float32)
    return HeightField(grid, tx0 * TILE, ty0 * TILE, zoom, lat, lon)


# ---------------------------------------------------------------- ışın izleme

def sample_distances(radius_m: float, near: float = 1.0, mid: float = 2000.0, far_step: float = 25.0) -> np.ndarray:
    """Yakında geometrik (1 m → 2 km), uzakta sabit adımlı yatay mesafeler."""
    a = np.geomspace(near, mid, 300, endpoint=False)
    b = np.arange(mid, radius_m + far_step, far_step)
    return np.concatenate([a, b]).astype(np.float64)


@dataclass
class TerrainPanorama:
    depth_m: np.ndarray  # [H, W] eğik (ışın boyu) mesafe, gökyüzü inf
    mask: np.ndarray  # [H, W] uint8: 0 gökyüzü, 1 kara, 2 su
    hit_elev: np.ndarray  # [H, W] çarpılan noktanın yüksekliği (gökyüzünde nan)
    shade: np.ndarray  # [H, W] 0..1 tepe gölgelemesi
    horizon_deg: np.ndarray  # [W] ufuk yükseklik açısı
    horizon_dist_m: np.ndarray  # [W] ufuk noktasının yatay mesafesi
    eye_elev: float


def erp_angles(width: int, height: int) -> tuple[np.ndarray, np.ndarray]:
    """Sütun azimutları (derece, kuzey = 0, saat yönü) ve satır yükseklik açıları (derece)."""
    az = (np.arange(width) + 0.5) / width * 360.0 - 180.0
    el = 90.0 - (np.arange(height) + 0.5) / height * 180.0
    return az, el


def raytrace(field_fn, width: int, height: int, radius_m: float, eye_height: float = EYE_HEIGHT,
             ground_elev: float | None = None, shade_fn=None, distances: np.ndarray | None = None) -> TerrainPanorama:
    """field_fn(east, north) → yükseklik (m), su için <= 0. Saf işlev: testlerde sentetik alanla çağrılır."""
    az_deg, el_deg = erp_angles(width, height)
    d = sample_distances(radius_m) if distances is None else distances
    az = np.radians(az_deg)
    east = np.sin(az)[:, None] * d[None, :]
    north = np.cos(az)[:, None] * d[None, :]
    raw = field_fn(east, north).astype(np.float64)  # [W, N]
    surface = np.maximum(raw, 0.0)  # deniz yüzeyi 0 m
    if ground_elev is None:
        ground_elev = float(max(field_fn(np.zeros(1), np.zeros(1))[0], 0.0))
    eye = ground_elev + eye_height
    drop = d ** 2 / (2 * EARTH_RADIUS) * (1 - REFRACTION)
    alpha = np.degrees(np.arctan2(surface - drop[None, :] - eye, d[None, :]))  # [W, N]
    cummax = np.maximum.accumulate(alpha, axis=1)

    shade_all = shade_fn(east, north) if shade_fn is not None else np.ones_like(raw)

    depth = np.full((height, width), np.inf, dtype=np.float32)
    mask = np.zeros((height, width), dtype=np.uint8)
    hit_elev = np.full((height, width), np.nan, dtype=np.float32)
    shade = np.zeros((height, width), dtype=np.float32)
    phi = el_deg
    cos_phi = np.cos(np.radians(phi))
    n = len(d)
    for col in range(width):
        cm = cummax[col]
        idx = np.searchsorted(cm, phi, side="left")  # ilk cm >= phi
        hit = idx < n
        # yatay mesafe: örnekler arasında açıya göre doğrusal ara değer
        horiz = np.empty(height)
        first = hit & (idx == 0)
        # ilk örnekten de dik bakılıyorsa: kameranın altındaki düz zemin
        horiz[first] = eye_height / np.tan(np.radians(-np.minimum(phi[first], -1e-3)))
        mid = hit & (idx > 0)
        i1 = idx[mid]
        i0 = i1 - 1
        a0 = cm[i0]
        a1 = alpha[col, i1]
        t = np.clip((phi[mid] - a0) / np.maximum(a1 - a0, 1e-9), 0, 1)
        horiz[mid] = d[i0] + t * (d[i1] - d[i0])
        rows = np.nonzero(hit)[0]
        depth[rows, col] = (horiz[rows] / np.maximum(cos_phi[rows], 1e-6)).astype(np.float32)
        si = np.minimum(idx[rows], n - 1)
        si[first[rows]] = 0
        hit_elev[rows, col] = raw[col, si]
        mask[rows, col] = np.where(raw[col, si] <= 0.5, WATER, LAND)
        shade[rows, col] = shade_all[col, si]
    horizon_idx = np.argmax(alpha, axis=1)
    horizon_deg = alpha[np.arange(width), horizon_idx]
    horizon_dist = d[horizon_idx]
    return TerrainPanorama(depth, mask, hit_elev, shade, horizon_deg, horizon_dist, eye)


def hillshade_fn(hf: HeightField, azimuth_deg: float = 315.0, altitude_deg: float = 45.0):
    """Yükseklik alanından tepe gölgelemesi örnekleyicisi (Lambert, kuzeybatıdan güneş)."""
    mpp = hf.meters_per_px()
    gy, gx = np.gradient(hf.grid, mpp)  # gy: güneye doğru (satır artar), gx: doğuya
    dzdx, dzdy = gx, -gy  # doğu, kuzey eğimi
    az = math.radians(azimuth_deg)
    alt = math.radians(altitude_deg)
    lx, ly, lz = math.sin(az) * math.cos(alt), math.cos(az) * math.cos(alt), math.sin(alt)
    norm = np.sqrt(dzdx ** 2 + dzdy ** 2 + 1)
    shade = np.clip((-dzdx * lx - dzdy * ly + lz) / norm, 0, 1).astype(np.float32)

    def fn(east, north):
        gx_, gy_ = hf.global_px(east, north)
        return bilinear(shade, gx_ - hf.origin_x, gy_ - hf.origin_y)

    return fn


# ---------------------------------------------------------------- görselleştirme ve tarif ipuçları

def render(p: TerrainPanorama) -> np.ndarray:
    """Gölgeli önizleme: gökyüzü degrade, kara yükseklik/eğim tonlu, su mavi, uzaklık pusu. img2img başlangıcı."""
    h, w = p.mask.shape
    _, el = erp_angles(w, h)
    t = np.clip(el / 90.0, 0, 1)[:, None, None]
    sky = (np.array([200, 218, 235]) * (1 - t) + np.array([90, 140, 205]) * t)
    img = np.broadcast_to(sky, (h, w, 3)).astype(np.float32).copy()
    land = p.mask == LAND
    water = p.mask == WATER
    elev = np.nan_to_num(p.hit_elev, nan=0.0)
    e = np.clip(elev / 2000.0, 0, 1)[..., None]
    land_col = np.array([118, 128, 78]) * (1 - e) + np.array([150, 135, 115]) * e
    s = (0.45 + 0.75 * p.shade)[..., None]
    img[land] = np.clip(land_col * s, 0, 255)[land]
    img[water] = np.array([52, 92, 120])
    haze_col = np.array([190, 205, 220])
    dist = np.where(np.isfinite(p.depth_m), p.depth_m, 0)
    haze = (1 - np.exp(-dist / 25000.0))[..., None] * 0.75
    ground = land | water
    img[ground] = (img * (1 - haze) + haze_col * haze)[ground]
    return np.clip(img, 0, 255).astype(np.uint8)


SECTORS = ["north", "northeast", "east", "southeast", "south", "southwest", "west", "northwest"]


def describe(p: TerrainPanorama, eye_elev: float) -> dict:
    """Yönlere göre ufuk özeti → tarif ipuçları (İngilizce, model için) ve sayısal özet."""
    h, w = p.mask.shape
    az, el = erp_angles(w, h)
    sectors = []
    phrases = []
    for i, name in enumerate(SECTORS):
        center = i * 45.0
        delta = (az - center + 180) % 360 - 180
        cols = np.abs(delta) <= 22.5
        hz = float(np.median(p.horizon_deg[cols]))
        hz_max = float(np.max(p.horizon_deg[cols]))
        dist = float(np.median(p.horizon_dist_m[cols]))
        band = (el < 0) & (el > -3)  # ufkun hemen altı: uzak yüzey
        sub = p.mask[band][:, cols]
        ground = np.isin(sub, (LAND, WATER))
        water_frac = float((sub == WATER).sum() / max(1, ground.sum()))
        sectors.append({"dir": name, "horizon_deg_median": round(hz, 2), "horizon_deg_max": round(hz_max, 2),
                        "horizon_dist_km": round(dist / 1000, 1), "water_fraction": round(water_frac, 2)})
        if water_frac > 0.3:
            phrases.append(f"open water to the {name}")
        elif hz_max > 8:
            phrases.append(f"steep mountains close by to the {name}")
        elif hz_max > 3:
            phrases.append(f"mountains on the {name} horizon")
        elif hz_max > 1.2:
            phrases.append(f"low hills to the {name}")
        elif hz_max < 0.6:
            phrases.append(f"flat open plain stretching to the {name}")
    return {"eye_elev_m": round(eye_elev, 1), "sectors": sectors, "phrases": phrases}


def run(place_id: str, zoom: int, radius_km: float, width: int = ERP_WIDTH, height: int = ERP_HEIGHT) -> dict:
    place = PLACE_BY_ID[place_id]
    out = place_dir(place_id) / "terrain"
    out.mkdir(parents=True, exist_ok=True)
    t0 = time.perf_counter()
    hf = load_heightfield(place.lat, place.lon, radius_km * 1000, zoom)
    t1 = time.perf_counter()
    pano = raytrace(hf.sample, width, height, radius_km * 1000, shade_fn=hillshade_fn(hf))
    t2 = time.perf_counter()
    np.save(out / "depth_m.npy", pano.depth_m)
    gray = depthmath.metric_depth_to_gray(pano.depth_m)
    Image.fromarray(gray, "L").save(out / "depth.png", optimize=True)
    Image.fromarray((pano.mask * 127).astype(np.uint8), "L").save(out / "mask.png", optimize=True)
    Image.fromarray(render(pano), "RGB").save(out / "render.jpg", quality=90)
    (out / "horizon.json").write_text(json.dumps({
        "azimuth_deg": [round(float(a), 3) for a in erp_angles(width, height)[0]],
        "horizon_deg": [round(float(v), 3) for v in pano.horizon_deg],
        "horizon_dist_m": [round(float(v), 1) for v in pano.horizon_dist_m],
    }))
    t3 = time.perf_counter()
    info = describe(pano, pano.eye_elev)
    summary = {
        "place": place_id, "lat": place.lat, "lon": place.lon, "zoom": zoom, "radius_km": radius_km,
        "meters_per_px": round(hf.meters_per_px(), 1), "grid_px": list(hf.grid.shape),
        "erp": [width, height], "orientation": "orta sütun = kuzey, sağa doğru saat yönü; üst satır +90°",
        "eye_height_m": EYE_HEIGHT, "sky_fraction": round(float((pano.mask == SKY).mean()), 3),
        "water_fraction": round(float((pano.mask == WATER).mean()), 3),
        "seam_ratio_depth": round(depthmath.seam_ratio(gray), 3),
        "seam_rank_depth": round(depthmath.seam_rank(gray), 3),
        "timing_s": {"tiles": round(t1 - t0, 2), "raytrace": round(t2 - t1, 2), "write": round(t3 - t2, 2),
                     "total": round(t3 - t0, 2)},
        "source": TERRAIN_SOURCE, **info,
    }
    (out / "terrain.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2))
    return summary


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("places", nargs="*", default=[p.id for p in PLACES])
    ap.add_argument("--zoom", type=int, default=11)
    ap.add_argument("--radius-km", type=float, default=45.0)
    args = ap.parse_args(argv)
    for pid in args.places:
        s = run(pid, args.zoom, args.radius_km)
        print(json.dumps({k: s[k] for k in ("place", "eye_elev_m", "sky_fraction", "water_fraction",
                                            "seam_ratio_depth", "seam_rank_depth", "timing_s", "phrases")}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
