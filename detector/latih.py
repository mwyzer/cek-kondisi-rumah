"""Latih model deteksi kerusakan (RF-DETR) dari ekspor COCO alat dataset.

Lokal (CPU, hanya untuk uji kecil):
    uv run python latih.py --data ../data/dataset/ekspor --ukuran nano --epochs 1 --device cpu
GPU di Modal (pelatihan sungguhan): lihat modal_app.py.

Hasil: <keluar>/kerusakan.pth (checkpoint) dan <keluar>/kerusakan.json (kelas, info pelatihan).
"""

from __future__ import annotations

import argparse
import json
import shutil
import sys
from pathlib import Path

# Hanya ukuran berlisensi Apache 2.0 (XL/2XL memakai lisensi PML, tidak dipakai)
UKURAN = {"nano": "RFDETRNano", "small": "RFDETRSmall", "medium": "RFDETRMedium", "large": "RFDETRLarge"}
BAGIAN = ("train", "valid", "test")
MIN_GAMBAR_TRAIN = 5  # batas bawah teknis; untuk model yang berguna perlu ratusan


class DatasetTidakValid(ValueError):
    pass


def cek_dataset(data: Path) -> dict:
    """Pastikan susunan COCO lengkap dan cukup untuk dilatih. Mengembalikan ringkasan."""
    ringkasan: dict = {}
    for b in BAGIAN:
        ann = data / b / "_annotations.coco.json"
        if not ann.exists():
            raise DatasetTidakValid(f"{ann} tidak ada. Ekspor ulang dari halaman /dataset.")
        j = json.loads(ann.read_text(encoding="utf-8"))
        hilang = [im["file_name"] for im in j["images"] if not (data / b / im["file_name"]).exists()]
        if hilang:
            raise DatasetTidakValid(f"{len(hilang)} gambar di {b} tidak ditemukan, mis. {hilang[0]}")
        ringkasan[b] = {"gambar": len(j["images"]), "kotak": len(j["annotations"])}
        if b == "train":
            ringkasan["kelas"] = [c["name"] for c in sorted(j["categories"], key=lambda c: c["id"])]
            per_kelas = {c["id"]: 0 for c in j["categories"]}
            for a in j["annotations"]:
                per_kelas[a["category_id"]] += 1
            ringkasan["kotak_per_kelas"] = {
                c["name"]: per_kelas[c["id"]] for c in sorted(j["categories"], key=lambda c: c["id"])
            }

    if ringkasan["train"]["gambar"] < MIN_GAMBAR_TRAIN:
        raise DatasetTidakValid(
            f"Bagian train baru {ringkasan['train']['gambar']} gambar (minimal {MIN_GAMBAR_TRAIN})."
        )
    if ringkasan["train"]["kotak"] == 0:
        raise DatasetTidakValid("Bagian train tidak punya satu kotak pun.")
    if ringkasan["valid"]["gambar"] == 0:
        raise DatasetTidakValid("Bagian valid kosong. Tambah foto berlabel lalu ekspor ulang.")
    return ringkasan


def cari_checkpoint(run: Path) -> Path:
    for nama in ("checkpoint_best_total.pth", "checkpoint_best_ema.pth", "checkpoint_best_regular.pth"):
        if (run / nama).exists():
            return run / nama
    semua = sorted(run.rglob("*.pth"), key=lambda p: p.stat().st_mtime)
    if not semua:
        raise RuntimeError(f"Tidak ada checkpoint di {run}")
    return semua[-1]


def latih(data: Path, keluar: Path, ukuran: str, epochs: int, batch: int, device: str | None) -> Path:
    ringkasan = cek_dataset(data)
    print("Dataset:", json.dumps(ringkasan, ensure_ascii=False))

    import rfdetr

    model = getattr(rfdetr, UKURAN[ukuran])()
    run = keluar / "run"
    if run.exists():
        shutil.rmtree(run)
    opsi = dict(
        dataset_dir=str(data),
        epochs=epochs,
        batch_size=batch,
        grad_accum_steps=max(1, 16 // batch),  # batch efektif ~16
        output_dir=str(run),
        early_stopping=True,
    )
    if device:
        opsi["device"] = device
    model.train(**opsi)

    keluar.mkdir(parents=True, exist_ok=True)
    tujuan = keluar / "kerusakan.pth"
    shutil.copyfile(cari_checkpoint(run), tujuan)
    (keluar / "kerusakan.json").write_text(
        json.dumps(
            {"kelas": ringkasan["kelas"], "ukuran": ukuran, "epochs": epochs, "dataset": ringkasan},
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )
    print(f"Model tersimpan: {tujuan}")
    return tujuan


def main() -> None:
    # Konsol Windows (cp1252) tidak bisa menulis karakter progress bar RF-DETR → crash setelah epoch
    for s in (sys.stdout, sys.stderr):
        if hasattr(s, "reconfigure"):
            s.reconfigure(encoding="utf-8", errors="replace")
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--data", type=Path, default=Path("../data/dataset/ekspor"))
    ap.add_argument("--keluar", type=Path, default=Path("../analyzer/model"))
    ap.add_argument("--ukuran", choices=UKURAN, default="small")
    ap.add_argument("--epochs", type=int, default=60)
    ap.add_argument("--batch", type=int, default=4)
    ap.add_argument("--device", default=None, help="cpu / cuda (default: otomatis)")
    a = ap.parse_args()
    try:
        latih(a.data.resolve(), a.keluar.resolve(), a.ukuran, a.epochs, a.batch, a.device)
    except DatasetTidakValid as e:
        raise SystemExit(f"Dataset belum siap: {e}") from None


if __name__ == "__main__":
    main()
