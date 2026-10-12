import json

import pytest

import latih
from dataset_sintetis import buat


def test_dataset_lengkap_lolos(tmp_path):
    r = latih.cek_dataset(buat(tmp_path))
    assert r["train"] == {"gambar": 10, "kotak": 10}
    assert r["kelas"][0] == "retak" and len(r["kelas"]) == 9
    assert r["kotak_per_kelas"]["retak"] == 10


def test_valid_kosong_ditolak(tmp_path):
    with pytest.raises(latih.DatasetTidakValid, match="valid kosong"):
        latih.cek_dataset(buat(tmp_path, {"train": 6, "valid": 0, "test": 1}))


def test_train_terlalu_sedikit(tmp_path):
    with pytest.raises(latih.DatasetTidakValid, match="minimal"):
        latih.cek_dataset(buat(tmp_path, {"train": 2, "valid": 1, "test": 1}))


def test_gambar_hilang(tmp_path):
    d = buat(tmp_path)
    (d / "train" / "train_000.jpg").unlink()
    with pytest.raises(latih.DatasetTidakValid, match="tidak ditemukan"):
        latih.cek_dataset(d)


def test_tanpa_kotak(tmp_path):
    d = buat(tmp_path)
    ann = d / "train" / "_annotations.coco.json"
    j = json.loads(ann.read_text())
    j["annotations"] = []
    ann.write_text(json.dumps(j))
    with pytest.raises(latih.DatasetTidakValid, match="tidak punya satu kotak"):
        latih.cek_dataset(d)


def test_hanya_ukuran_apache():
    assert set(latih.UKURAN) == {"nano", "small", "medium", "large"}
