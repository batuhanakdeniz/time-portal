"""Pilot (#67) ortak tanımları: yerler, kovalar, dizinler, lisans kayıtları.

Ağırlıklar ve çıktılar depo dışındadır:
  CACHE_DIR  = ~/.cache/time-portal/pilot   (model, karo, python önbelleği)
  OUTPUT_DIR = ~/time-portal-pilot          (arazi ve sahne çıktıları)
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

CACHE_DIR = Path(os.environ.get("TP_PILOT_CACHE", Path.home() / ".cache" / "time-portal" / "pilot"))
OUTPUT_DIR = Path(os.environ.get("TP_PILOT_OUT", Path.home() / "time-portal-pilot"))
MODELS_DIR = CACHE_DIR / "models"
TILE_CACHE = CACHE_DIR / "terrain-tiles"

# Projenin panorama sözleşmesi (backend/.../depth): 2048x1024 ERP JPEG + aynı boyutta gri PNG, açık = yakın.
ERP_WIDTH = 2048
ERP_HEIGHT = 1024


@dataclass(frozen=True)
class Place:
    id: str
    name: str
    province: str
    lat: float
    lon: float
    source: str  # koordinat kaynağı
    region: str  # tarifte kullanılan nötr bölge ipucu (İngilizce, model için)


# Koordinatlar backend/src/main/resources/geo/districts.txt (ilçe merkezi, Wikidata CC0) ve
# province-centers.tsv'den (il merkezi) alındı. "Merkez" isteyen yerlerde il merkezi kullanıldı.
PLACES: list[Place] = [
    Place("istanbul-beyoglu", "Beyoğlu", "İstanbul", 41.03194, 28.97611, "districts.txt: Beyoğlu",
          "on the hills above the Golden Horn and the Bosphorus strait, northwestern Anatolia / Thrace"),
    Place("bursa-merkez", "Bursa merkez", "Bursa", 40.19133, 29.08054, "province-centers.tsv: Bursa",
          "at the northern foot of Mount Uludağ (Mysian Olympus) above a fertile plain, Marmara region"),
    Place("konya-cumra", "Çumra", "Konya", 37.58167, 32.77972, "districts.txt: Çumra",
          "on the flat Konya plain of the central Anatolian plateau, near the Çarşamba river"),
    Place("sanliurfa-merkez", "Şanlıurfa merkez", "Şanlıurfa", 37.15833, 38.79167, "province-centers.tsv: Şanlıurfa",
          "on the edge of the limestone hills and the Harran plain, upper Mesopotamia"),
    Place("trabzon-merkez", "Trabzon merkez", "Trabzon", 41.00500, 39.72250, "province-centers.tsv: Trabzon",
          "on the open Black Sea coast with a straight sea horizon, steep green Pontic mountains rising behind"),
]
PLACE_BY_ID = {p.id: p for p in PLACES}


@dataclass(frozen=True)
class Bucket:
    id: str
    name_tr: str
    year_from: int
    year_to: int
    confidence: str  # docs/FAZ3.md §2


# docs/FAZ3.md §2'deki 15 kovadan pilotta kullanılan 4'ü (kimlikler değişmez).
BUCKETS: list[Bucket] = [
    Bucket("neolitik", "Neolitik–Kalkolitik", -10000, -3000, "kurgu"),
    Bucket("roma", "Roma", -30, 395, "yorum"),
    Bucket("osmanli-gec", "Osmanlı geç", 1700, 1923, "yorum"),
    Bucket("erken-cumhuriyet", "Erken Cumhuriyet", 1923, 1960, "yorum"),
]
BUCKET_BY_ID = {b.id: b for b in BUCKETS}

# Lisanslar Hugging Face API'sinden (cardData.license) 25.10.2026'da okundu; sha = o anki commit.
MODEL_LICENSES = {
    "flux2-klein-base-4b": {
        "repo": "black-forest-labs/FLUX.2-klein-base-4B",
        "license": "apache-2.0",
        "sha": "a3b4f4849157f664bdbc776fd7453c2783562f4d",
    },
    "flux2-klein-4b": {
        "repo": "black-forest-labs/FLUX.2-klein-4B",
        "license": "apache-2.0",
        "sha": "e7b7dc27f91deacad38e78976d1f2b499d76a294",
    },
    "erp-lora": {
        "repo": "nomadoor/flux-2-klein-4B-360-erp-outpaint-lora",
        "file": "flux-2-klein-4B-360-erp-outpaint-lora_V1.safetensors",
        "license": "apache-2.0",
        "sha": "124129f3ebce357c007ffca177d19567246f8bff",
    },
    "sdxl-360": {
        "repo": "ProGamerGov/sdxl-360-diffusion",
        "license": "belirsiz: HF cardData.license boş, depoda LICENSE yok; yalnızca CITATION.cff 'MIT' diyor",
        "sha": "35658524f37857b18c9f10529c68b0d5ba5c5202",
    },
    "sdxl-base": {
        "repo": "stabilityai/stable-diffusion-xl-base-1.0",
        "license": "openrail++",
        "sha": "462165984030d82259a11f4367a4eed129e94a7b",
    },
    "depth-anything-v2-small": {
        "repo": "onnx-community/depth-anything-v2-small",
        "license": "apache-2.0",
        "sha": "4472b7362082ad9968fee890ca0f1e5aca36b93d",
    },
}

TERRAIN_SOURCE = {
    "name": "AWS Terrain Tiles (Tilezen/Joerd), Terrarium PNG",
    "url": "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png",
    "license": "SRTM, GMTED, ETOPO1 vb. kamu malı; atıf: https://github.com/tilezen/joerd/blob/master/docs/attribution.md",
}


def place_dir(place_id: str) -> Path:
    return OUTPUT_DIR / place_id
