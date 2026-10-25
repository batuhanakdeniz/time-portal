import numpy as np
import pytest

import depthmath


def test_seam_ratio_matches_backend_definition():
    # DepthMath.seamRatio ile aynı örnek: kenar farkı 3, iç farklar 1 → 3
    a = np.array([[0, 1, 2, 3], [0, 1, 2, 3]], dtype=float)
    assert depthmath.seam_ratio(a) == pytest.approx(3.0)


def test_seam_ratio_periodic_image_is_within_limit_and_discontinuous_is_not():
    x = np.linspace(0, 2 * np.pi, 256, endpoint=False)
    periodic = np.tile(np.sin(x) * 100 + 128, (32, 1))
    assert depthmath.seam_ratio(periodic) <= depthmath.SEAM_LIMIT
    ramp = np.tile(np.linspace(0, 255, 256), (32, 1))
    assert depthmath.seam_ratio(ramp) > depthmath.SEAM_LIMIT


def test_seam_ratio_flat_map():
    assert depthmath.seam_ratio(np.zeros((4, 4))) == 0
    a = np.zeros((4, 4))
    a[:, 0] = 1
    a[:, 1:] = 0
    # iç fark sıfır değil (0→1 geçişi var) → sonlu
    assert np.isfinite(depthmath.seam_ratio(a))


def test_seam_ratio_rgb_uses_luminance_and_rejects_narrow():
    rgb = np.zeros((2, 4, 3))
    rgb[:, :, 0] = [[0, 1, 2, 3]] * 2
    assert depthmath.seam_ratio(rgb) == pytest.approx(3.0)
    with pytest.raises(ValueError):
        depthmath.seam_ratio(np.zeros((2, 2)))


def test_pole_ratio_clean_poles_low_streaky_poles_high():
    rng = np.random.default_rng(0)
    img = rng.uniform(0, 255, (100, 200))
    clean = img.copy()
    clean[:3] = 10
    clean[-3:] = 200
    assert depthmath.pole_ratio(clean) == pytest.approx(0.0)
    assert depthmath.pole_ratio(img) == pytest.approx(1.0, rel=0.1)


def test_normalize_to_gray_bright_is_near_and_non_finite_is_black():
    v = np.array([[0.0, 0.5, 1.0, np.inf]])
    g = depthmath.normalize_to_gray(v, exclude_bottom=0, low_pct=0, high_pct=100, gamma=1)
    assert g.tolist() == [[0, 128, 255, 0]]


def test_metric_depth_to_gray_sky_black_near_bright():
    d = np.array([[np.inf, 100.0], [10.0, 1.0]])
    g = depthmath.metric_depth_to_gray(d, near_m=1, far_m=10_000)
    assert g[0, 0] == 0
    assert g[1, 1] == 255
    assert g[1, 1] > g[1, 0] > g[0, 1] > 0
    # log ölçek: 1 → 10 → 100 m eşit basamaklar
    assert int(g[1, 1]) - int(g[1, 0]) == pytest.approx(int(g[1, 0]) - int(g[0, 1]), abs=1)


def test_seam_rank_continuous_is_typical_broken_is_extreme():
    rng = np.random.default_rng(1)
    x = np.linspace(0, 2 * np.pi, 512, endpoint=False)
    img = np.tile(np.sin(x) * 50 + 128, (64, 1)) + rng.normal(0, 2, (64, 512))
    assert depthmath.seam_rank(img) < 0.95
    broken = img.copy()
    broken[:, :256] += 40  # sol yarı kaydırılmış: kenarda ve ortada kopukluk
    assert depthmath.seam_rank(broken) >= 0.99
