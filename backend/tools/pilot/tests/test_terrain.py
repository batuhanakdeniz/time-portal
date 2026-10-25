import math

import numpy as np
import pytest

import terrain


def flat(height=100.0):
    return lambda e, n: np.full(np.shape(e), height, dtype=np.float64)


def test_decode_terrarium_sea_level_and_offsets():
    rgb = np.array([[[128, 0, 0], [128, 1, 128], [127, 255, 0]]], dtype=np.uint8)
    assert terrain.decode_terrarium(rgb).tolist() == [[0.0, 1.5, -1.0]]


def test_erp_angles_center_column_is_north_and_rows_span_poles():
    az, el = terrain.erp_angles(8, 4)
    assert az[3] < 0 < az[4]  # orta sütun sınırı kuzey (0°)
    assert az[6] == pytest.approx(112.5)  # sağ yarı doğu
    assert el[0] == pytest.approx(67.5) and el[-1] == pytest.approx(-67.5)


def test_flat_ground_depth_matches_eye_height_geometry_and_upper_half_is_sky():
    w, h = 64, 32
    p = terrain.raytrace(flat(), w, h, radius_m=3000)
    _, el = terrain.erp_angles(w, h)
    assert np.all(p.mask[el > 0] == terrain.SKY)
    assert np.all(np.isinf(p.depth_m[el > 0]))
    for row in np.nonzero(el < -5)[0]:
        expected = terrain.EYE_HEIGHT / math.sin(math.radians(-el[row]))
        assert np.allclose(p.depth_m[row], expected, rtol=0.03)
    assert np.all(p.mask[el < -5] == terrain.LAND)


def test_wall_to_the_north_is_hit_at_its_distance_and_hidden_behind_it_is_sky():
    def wall(e, n):
        return np.where(n >= 1000.0, 200.0, 100.0)

    w, h = 72, 180  # satır başına 1°
    p = terrain.raytrace(wall, w, h, radius_m=3000)
    az, el = terrain.erp_angles(w, h)
    north_col = int(np.argmin(np.abs(az)))
    top = math.degrees(math.atan2(100 - terrain.EYE_HEIGHT, 1000))  # ~5,6°
    for row in np.nonzero((el > 0.5) & (el < top - 0.5))[0]:
        horiz = p.depth_m[row, north_col] * math.cos(math.radians(el[row]))
        assert horiz == pytest.approx(1000, rel=0.03)
    assert np.all(p.mask[el > top + 1, north_col] == terrain.SKY)
    south_col = int(np.argmin(np.abs(np.abs(az) - 180)))
    assert p.mask[np.argmin(np.abs(el - 2)), south_col] == terrain.SKY
    assert p.horizon_deg[north_col] == pytest.approx(top, abs=0.2)


def test_sea_is_flat_water_surface():
    def coast(e, n):
        return np.where(n > 50.0, -30.0, 5.0)  # kuzeyde deniz (batimetri negatif)

    w, h = 64, 64
    p = terrain.raytrace(coast, w, h, radius_m=3000)
    az, el = terrain.erp_angles(w, h)
    north_col = int(np.argmin(np.abs(az)))
    south_col = 0
    row = int(np.argmin(np.abs(el + 0.5)))  # ufkun biraz altı: uzak yüzey
    assert p.mask[row, north_col] == terrain.WATER
    assert p.mask[row, south_col] == terrain.LAND
    # su yüzeyi 0 m'de kabul edilir: göz 5 + 1,7 m
    assert p.eye_elev == pytest.approx(6.7)


def test_symmetric_mountain_gives_continuous_seam():
    def cone(e, n):
        r = np.hypot(e, n - 1500)
        return 100 + np.maximum(0, 300 - 0.4 * r)

    w, h = 128, 64
    p = terrain.raytrace(cone, w, h, radius_m=4000)
    import depthmath

    gray = depthmath.metric_depth_to_gray(p.depth_m)
    assert depthmath.seam_ratio(gray) <= depthmath.SEAM_LIMIT


def test_earth_curvature_hides_distant_low_ground():
    # 40 km'deki 10 m'lik tümsek, eğrilik düşümü (~107 m) yüzünden görünmez → o yön gökyüzü ufkun üstünde
    def bump(e, n):
        return np.where((n > 40000) & (n < 40200), 110.0, 100.0)

    p = terrain.raytrace(bump, 32, 64, radius_m=45000)
    az, _ = terrain.erp_angles(32, 64)
    north_col = int(np.argmin(np.abs(az)))
    assert p.horizon_deg[north_col] < 0


def test_heightfield_sampling_round_trips_through_mercator():
    grid = np.arange(16 * 16, dtype=np.float32).reshape(16, 16) * 0 + 42
    x, y = terrain.lonlat_to_px(29.0, 41.0, 11)
    hf = terrain.HeightField(grid, float(int(x) - 8), float(int(y) - 8), 11, 41.0, 29.0)
    assert hf.sample(np.zeros(1), np.zeros(1))[0] == pytest.approx(42)
    gx, gy = hf.global_px(np.array([0.0]), np.array([0.0]))
    assert gx[0] == pytest.approx(x) and gy[0] == pytest.approx(y)
