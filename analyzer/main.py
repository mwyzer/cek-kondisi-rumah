"""Layanan HTTP analisis foto. Jalankan: uv run uvicorn main:app --host 127.0.0.1 --port 8000"""

from fastapi import FastAPI, HTTPException, UploadFile
from fastapi.concurrency import run_in_threadpool

from analisis import VERSI, FotoTidakValid, analisis_foto

MAX_FOTO = 10
MAX_BYTES = 8 * 1024 * 1024

app = FastAPI(title="Analisis Foto Rumah", version=VERSI)


@app.get("/sehat")
def sehat() -> dict:
    return {"ok": True, "versi": VERSI}


@app.post("/analisis")
async def analisis(foto: list[UploadFile]) -> dict:
    if not foto:
        raise HTTPException(400, "Kirim minimal 1 foto.")
    if len(foto) > MAX_FOTO:
        raise HTTPException(400, f"Maksimal {MAX_FOTO} foto.")

    hasil = []
    for i, f in enumerate(foto, start=1):
        data = await f.read(MAX_BYTES + 1)
        if len(data) > MAX_BYTES:
            raise HTTPException(413, f"Foto {i} terlalu besar.")
        try:
            # OpenCV melepas GIL, jadi aman dijalankan di thread pool
            hasil.append(await run_in_threadpool(analisis_foto, data, i))
        except FotoTidakValid as e:
            raise HTTPException(400, f"Foto {i}: {e}") from e

    return {"versi": VERSI, "foto": hasil}
