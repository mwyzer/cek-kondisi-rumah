"""Train a damage-detection model on a Modal GPU.

    cd detector
    uv run modal run modal_app.py --data ../data/dataset/ekspor --ukuran small --epochs 60

The dataset is uploaded from this computer, trained on the GPU, and the model is saved to ../analyzer/model/.
"""

from __future__ import annotations

import io
import tarfile
from pathlib import Path

import modal

HERE = Path(__file__).resolve().parent

image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("libgl1", "libglib2.0-0")
    .pip_install("torch==2.4.1", "torchvision==0.19.1", index_url="https://download.pytorch.org/whl/cu124")
    .pip_install("rfdetr[train]==1.11.0")
    .add_local_file(HERE / "latih.py", "/root/latih.py")
)

app = modal.App("cek-kondisi-rumah-detector")


@app.function(image=image, gpu="L4", cpu=8, memory=32768, timeout=4 * 60 * 60)
def latih_gpu(dataset_tar: bytes, ukuran: str, epochs: int, batch: int) -> dict:
    import tempfile

    import latih

    with tempfile.TemporaryDirectory() as tmp:
        data, keluar = Path(tmp) / "data", Path(tmp) / "keluar"
        with tarfile.open(fileobj=io.BytesIO(dataset_tar)) as t:
            t.extractall(data, filter="data")
        latih.latih(data, keluar, ukuran, epochs, batch, "cuda")
        return {
            "pth": (keluar / "kerusakan.pth").read_bytes(),
            "json": (keluar / "kerusakan.json").read_text(encoding="utf-8"),
        }


@app.local_entrypoint()
def main(data: str = "../data/dataset/ekspor", ukuran: str = "small", epochs: int = 60, batch: int = 8,
         keluar: str = "../analyzer/model"):
    import latih

    dir_data = Path(data).resolve()
    ringkasan = latih.cek_dataset(dir_data)  # gagal cepat di lokal sebelum memakai GPU
    print("Dataset:", ringkasan)

    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode="w:gz") as t:
        for b in latih.BAGIAN:
            t.add(dir_data / b, arcname=b)
    print(f"Uploading {buf.tell() / 1e6:.1f} MB dataset to Modal…")

    hasil = latih_gpu.remote(buf.getvalue(), ukuran, epochs, batch)
    dir_keluar = Path(keluar).resolve()
    dir_keluar.mkdir(parents=True, exist_ok=True)
    (dir_keluar / "kerusakan.pth").write_bytes(hasil["pth"])
    (dir_keluar / "kerusakan.json").write_text(hasil["json"], encoding="utf-8")
    print(f"Model saved to {dir_keluar}. Restart the analysis service to use it.")
