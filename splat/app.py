"""Modal worker for 3D scans.

Deploy:  cd splat && uv run modal deploy app.py
Secret:  uv run modal secret create cek-rumah-splat SPLAT_TOKEN=<long-random-token>

Endpoint (dilindungi header `Authorization: Bearer <SPLAT_TOKEN>`):
  POST start   {"video_url": "..."}          → {"call_id": "..."}
  GET  status?call_id=...                    → processing or failure status
                                               | compressed PLY body when complete (X-Status header)
"""

from __future__ import annotations

import os
import subprocess
import tempfile
import urllib.request
from pathlib import Path

import modal
from fastapi import Header, HTTPException, Response

HERE = Path(__file__).resolve().parent
GSPLAT_TAG = "v1.5.3"
TRAINER = "/opt/gsplat/examples/simple_trainer.py"

gpu_image = (
    modal.Image.from_registry("nvidia/cuda:12.4.1-devel-ubuntu22.04", add_python="3.10")
    .apt_install("git", "ffmpeg", "colmap", "libgl1", "libglib2.0-0")
    .pip_install("torch==2.4.1", "torchvision==0.19.1", index_url="https://download.pytorch.org/whl/cu124")
    # Use a precompiled gsplat wheel (torch 2.4 + CUDA 12.4) to avoid CUDA compilation during a job.
    .pip_install("gsplat==1.5.3", extra_index_url="https://docs.gsplat.studio/whl/pt24cu124")
    .run_commands(
        f"git clone --depth 1 --branch {GSPLAT_TAG} https://github.com/nerfstudio-project/gsplat /opt/gsplat",
        # CUDA extensions in requirements (fused-ssim, fused-bilagrid) are compiled for L4/A10G GPUs.
        "TORCH_CUDA_ARCH_LIST='8.6;8.9' pip install --no-build-isolation -r /opt/gsplat/examples/requirements.txt",
        # Export compressed PLY directly (PlayCanvas format read by Spark viewer): about 5x smaller.
        f"sed -i 's/format=\"ply\",/format=\"ply_compressed\",/' {TRAINER}",
        f"grep -q 'format=\"ply_compressed\"' {TRAINER}",
    )
    .add_local_file(HERE / "pipeline.py", "/root/pipeline.py")
    .add_local_file(HERE.parent / "analyzer" / "analisis.py", "/root/analisis.py")
    .add_local_file(HERE.parent / "analyzer" / "deteksi.py", "/root/deteksi.py")  # Imported by analisis.py.
)

web_image = modal.Image.debian_slim(python_version="3.11").pip_install("fastapi[standard]==0.141.1")

app = modal.App("cek-kondisi-rumah-splat")
secret = modal.Secret.from_name("cek-rumah-splat")


def _jalankan(cmd: list[str], cwd: Path | None = None, timeout: int = 1800) -> str:
    r = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True, timeout=timeout)
    if r.returncode != 0:
        print(r.stdout[-4000:], r.stderr[-4000:])
        raise RuntimeError(f"{cmd[0]} {cmd[1] if len(cmd) > 1 else ''} failed (exit code {r.returncode})")
    return r.stdout


@app.function(image=gpu_image, gpu="L4", cpu=8, memory=32768, timeout=40 * 60)
def proses(video_url: str) -> dict:
    """Convert video to compressed PLY. Returns {"ok": True, "ply": bytes} or {"ok": False, "pesan": str}."""
    import pipeline as p

    try:
        p.cek_url_video(video_url)
        with tempfile.TemporaryDirectory() as tmp:
            kerja = Path(tmp)
            video = kerja / "video"
            urllib.request.urlretrieve(video_url, video)

            p.cek_durasi(float(_jalankan(p.perintah_durasi(video)).strip() or 0))

            raw = kerja / "raw"
            raw.mkdir()
            _jalankan(p.perintah_ekstrak(video, raw))
            selected = p.pilih_frame(list(raw.glob("*.jpg")))

            gambar = kerja / "images"
            gambar.mkdir()
            for i, f in enumerate(selected):
                f.rename(gambar / f"{i:05d}.jpg")
            print(f"Using {len(selected)} frames")

            (kerja / "sparse").mkdir()
            for cmd in p.perintah_colmap(kerja):
                _jalankan(cmd)
            p.cek_hasil_colmap(kerja)

            hasil = kerja / "hasil"
            _jalankan(p.perintah_latih(Path(TRAINER), kerja, hasil), cwd=Path(TRAINER).parent)
            ply = p.cari_ply(hasil)
            print(f"PLY: {ply.stat().st_size / 1e6:.1f} MB")
            return {"ok": True, "ply": ply.read_bytes()}
    except p.GagalProses as e:
        return {"ok": False, "pesan": str(e)}
    except Exception as e:  # noqa: BLE001 — technical details are not sent to users
        print("Error:", repr(e))
        return {"ok": False, "pesan": "3D processing failed due to a server error. Please try again later."}


def _cek_token(authorization: str | None) -> None:
    import hmac

    token = os.environ.get("SPLAT_TOKEN", "")
    if not token or not hmac.compare_digest(authorization or "", f"Bearer {token}"):
        raise HTTPException(status_code=401, detail="Invalid token.")


@app.function(image=web_image, secrets=[secret])
@modal.fastapi_endpoint(method="POST")
def mulai(body: dict, authorization: str | None = Header(default=None)):
    _cek_token(authorization)
    call = proses.spawn(str(body.get("video_url", "")))
    return {"call_id": call.object_id}


@app.function(image=web_image, secrets=[secret])
@modal.fastapi_endpoint(method="GET")
def status(call_id: str, authorization: str | None = Header(default=None)):
    _cek_token(authorization)
    try:
        hasil = modal.FunctionCall.from_id(call_id).get(timeout=0)
    except TimeoutError:
        return {"status": "memproses"}
    except modal.exception.OutputExpiredError:
        return {"status": "gagal", "pesan": "The processing result has expired. Please upload the video again."}
    if not hasil.get("ok"):
        return {"status": "gagal", "pesan": hasil.get("pesan", "3D processing failed.")}
    return Response(content=hasil["ply"], media_type="application/octet-stream", headers={"X-Status": "selesai"})
