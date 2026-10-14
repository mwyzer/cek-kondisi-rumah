"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { upload } from "@vercel/blob/client";
import { RUANG } from "@/lib/penilaian";

const ViewerSplat = dynamic(() => import("./ViewerSplat"), { ssr: false });

export type PemindaianPublik = {
  id: string;
  ruang: string;
  status: "antre" | "memproses" | "selesai" | "gagal";
  splatUrl: string | null;
  pesan: string | null;
};

const LABEL_STATUS: Record<PemindaianPublik["status"], { teks: string; t: string }> = {
  antre: { teks: "Queued", t: "na" },
  memproses: { teks: "Processing", t: "mild" },
  selesai: { teks: "Complete", t: "ok" },
  gagal: { teks: "Failed", t: "severe" },
};

const DURASI_MIN = 10;
const DURASI_MAKS = 90;

function durasiVideo(file: File) {
  return new Promise<number>((ok) => {
    const v = document.createElement("video");
    v.preload = "metadata";
    v.onloadedmetadata = () => { URL.revokeObjectURL(v.src); ok(v.duration); };
    v.onerror = () => { URL.revokeObjectURL(v.src); ok(NaN); };
    v.src = URL.createObjectURL(file);
  });
}

export default function Pemindaian3D({
  penilaianId,
  awal,
  aktif,
}: {
  penilaianId: string;
  awal: PemindaianPublik[];
  aktif: boolean;
}) {
  const [daftar, setDaftar] = useState(awal);
  const [ruang, setRuang] = useState(RUANG[2]);
  const [file, setFile] = useState<File | null>(null);
  const [progres, setProgres] = useState<number | null>(null);
  const [status, setStatus] = useState<{ teks: string; err?: boolean } | null>(null);
  const [dibuka, setDibuka] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  // Poll every 10 seconds while any scan is still in progress.
  const menunggu = daftar.filter((p) => p.status === "antre" || p.status === "memproses").map((p) => p.id);
  const kunci = menunggu.join(",");
  useEffect(() => {
    if (!kunci) return;
    const t = setInterval(async () => {
      for (const id of kunci.split(",")) {
        const res = await fetch(`/api/pemindaian/${id}`).catch(() => null);
        if (!res?.ok) continue;
        const p = (await res.json()) as PemindaianPublik;
        setDaftar((d) => d.map((x) => (x.id === p.id ? p : x)));
      }
    }, 10_000);
    return () => clearInterval(t);
  }, [kunci]);

  async function kirim(e: React.FormEvent) {
    e.preventDefault();
    if (!file || progres != null) return;
    const durasi = await durasiVideo(file);
    if (Number.isFinite(durasi) && (durasi < DURASI_MIN || durasi > DURASI_MAKS)) {
      setStatus({ teks: `Video duration is ${Math.round(durasi)} seconds. Use a video between ${DURASI_MIN} and ${DURASI_MAKS} seconds.`, err: true });
      return;
    }
    setProgres(0);
    setStatus({ teks: "Uploading video…" });
    try {
      const ext = file.type === "video/quicktime" ? "mov" : "mp4";
      const blob = await upload(`pemindaian/${penilaianId}.${ext}`, file, {
        access: "public",
        handleUploadUrl: "/api/pemindaian/unggah",
        clientPayload: JSON.stringify({ penilaianId }),
        contentType: file.type,
        multipart: file.size > 20 * 1024 * 1024,
        onUploadProgress: ({ percentage }) => setProgres(Math.round(percentage)),
      });
      setStatus({ teks: "Starting 3D processing…" });
      const res = await fetch("/api/pemindaian", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ penilaianId, ruang, videoUrl: blob.url }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Failed to start 3D scan.");
      setDaftar((d) => [...d, { id: data.id, ruang, status: "memproses", splatUrl: null, pesan: null }]);
      setStatus({ teks: "Video received. The 3D model is usually ready in 15–30 minutes; this page will update automatically." });
      setFile(null);
      if (input.current) input.current.value = "";
    } catch (err) {
      setStatus({ teks: err instanceof Error ? err.message : "Upload failed. Please try again.", err: true });
    } finally {
      setProgres(null);
    }
  }

  return (
    <div className="section">
      <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
        <h2>3D scan</h2>
        <span className="foot">For visualization only; it does not affect the score, index, or category.</span>
      </div>

      {daftar.length > 0 && (
        <div className="scans">
          {daftar.map((p) => {
            const st = LABEL_STATUS[p.status];
            return (
              <div className="scan" key={p.id}>
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <strong>{p.ruang}</strong>
                  <span className={`chip t-${st.t}`}>{st.teks}</span>
                </div>
                {p.status === "gagal" && p.pesan && <p className="foot t-severe">{p.pesan}</p>}
                {(p.status === "antre" || p.status === "memproses") && (
                  <div className="progress" aria-hidden="true"><i /></div>
                )}
                {p.status === "selesai" && p.splatUrl && (
                  dibuka === p.id ? (
                    <>
                      <ViewerSplat url={p.splatUrl} label={p.ruang} />
                      <p className="foot">Drag to rotate, scroll or pinch to zoom, and right-click or use two fingers to pan.</p>
                    </>
                  ) : (
                    <button type="button" className="btn ghost" onClick={() => setDibuka(p.id)}>Open 3D viewer</button>
                  )
                )}
              </div>
            );
          })}
        </div>
      )}

      {aktif ? (
        <form className="scan-form" onSubmit={kirim}>
          <div className="fields">
            <label className="f">Room
              <select id="scan-ruang" value={ruang} onChange={(e) => setRuang(e.target.value)} disabled={progres != null}>
                {RUANG.map((r) => <option key={r}>{r}</option>)}
              </select>
            </label>
            <label className="f">Video ({DURASI_MIN}–{DURASI_MAKS} seconds, MP4/MOV)
              <input
                ref={input}
                id="scan-video"
                type="file"
                accept="video/mp4,video/quicktime"
                disabled={progres != null}
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </label>
          </div>
          <ul className="list foot">
            <li>Walk slowly around the room with the camera pointed at the walls and corners.</li>
            <li>Capture the ceiling and floor too; avoid quick movements or turning in place.</li>
            <li>Turn on the lights or record during the day.</li>
          </ul>
          <div className="row">
            <button type="submit" className="btn" style={{ width: "auto" }} disabled={!file || progres != null}>
              {progres != null ? `Uploading ${progres}%` : "Upload & create 3D model"}
            </button>
          </div>
          {status && <div className={`status${status.err ? " err" : ""}`} role="status" aria-live="polite">{status.teks}</div>}
        </form>
      ) : (
        <p className="muted">
          3D scanning is not enabled on this server. See the “3D scanning” section in the README to enable it.
        </p>
      )}
    </div>
  );
}
