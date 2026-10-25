"""Pilot sonuçlarını toplar: meta.json'lardan markdown tablo, puan birleştirme ve temas sayfası.

Puanlar `docs/pilot/puanlar.tsv` dosyasından okunur (yer<TAB>kova<TAB>etiket<TAB>puan<TAB>gerekçe) ve ilgili
meta.json'a `quality_score` / `quality_note` olarak yazılır.

Kullanım:
  python summarize.py table <etiket>                  # markdown tablo (stdout)
  python summarize.py sheet <etiket> <çıktı.jpg> [genişlik]   # 5 satır × 4 sütun küçük resim
  python summarize.py thumb <sahne-dizini> <çıktı.jpg> [genişlik] [--rolled]   # tek sahne (+ dikiş ortada kopya)
"""

from __future__ import annotations

import csv
import json
import sys
from pathlib import Path

from PIL import Image

from pilot_common import BUCKETS, OUTPUT_DIR, PLACES

SCORES = Path(__file__).resolve().parents[3] / "docs" / "pilot" / "puanlar.tsv"


def load_scores() -> dict:
    out = {}
    if SCORES.exists():
        with SCORES.open() as f:
            for row in csv.reader(f, delimiter="\t"):
                if row and not row[0].startswith("#") and len(row) >= 5:
                    out[(row[0], row[1], row[2])] = (int(row[3]), row[4])
    return out


def metas(tag: str):
    scores = load_scores()
    for p in PLACES:
        for b in BUCKETS:
            path = OUTPUT_DIR / p.id / b.id / tag / "meta.json"
            if not path.exists():
                continue
            meta = json.loads(path.read_text())
            if (p.id, b.id, tag) in scores:
                meta["quality_score"], meta["quality_note"] = scores[(p.id, b.id, tag)]
                path.write_text(json.dumps(meta, ensure_ascii=False, indent=2))
            yield p, b, meta


def fmt(v, nd=2):
    return "—" if v is None else (f"{v:.{nd}f}".replace(".", ",") if isinstance(v, float) else str(v))


def table(tag: str) -> str:
    rows = ["| Yer | Kova | Etiket | Süre (s) | Dikiş oranı | Dikiş sırası | Kutup | Derinlik dikişi | Puan | Gerekçe |",
            "|---|---|---|---|---|---|---|---|---|---|"]
    for p, b, m in metas(tag):
        rows.append(f"| {p.name} | {b.name_tr} | {m.get('label')} | {fmt(m.get('seconds'), 0)} | "
                    f"{fmt(m.get('seam_ratio'))} | {fmt(m.get('seam_rank'))} | {fmt(m.get('pole_ratio'))} | "
                    f"{fmt(m.get('depth_seam_ratio'))} | "
                    f"{m.get('quality_score', '—')} | {m.get('quality_note', '')} |")
    return "\n".join(rows)


def rolled(im: Image.Image) -> Image.Image:
    w, h = im.size
    r = Image.new("RGB", (w, h))
    r.paste(im.crop((w // 2, 0, w, h)), (0, 0))
    r.paste(im.crop((0, 0, w // 2, h)), (w // 2, 0))
    return r


def sheet(tag: str, out: str, width: int = 384):
    h = width // 2
    canvas = Image.new("RGB", (width * len(BUCKETS), h * len(PLACES)), "white")
    for p, b, _ in metas(tag):
        im = Image.open(OUTPUT_DIR / p.id / b.id / tag / "pano.jpg").convert("RGB").resize((width, h), Image.LANCZOS)
        canvas.paste(im, ([x.id for x in BUCKETS].index(b.id) * width, [x.id for x in PLACES].index(p.id) * h))
    canvas.save(out, quality=78, optimize=True)


def thumb(scene: str, out: str, width: int = 1024, with_rolled: bool = False):
    im = Image.open(Path(scene) / "pano.jpg").convert("RGB").resize((width, width // 2), Image.LANCZOS)
    if with_rolled:
        c = Image.new("RGB", (width, width))
        c.paste(im, (0, 0))
        c.paste(rolled(im), (0, width // 2))
        im = c
    im.save(out, quality=80, optimize=True)


if __name__ == "__main__":
    cmd = sys.argv[1]
    if cmd == "table":
        print(table(sys.argv[2]))
    elif cmd == "sheet":
        sheet(sys.argv[2], sys.argv[3], int(sys.argv[4]) if len(sys.argv) > 4 else 384)
    elif cmd == "thumb":
        args = [a for a in sys.argv[2:] if a != "--rolled"]
        thumb(args[0], args[1], int(args[2]) if len(args) > 2 else 1024, "--rolled" in sys.argv)
