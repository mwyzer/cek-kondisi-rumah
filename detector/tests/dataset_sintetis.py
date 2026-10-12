"""Dataset COCO sintetis kecil (dinding + retak buatan) untuk menguji alur pelatihan.

Bukan untuk melatih model yang berguna: hanya memastikan latih → checkpoint → prediksi berjalan.
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

KELAS = ["retak", "rembesan", "jamur", "cat_mengelupas", "plester_rusak", "karat", "kayu_lapuk", "keramik_rusak", "plafon_rusak"]


def _gambar(rng: np.random.Generator, w: int = 640, h: int = 480):
    base = rng.normal(195, 7, (h, w)).clip(0, 255).astype(np.uint8)
    img = Image.fromarray(np.stack([base] * 3, -1))
    d = ImageDraw.Draw(img)
    x, y = int(rng.integers(40, w // 2)), int(rng.integers(40, h // 2))
    pts = [(x, y)]
    for _ in range(25):
        x += int(rng.integers(6, 12))
        y += int(rng.integers(-2, 12))
        pts.append((min(x, w - 5), min(max(y, 5), h - 5)))
    d.line(pts, fill=(70, 70, 70), width=3)
    xs, ys = [p[0] for p in pts], [p[1] for p in pts]
    kotak = [min(xs) - 4, min(ys) - 4, max(xs) - min(xs) + 8, max(ys) - min(ys) + 8]
    return img, kotak


def buat(dir_: Path, jumlah: dict[str, int] | None = None, seed: int = 0) -> Path:
    jumlah = jumlah or {"train": 10, "valid": 3, "test": 2}
    rng = np.random.default_rng(seed)
    categories = [{"id": i + 1, "name": k, "supercategory": "kerusakan"} for i, k in enumerate(KELAS)]
    for b, n in jumlah.items():
        (dir_ / b).mkdir(parents=True, exist_ok=True)
        images, anns = [], []
        for i in range(n):
            img, kotak = _gambar(rng)
            nama = f"{b}_{i:03d}.jpg"
            img.save(dir_ / b / nama, quality=92)
            images.append({"id": i + 1, "file_name": nama, "width": img.width, "height": img.height})
            anns.append({"id": i + 1, "image_id": i + 1, "category_id": 1, "bbox": kotak,
                         "area": kotak[2] * kotak[3], "iscrowd": 0})
        (dir_ / b / "_annotations.coco.json").write_text(
            json.dumps({"images": images, "annotations": anns, "categories": categories})
        )
    return dir_
