"""Derinlik ve dikiş ölçütleri: backend `com.timeportal.depth.DepthMath` ile aynı mantık (numpy).

- seam_ratio: sol/sağ kenar sütun farkı ortalaması / iç komşu sütun farkı ortalaması (kabul <= SEAM_LIMIT).
- pole_ratio: kutup şeritlerindeki (üst/alt) yatay komşu farkı / tüm görüntüdeki yatay komşu farkı.
  ERP'de kutup satırı tek bir noktadır; değer küçükse kutup temiz (tek renge yakın), büyükse çizgili/bozuk.
- normalize_to_gray: sağlam ölçekli gri normalizasyon (#66): alt şerit hariç istatistik, yüzdelik kırpma,
  gamma; açık = yakın.
"""

from __future__ import annotations

import numpy as np

SEAM_LIMIT = 2.0


def _as_float(a: np.ndarray) -> np.ndarray:
    a = np.asarray(a, dtype=np.float64)
    if a.ndim == 3:  # RGB → parlaklık
        a = a[..., :3] @ np.array([0.299, 0.587, 0.114])
    if a.ndim != 2:
        raise ValueError("expected 2D map or HxWx3 image")
    return a


def seam_ratio(values: np.ndarray) -> float:
    """DepthMath.seamRatio: kenar farkı / iç komşu farkı. Düz haritada kenar da düzse 0, değilse sonsuz."""
    a = _as_float(values)
    if a.shape[1] < 3:
        raise ValueError("need at least 3 columns")
    edge = float(np.mean(np.abs(a[:, 0] - a[:, -1])))
    inner = float(np.mean(np.abs(np.diff(a, axis=1))))
    if inner == 0:
        return 0.0 if edge == 0 else float("inf")
    return edge / inner


def seam_rank(values: np.ndarray) -> float:
    """Dikişin iç komşu sütun çiftleri arasındaki yüzdelik sırası (0–1).

    seam_ratio tek bir ortalamaya bölündüğü için keskin ayrıntılı (ör. kıyı çizgisi) gerçek ve sürekli
    görüntülerde de 2'yi aşabilir: pilotta Beyoğlu arazi derinliğinde iç sütun çiftlerinin %1'i 10'un
    üzerinde. Sıra ölçütü dikişi kendi görüntüsünün dağılımıyla kıyaslar: sürekli dikişte tipik bir
    değer (~0,5), kopuk dikişte ~1.
    """
    a = _as_float(values)
    edge = float(np.mean(np.abs(a[:, 0] - a[:, -1])))
    pairs = np.mean(np.abs(np.diff(a, axis=1)), axis=0)
    return float(np.mean(pairs < edge))


def pole_ratio(values: np.ndarray, band: float = 0.03) -> float:
    """Kutup şeritlerinin (üst ve alt `band` oranı) yatay komşu farkı / tüm görüntününki."""
    a = _as_float(values)
    rows = max(1, int(round(a.shape[0] * band)))
    whole = float(np.mean(np.abs(np.diff(a, axis=1))))
    poles = np.concatenate([a[:rows], a[-rows:]], axis=0)
    pole = float(np.mean(np.abs(np.diff(poles, axis=1))))
    if whole == 0:
        return 0.0 if pole == 0 else float("inf")
    return pole / whole


def _percentile(sorted_vals: np.ndarray, p: float) -> float:
    pos = p / 100 * (len(sorted_vals) - 1)
    i = int(np.floor(pos))
    if i >= len(sorted_vals) - 1:
        return float(sorted_vals[-1])
    f = pos - i
    return float(sorted_vals[i] + (sorted_vals[i + 1] - sorted_vals[i]) * f)


def normalize_to_gray(values: np.ndarray, exclude_bottom: float = 0.15, low_pct: float = 1,
                      high_pct: float = 99, gamma: float = 0.7) -> np.ndarray:
    """DepthMath.normalizeToGray (büyük değer = yakın = 255). Sonlu olmayan değerler 0 olur."""
    v = np.asarray(values, dtype=np.float64)
    h = v.shape[0]
    stat_rows = h - int(round(h * exclude_bottom))
    if stat_rows < 1:
        stat_rows = h
    stats = v[:stat_rows].ravel()
    stats = np.sort(stats[np.isfinite(stats)])
    if stats.size == 0:
        stats = np.sort(v[np.isfinite(v)])
    out = np.zeros(v.shape, dtype=np.uint8)
    if stats.size == 0:
        return out
    lo, hi = _percentile(stats, low_pct), _percentile(stats, high_pct)
    if not hi > lo:
        allv = v[np.isfinite(v)]
        lo, hi = float(allv.min()), float(allv.max())
    finite = np.isfinite(v)
    if not hi > lo:
        out[finite] = 128
        return out
    t = np.clip((np.where(finite, v, lo) - lo) / (hi - lo), 0, 1)
    if gamma != 1:
        t = t ** gamma
    out = np.round(t * 255).astype(np.uint8)
    out[~finite] = 0
    return out


def metric_depth_to_gray(depth_m: np.ndarray, near_m: float = 1.0, far_m: float = 45_000.0) -> np.ndarray:
    """Metrik derinlik (m, gökyüzü = inf) → gri, logaritmik: near_m = 255 (açık, yakın), far_m = 1, gökyüzü 0.

    Ters derinlik (1/m) arazide işe yaramaz: 100 m'den uzak her şey siyaha yakın çıkar ve dağlar ile ova
    ayrışmaz. Log ölçek 1 m – 45 km aralığını eşit oranlı basamaklara böler; sözleşme (8-bit, açık = yakın)
    korunur. Görüntüleyici zaten kendi yüzdelik kırpmasını uygular.
    """
    d = np.asarray(depth_m, dtype=np.float64)
    finite = np.isfinite(d) & (d > 0)
    t = 1 - np.log(np.clip(np.where(finite, d, far_m), near_m, far_m) / near_m) / np.log(far_m / near_m)
    out = np.round(1 + t * 254).astype(np.uint8)
    out[~finite] = 0
    return out
