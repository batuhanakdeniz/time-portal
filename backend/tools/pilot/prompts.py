"""Dönem tarifi (PromptComposer'ın pilot karşılığı): yer × kova × arazi ipucu.

Kurallar (rapor B §3.7): insan figürü yok (olumlu tarifte "no people" + negatif tarif); nötr, betimleyici dil;
dinî ve simgesel öğeler yalnızca belgeliyse (ör. Urfa kalesindeki iki sütun, Galata Kulesi); yer adı döneme
göre ve yansız ("Edessa (today Şanlıurfa)"). Tarifler İngilizce yazılır (model eğitim dili); Türkçe karşılığı
meta'ya girer.
"""

from __future__ import annotations

import json
from pathlib import Path

from pilot_common import BUCKET_BY_ID, PLACE_BY_ID, place_dir

ERP_TRIGGER = ("Fill the green spaces according to the image. Outpaint as a seamless 360 equirectangular "
               "panorama (2:1). Keep the horizon level. Match left and right edges.")

NEGATIVE = ("people, person, human figures, crowd, faces, soldiers, animals in foreground, text, letters, "
            "watermark, signature, modern buildings, cars, power lines, worst quality, blurry, ugly, distorted")

BUCKET_STYLE = {
    "neolitik": "around 7000 BCE, Neolithic period; no metal, no roads, no wheeled vehicles, no writing",
    "roma": "around 200 CE, Roman imperial period",
    "osmanli-gec": "around 1880, late Ottoman period",
    "erken-cumhuriyet": "around 1935, early Republic of Turkey",
}

# Yer × kova betimleri: belgelenmiş, genel yapı tipolojisi ve arazi örtüsü. Dramatik ya da "egzotik" sıfat yok.
SCENES: dict[tuple[str, str], str] = {
    ("istanbul-beyoglu", "neolitik"): "wooded hills above a narrow sea inlet, oak and pine forest, a few small "
        "wattle-and-daub huts with thatched roofs near the shore, small cleared garden plots",
    ("istanbul-beyoglu", "roma"): "hillside vineyards, gardens and a few small stone farmhouses with terracotta "
        "tile roofs on the hills of Sykai, looking across the Golden Horn inlet to the walled city of Byzantium "
        "with stone buildings and colonnades",
    ("istanbul-beyoglu", "osmanli-gec"): "the Pera district of Constantinople (today Istanbul): stone and brick "
        "apartment buildings with bay windows along a narrow cobbled street, the Galata Tower, a view over the "
        "Golden Horn to the historic peninsula skyline with domes and minarets",
    ("istanbul-beyoglu", "erken-cumhuriyet"): "Beyoğlu, Istanbul in the 1930s: a wide street of late 19th "
        "century stone apartment buildings, tram rails on cobblestones, shop awnings, the Galata Tower in the "
        "distance, a view of the Golden Horn",
    ("bursa-merkez", "neolitik"): "a small farming village of rectangular wattle-and-daub houses with flat "
        "roofs on a fertile plain, small wheat fields, oak woodland, a large forested mountain rising behind",
    ("bursa-merkez", "roma"): "the Roman town of Prusa ad Olympum (today Bursa): stone buildings with "
        "terracotta tile roofs, a bath house by the thermal springs, a paved road, olive and fruit orchards on "
        "the slopes of a large forested mountain",
    ("bursa-merkez", "osmanli-gec"): "Bursa in the 1880s: two-storey timber-framed houses with tiled roofs and "
        "projecting upper floors, domed mosques with minarets, a covered market, mulberry orchards and poplar "
        "trees, Mount Uludağ rising behind",
    ("bursa-merkez", "erken-cumhuriyet"): "Bursa in the 1930s: a town square with a few new stone government "
        "buildings, older tiled-roof houses, domed mosques, poplar trees, an unpaved road, Mount Uludağ behind",
    ("konya-cumra", "neolitik"): "a dense cluster of adjoining flat-roofed mud-brick houses without streets, "
        "entered through the roofs, like Çatalhöyük, on a flat marshy plain with a river, reeds, small fields "
        "of wheat and barley, distant low volcanic hills",
    ("konya-cumra", "roma"): "a rural farmstead on the flat Lycaonian plain near Iconium: low stone and "
        "mud-brick farm buildings with tile roofs, a dirt road, irrigated wheat fields, distant low mountains",
    ("konya-cumra", "osmanli-gec"): "a village on the Konya plain in the 1880s: flat-roofed mud-brick houses, "
        "a small mosque with a short minaret, a threshing floor, wide wheat fields, a dirt road",
    ("konya-cumra", "erken-cumhuriyet"): "a small town on the Konya plain in the 1930s: a modest stone railway "
        "station of the Baghdad railway, single-storey houses, a dirt road, wheat fields and poplar rows",
    ("sanliurfa-merkez", "neolitik"): "an early Neolithic settlement of round and rectangular stone-walled "
        "houses on a limestone hillside, steppe grassland with scattered pistachio and almond trees, a wide "
        "plain below",
    ("sanliurfa-merkez", "roma"): "the city of Edessa (today Şanlıurfa): limestone buildings with flat roofs, "
        "a citadel on a rocky hill with two tall columns, a spring-fed pool, a city wall, dry hills and fields",
    ("sanliurfa-merkez", "osmanli-gec"): "Urfa in the 1880s: cut limestone houses with inner courtyards and "
        "flat roofs, the spring-fed pools of Balıklıgöl with mosques and trees, the citadel hill with two "
        "columns, dry limestone hills",
    ("sanliurfa-merkez", "erken-cumhuriyet"): "Urfa in the 1930s: a stone-built town with flat roofs, narrow "
        "streets, the citadel hill with two columns, an unpaved road, dry fields of the Harran plain",
    ("trabzon-merkez", "neolitik"): "a densely forested coastline of the Black Sea, steep green hills, a few "
        "small timber huts in a clearing near a river mouth, pebble beach",
    ("trabzon-merkez", "roma"): "the Roman harbour town of Trapezus (today Trabzon): stone buildings with tile "
        "roofs on a plateau between two ravines, a city wall, a small harbour with wooden ships, green "
        "mountains rising behind",
    ("trabzon-merkez", "osmanli-gec"): "Trabzon in the 1880s: stone and timber houses with tiled roofs on the "
        "hillside, domed mosques, walled old town, a harbour with sailing ships on the Black Sea, steep green "
        "forested mountains behind",
    ("trabzon-merkez", "erken-cumhuriyet"): "Trabzon in the 1930s: a harbour with a steamship, stone "
        "warehouses and houses with tiled roofs along the coast road, hazelnut groves and steep green "
        "mountains behind",
}


def terrain_hint(place_id: str) -> str:
    """Arazi özetinden yönsüz ipucu (model pusulayı bilmez; düzen img2img başlangıcıyla verilir)."""
    path = place_dir(place_id) / "terrain" / "terrain.json"
    if not path.exists():
        return ""
    info = json.loads(path.read_text())
    phrases = info.get("phrases", [])
    kinds = []
    for key, text in (("open water", "open sea on part of the horizon"),
                      ("steep mountains", "steep mountains rising close by"),
                      ("mountains on", "mountains on the horizon"),
                      ("low hills", "low hills"),
                      ("flat open plain", "a wide flat plain")):
        if any(p.startswith(key) for p in phrases):
            kinds.append(text)
    return ", ".join(kinds)


def compose(place_id: str, bucket_id: str, erp_trigger: bool = True) -> dict:
    place = PLACE_BY_ID[place_id]
    bucket = BUCKET_BY_ID[bucket_id]
    scene = SCENES[(place_id, bucket_id)]
    hint = terrain_hint(place_id)
    body = (f"A realistic 360-degree eye-level panoramic photograph, {BUCKET_STYLE[bucket_id]}. "
            f"{scene[0].upper()}{scene[1:]}. Location: {place.region}. "
            + (f"Landscape: {hint}. " if hint else "")
            + "Completely deserted scene: no people, no human figures, no vehicles. Natural daylight, clear air, "
            "documentary style.")
    prompt = f"{ERP_TRIGGER} {body}" if erp_trigger else body
    return {"prompt": prompt, "body": body, "negative": NEGATIVE, "place": place_id, "bucket": bucket_id,
            "confidence": bucket.confidence}


if __name__ == "__main__":
    import sys

    print(json.dumps(compose(sys.argv[1], sys.argv[2]), ensure_ascii=False, indent=2))
