"""HTTP photo-analysis service. Run: uv run uvicorn main:app --host 127.0.0.1 --port 8000."""

from fastapi import FastAPI, HTTPException, UploadFile
from fastapi.concurrency import run_in_threadpool

import deteksi
from analisis import VERSI, FotoTidakValid, analisis_foto

MAX_FOTO = 10
MAX_BYTES = 8 * 1024 * 1024

app = FastAPI(title="Home Photo Analysis", version=VERSI)


@app.get("/sehat")
def sehat() -> dict:
    return {"ok": True, "versi": VERSI, "model": deteksi.info()}


@app.post("/analisis")
async def analisis(foto: list[UploadFile]) -> dict:
    if not foto:
        raise HTTPException(400, "Upload at least one photo.")
    if len(foto) > MAX_FOTO:
        raise HTTPException(400, f"Maximum {MAX_FOTO} photos allowed.")

    hasil = []
    for i, f in enumerate(foto, start=1):
        data = await f.read(MAX_BYTES + 1)
        if len(data) > MAX_BYTES:
            raise HTTPException(413, f"Photo {i} is too large.")
        try:
            # OpenCV releases the GIL, so running it in the thread pool is safe.
            hasil.append(await run_in_threadpool(analisis_foto, data, i))
        except FotoTidakValid as e:
            raise HTTPException(400, f"Foto {i}: {e}") from e

    return {"versi": VERSI, "foto": hasil}
