"""Optional damage detection with a trained RF-DETR model.

Enabled when `model/kerusakan.pth` exists and the rfdetr package is installed (`uv sync --extra deteksi`).
Train the model using `detector/` and the dataset labeled on the `/dataset` page.
"""

from __future__ import annotations

import json
import threading
from pathlib import Path

import cv2
import numpy as np

DIR_MODEL = Path(__file__).resolve().parent / "model"
MODEL = DIR_MODEL / "kerusakan.pth"
AMBANG = 0.4  # Minimum confidence; increase if there are too many false detections.

# Class colors (BGR); keep in sync with src/lib/kelas-kerusakan.ts.
WARNA_HEX = {
    "retak": "#e5484d", "rembesan": "#f76b15", "jamur": "#30a46c", "cat_mengelupas": "#ffc53d",
    "plester_rusak": "#8e4ec6", "karat": "#a35829", "kayu_lapuk": "#6e56cf", "keramik_rusak": "#0090ff",
    "plafon_rusak": "#d6409f",
}
WARNA = {k: tuple(int(v[i : i + 2], 16) for i in (5, 3, 1)) for k, v in WARNA_HEX.items()}

_kunci = threading.Lock()
_model = None
_pesan: str | None = None


def _muat():
    """Load the model once. Return None with a message if it is unavailable."""
    global _model, _pesan
    with _kunci:
        if _model is not None or _pesan is not None:
            return _model
        if not MODEL.exists():
            _pesan = f"Model not found ({MODEL.relative_to(DIR_MODEL.parent)})."
            return None
        try:
            from rfdetr import RFDETR
        except ImportError:
            _pesan = "The rfdetr package is not installed (uv sync --extra deteksi)."
            return None
        _model = RFDETR.from_checkpoint(str(MODEL))
        return _model


def info() -> dict:
    aktif = _muat() is not None
    meta = DIR_MODEL / "kerusakan.json"
    kelas = json.loads(meta.read_text(encoding="utf-8")).get("kelas") if aktif and meta.exists() else None
    return {"aktif": aktif, "pesan": _pesan, "kelas": kelas, "ambang": AMBANG}


def deteksi(img_bgr: np.ndarray) -> list[dict]:
    """Return damage boxes in input-image coordinates: [{kelas, skor, x, y, w, h}]."""
    model = _muat()
    if model is None:
        return []
    rgb = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)
    with _kunci:  # Concurrent access to the torch model is not guaranteed to be safe.
        det = model.predict(rgb, threshold=AMBANG, include_source_image=False)
    nama = det.data.get("class_name")
    h, w = img_bgr.shape[:2]
    hasil = []
    for i, (x1, y1, x2, y2) in enumerate(det.xyxy):
        x1, y1 = max(0, int(x1)), max(0, int(y1))
        x2, y2 = min(w, int(x2)), min(h, int(y2))
        if x2 - x1 < 2 or y2 - y1 < 2:
            continue
        hasil.append({
            "kelas": str(nama[i]) if nama is not None else str(int(det.class_id[i])),
            "skor": round(float(det.confidence[i]), 3),
            "x": x1, "y": y1, "w": x2 - x1, "h": y2 - y1,
        })
    return hasil


def gambar_kotak(out: np.ndarray, kotak: list[dict], skala: float) -> None:
    """Draw detection boxes (original-photo coordinates) on `out`, resized by `skala`."""
    tebal = max(2, round(out.shape[1] / 300))
    for k in kotak:
        warna = WARNA.get(k["kelas"], (255, 255, 255))
        x, y = round(k["x"] * skala), round(k["y"] * skala)
        x2, y2 = round((k["x"] + k["w"]) * skala), round((k["y"] + k["h"]) * skala)
        cv2.rectangle(out, (x, y), (x2, y2), warna, tebal)
        teks = f"{k['kelas']} {k['skor']:.2f}"
        (tw, th), _ = cv2.getTextSize(teks, cv2.FONT_HERSHEY_SIMPLEX, 0.5, 1)
        ty = max(th + 4, y)
        cv2.rectangle(out, (x, ty - th - 4), (x + tw + 4, ty), warna, -1)
        cv2.putText(out, teks, (x + 2, ty - 3), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1, cv2.LINE_AA)
