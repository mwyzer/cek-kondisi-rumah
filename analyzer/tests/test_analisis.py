"""Uji dengan gambar sintetis: dinding bertekstur + retak berliku / nat lurus / noda."""

import cv2
import numpy as np
import pytest
from fastapi.testclient import TestClient

from analisis import analisis_foto
from main import app

RNG = np.random.default_rng(7)


def dinding(w=1200, h=900, terang=200) -> np.ndarray:
    base = np.full((h, w), terang, np.float32)
    base += RNG.normal(0, 6, (h, w))  # tekstur plester
    base = cv2.GaussianBlur(base, (3, 3), 0)
    return cv2.cvtColor(np.clip(base, 0, 255).astype(np.uint8), cv2.COLOR_GRAY2BGR)


def jpeg(img: np.ndarray) -> bytes:
    return cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, 92])[1].tobytes()


def retak_berliku(img: np.ndarray) -> np.ndarray:
    x, y = 200.0, 150.0
    pts = []
    for _ in range(40):
        pts.append((int(x), int(y)))
        x += 14 + RNG.normal(0, 4)
        y += 11 + RNG.normal(0, 9)
    cv2.polylines(img, [np.array(pts, np.int32)], False, (70, 70, 70), 2, cv2.LINE_AA)
    return img


def test_dinding_polos_tanpa_temuan():
    r = analisis_foto(jpeg(dinding()), 1)
    assert r["retak"]["jumlah"] == 0
    assert r["noda"]["jumlah"] == 0
    assert r["kualitas"]["layak"]
    assert r["overlay"].startswith("data:image/jpeg;base64,")


def test_retak_berliku_terdeteksi():
    r = analisis_foto(jpeg(retak_berliku(dinding())), 1)
    assert r["retak"]["jumlah"] >= 1
    assert r["retak"]["panjang_relatif"] > 0.1


def test_nat_lurus_tidak_dihitung_retak():
    img = dinding()
    for x in range(150, 1200, 300):  # nat keramik vertikal
        cv2.line(img, (x, 0), (x, 899), (70, 70, 70), 2)
    for y in range(150, 900, 300):  # nat horizontal
        cv2.line(img, (0, y), (1199, y), (70, 70, 70), 2)
    r = analisis_foto(jpeg(img), 1)
    assert r["retak"]["jumlah"] == 0


def test_retak_di_antara_nat_tetap_terdeteksi():
    img = dinding()
    for x in range(150, 1200, 300):
        cv2.line(img, (x, 0), (x, 899), (70, 70, 70), 2)
    for y in range(150, 900, 300):
        cv2.line(img, (0, y), (1199, y), (70, 70, 70), 2)
    r = analisis_foto(jpeg(retak_berliku(img)), 1)
    assert r["retak"]["jumlah"] >= 1


def test_noda_rembesan_terdeteksi():
    img = dinding()
    noda = np.zeros(img.shape[:2], np.float32)
    cv2.ellipse(noda, (700, 400), (110, 80), 20, 0, 360, 1.0, -1)
    noda = cv2.GaussianBlur(noda, (41, 41), 0)
    img = (img.astype(np.float32) * (1 - 0.35 * noda[..., None])).astype(np.uint8)
    r = analisis_foto(jpeg(img), 1)
    assert r["noda"]["jumlah"] >= 1
    assert r["noda"]["area_persen"] > 0.5


def test_foto_buram():
    img = cv2.GaussianBlur(retak_berliku(dinding()), (31, 31), 0)
    r = analisis_foto(jpeg(img), 1)
    assert r["kualitas"]["status"] == "buram"
    assert not r["kualitas"]["layak"]


def test_foto_gelap():
    r = analisis_foto(jpeg(dinding(terang=25)), 1)
    assert r["kualitas"]["status"] in ("gelap", "buram")
    assert not r["kualitas"]["layak"]


@pytest.fixture
def client():
    return TestClient(app)


def test_api(client):
    res = client.post(
        "/analisis",
        files=[("foto", ("a.jpg", jpeg(dinding()), "image/jpeg")), ("foto", ("b.jpg", jpeg(retak_berliku(dinding())), "image/jpeg"))],
    )
    assert res.status_code == 200
    body = res.json()
    assert [f["indeks"] for f in body["foto"]] == [1, 2]
    assert body["foto"][1]["retak"]["jumlah"] >= 1


def test_api_bukan_gambar(client):
    res = client.post("/analisis", files=[("foto", ("x.jpg", b"bukan gambar", "image/jpeg"))])
    assert res.status_code == 400
