"""Üretilmiş panoramaya model derinliği: backend DepthPipeline'ın Python eşi (Depth Anything V2 Small, ONNX).

Adımlar backend ile aynı: yatay sarmalı dolgu (%12,5) → model (kısa kenar ~518, 14'ün katı, uzun kenar ≤ 1568,
ImageNet normalizasyonu) → bilinear geri boyut → dolguyu kırp ve dikişi harmanla (backend'den farkı, bkz. wrap_blend) → kutup yumuşatma (%5) → sağlam gri normalizasyon
(alt %15 hariç, 1–99 yüzdelik, gamma 0,7). Çıktı: aynı boyutta gri PNG, açık = yakın.

Ağırlık backend'in önbelleğinden okunur (~/.cache/time-portal/models/depth-anything-v2-small-4472b73.onnx;
yoksa backend MODELS.md'deki adresten SHA-256 doğrulamalı indirilir).

Kullanım: python scene_depth.py <sahne-dizini> [...]  |  python scene_depth.py --tag <etiket>   (pano.jpg okur, depth.png yazar, meta.json'u günceller)
"""

from __future__ import annotations

import hashlib
import json
import sys
import time
import urllib.request
from pathlib import Path

import numpy as np
from PIL import Image

import depthmath

MODEL_URL = ("https://huggingface.co/onnx-community/depth-anything-v2-small/resolve/"
             "4472b7362082ad9968fee890ca0f1e5aca36b93d/onnx/model.onnx")
MODEL_SHA256 = "afb6a5c28f3b6bf1618c6e43f02073ef9dfdc70e937502d51603e57b0a1df10c"
MODEL_FILE = Path.home() / ".cache" / "time-portal" / "models" / "depth-anything-v2-small-4472b73.onnx"

WRAP_PAD_FRACTION = 0.125
POLE_FRACTION = 0.05
MEAN = np.array([0.485, 0.456, 0.406], dtype=np.float32)
STD = np.array([0.229, 0.224, 0.225], dtype=np.float32)

_session = None


def ensure_model() -> Path:
    if MODEL_FILE.exists():
        return MODEL_FILE
    MODEL_FILE.parent.mkdir(parents=True, exist_ok=True)
    tmp = MODEL_FILE.with_suffix(".tmp")
    with urllib.request.urlopen(MODEL_URL, timeout=300) as r:
        tmp.write_bytes(r.read())
    digest = hashlib.sha256(tmp.read_bytes()).hexdigest()
    if digest != MODEL_SHA256:
        tmp.unlink()
        raise RuntimeError("depth model checksum mismatch")
    tmp.replace(MODEL_FILE)
    return MODEL_FILE


def session():
    global _session
    if _session is None:
        import onnxruntime as ort

        _session = ort.InferenceSession(str(ensure_model()), providers=["CPUExecutionProvider"])
    return _session


def model_input_size(width: int, height: int, target_short=518, multiple=14, max_long=1568) -> tuple[int, int]:
    scale = target_short / min(width, height)
    if max(width, height) * scale > max_long:
        scale *= max_long / (max(width, height) * scale)

    def r(v):
        return max(multiple, int(round(v / multiple)) * multiple)

    return r(width * scale), r(height * scale)


def estimate(rgb: np.ndarray) -> np.ndarray:
    """RGB uint8 [H, W, 3] → göreli ters derinlik [H, W] (büyük = yakın)."""
    h, w = rgb.shape[:2]
    iw, ih = model_input_size(w, h)
    x = np.asarray(Image.fromarray(rgb).resize((iw, ih), Image.BILINEAR), dtype=np.float32) / 255.0
    x = ((x - MEAN) / STD).transpose(2, 0, 1)[None]
    out = session().run(None, {"pixel_values": x})[0][0]
    return np.asarray(Image.fromarray(out.astype(np.float32), mode="F").resize((w, h), Image.BILINEAR))


def smooth_poles(m: np.ndarray, fraction: float) -> np.ndarray:
    band = int(np.ceil(m.shape[0] * fraction))
    out = m.copy()
    for y in range(m.shape[0]):
        dist = min(y, m.shape[0] - 1 - y)
        if dist >= band:
            continue
        wgt = (band - dist) / band
        out[y] = m[y] * (1 - wgt) + m[y].mean() * wgt
    return out


def wrap_blend(padded: np.ndarray, pad: int) -> np.ndarray:
    """Sarmalı dolgulu tahmini kırpar ve dikişi kapatır.

    Göreli derinlik modeli aynı içeriğe bağlama göre farklı değer verir: kırpılmış haritanın 0. sütunu (sol
    bağlam) ile son sütunu (sağ bağlam) arasında pilotta 16 gri düzeyine varan sıçrama ölçüldü (backend'in
    yalnız kırpan yöntemi aynı sorunu taşır). Dolgu kopyaları dikişin iki yanındaki sütunların ikinci tahminidir:
    kenardan içeri doğru ağırlığı 0,5'ten 0'a inen doğrusal karışımla iki tahmin harmanlanır; böylece iki kenar
    aynı ortalamaya yakınsar.
    """
    w = padded.shape[1] - 2 * pad
    main = padded[:, pad:pad + w].astype(np.float64).copy()
    right_copy = padded[:, pad + w:]  # son sütunun sağ komşuları = 0..pad-1. sütunların ikinci tahmini
    left_copy = padded[:, :pad]  # w-pad..w-1. sütunların ikinci tahmini
    a = 0.5 * (1 - np.arange(pad) / pad)
    main[:, :pad] = (1 - a) * main[:, :pad] + a * right_copy
    main[:, w - pad:] = (1 - a[::-1]) * main[:, w - pad:] + a[::-1] * left_copy
    return main


def panorama_depth(rgb: np.ndarray) -> np.ndarray:
    w = rgb.shape[1]
    pad = max(1, int(round(w * WRAP_PAD_FRACTION)))
    padded = np.concatenate([rgb[:, -pad:], rgb, rgb[:, :pad]], axis=1)
    d = wrap_blend(estimate(padded), pad)
    d = smooth_poles(d, POLE_FRACTION)
    return depthmath.normalize_to_gray(d, exclude_bottom=0.15, low_pct=1, high_pct=99, gamma=0.7)


def process(scene_dir: Path) -> dict:
    t0 = time.perf_counter()
    rgb = np.asarray(Image.open(scene_dir / "pano.jpg").convert("RGB"))
    gray = panorama_depth(rgb)
    seconds = time.perf_counter() - t0
    # Sözleşme: 2048x1024. Daha küçük üretilen panorama burada büyütülmez; paketlemede büyütülür (rapora bakın).
    Image.fromarray(gray, "L").save(scene_dir / "depth.png", optimize=True)
    meta_path = scene_dir / "meta.json"
    meta = json.loads(meta_path.read_text()) if meta_path.exists() else {}
    meta.update(result)
    meta_path.write_text(json.dumps(meta, ensure_ascii=False, indent=2))
    return result


def main(argv):
    if argv and argv[0] == "--tag":
        from pilot_common import OUTPUT_DIR

        argv = sorted(str(p) for p in OUTPUT_DIR.glob(f"*/*/{argv[1]}") if (p / "pano.jpg").exists())
    for d in argv:
        print(d, json.dumps(process(Path(d))), flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
