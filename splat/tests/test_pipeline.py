"""Uji langkah pemindaian yang tidak butuh GPU (pemilihan frame, validasi, perintah)."""

from pathlib import Path

import cv2
import numpy as np
import pytest

import pipeline as p

RNG = np.random.default_rng(3)


def frame(path: Path, buram: bool = False) -> Path:
    img = np.full((720, 1280), 190, np.float32) + RNG.normal(0, 8, (720, 1280))
    img = np.clip(img, 0, 255).astype(np.uint8)
    cv2.line(img, (100, 100), (1100, 600), 60, 3)
    if buram:
        img = cv2.GaussianBlur(img, (31, 31), 0)
    cv2.imwrite(str(path), img)
    return path


def buat(tmp: Path, tajam: int, buram: int = 0) -> list[Path]:
    hasil = [frame(tmp / f"t{i:04d}.jpg") for i in range(tajam)]
    hasil += [frame(tmp / f"b{i:04d}.jpg", buram=True) for i in range(buram)]
    return hasil


def test_frame_buram_dibuang(tmp_path):
    terpilih = p.pilih_frame(buat(tmp_path, tajam=35, buram=10))
    assert len(terpilih) == 35
    assert all(f.name.startswith("t") for f in terpilih)


def test_terlalu_sedikit_frame_tajam(tmp_path):
    with pytest.raises(p.GagalProses, match="cukup tajam"):
        p.pilih_frame(buat(tmp_path, tajam=10, buram=40))


def test_frame_dibatasi_merata(tmp_path, monkeypatch):
    monkeypatch.setattr(p, "ketajaman", lambda _f: 10.0)  # semua tajam, tanpa membaca gambar
    frames = [tmp_path / f"{i:05d}.jpg" for i in range(400)]
    terpilih = p.pilih_frame(frames)
    assert len(terpilih) == p.FRAME_MAKS
    assert terpilih[0] == frames[0] and terpilih == sorted(terpilih)


@pytest.mark.parametrize("detik", [3, 120])
def test_durasi_ditolak(detik):
    with pytest.raises(p.GagalProses):
        p.cek_durasi(detik)


def test_durasi_diterima():
    p.cek_durasi(45)


@pytest.mark.parametrize(
    "url",
    [
        "http://abc.public.blob.vercel-storage.com/v.mp4",
        "https://contoh.com/v.mp4",
        "https://public.blob.vercel-storage.com.jahat.com/v.mp4",
        "file:///etc/passwd",
    ],
)
def test_url_video_ditolak(url):
    with pytest.raises(p.GagalProses):
        p.cek_url_video(url)


def test_url_video_blob_diterima():
    p.cek_url_video("https://abc123.public.blob.vercel-storage.com/pemindaian/v-x1.mp4")


def test_perintah_latih_membatasi_gaussian(tmp_path):
    cmd = p.perintah_latih(Path("/opt/t.py"), tmp_path, tmp_path / "h")
    assert cmd[2] == "mcmc"
    assert cmd[cmd.index("--strategy.cap-max") + 1] == str(p.GAUSSIAN_MAKS)
    assert "--save_ply" in cmd and "--disable_viewer" in cmd


def test_colmap_sequential_tanpa_gpu(tmp_path):
    cmds = p.perintah_colmap(tmp_path)
    assert [c[1] for c in cmds] == ["feature_extractor", "sequential_matcher", "mapper"]
    assert all("1" not in c[c.index(f) + 1] for c in cmds for f in c if f.endswith("use_gpu"))


def test_colmap_gagal_tanpa_model(tmp_path):
    with pytest.raises(p.GagalProses, match="Pose kamera"):
        p.cek_hasil_colmap(tmp_path)
    (tmp_path / "sparse" / "0").mkdir(parents=True)
    (tmp_path / "sparse" / "0" / "images.bin").write_bytes(b"x")
    p.cek_hasil_colmap(tmp_path)


def test_cari_ply(tmp_path):
    with pytest.raises(p.GagalProses):
        p.cari_ply(tmp_path)
    (tmp_path / "ply").mkdir()
    (tmp_path / "ply" / "point_cloud_14999.ply").write_bytes(b"ply")
    assert p.cari_ply(tmp_path).name == "point_cloud_14999.ply"
