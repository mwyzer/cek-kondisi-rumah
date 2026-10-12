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
  antre: { teks: "Dalam antrean", t: "na" },
  memproses: { teks: "Sedang diproses", t: "mild" },
  selesai: { teks: "Selesai", t: "ok" },
  gagal: { teks: "Gagal", t: "severe" },
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

  // Tanya status setiap 10 detik selama ada pemindaian yang belum selesai
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
      setStatus({ teks: `Durasi video ${Math.round(durasi)} detik. Gunakan video ${DURASI_MIN}–${DURASI_MAKS} detik.`, err: true });
      return;
    }
    setProgres(0);
    setStatus({ teks: "Mengunggah video…" });
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
      setStatus({ teks: "Memulai pemrosesan 3D…" });
      const res = await fetch("/api/pemindaian", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ penilaianId, ruang, videoUrl: blob.url }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Pemindaian gagal dimulai.");
      setDaftar((d) => [...d, { id: data.id, ruang, status: "memproses", splatUrl: null, pesan: null }]);
      setStatus({ teks: "Video diterima. Model 3D biasanya siap dalam 15–30 menit; halaman ini akan memperbarui sendiri." });
      setFile(null);
      if (input.current) input.current.value = "";
    } catch (err) {
      setStatus({ teks: err instanceof Error ? err.message : "Unggahan gagal. Coba lagi.", err: true });
    } finally {
      setProgres(null);
    }
  }

  return (
    <div className="section">
      <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
        <h2>Pemindaian 3D</h2>
        <span className="foot">Visual saja, tidak memengaruhi skor, indeks, atau kategori.</span>
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
                      <p className="foot">Seret untuk memutar, gulir atau cubit untuk zoom, klik kanan atau dua jari untuk menggeser.</p>
                    </>
                  ) : (
                    <button type="button" className="btn ghost" onClick={() => setDibuka(p.id)}>Buka tampilan 3D</button>
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
            <label className="f">Ruangan
              <select id="scan-ruang" value={ruang} onChange={(e) => setRuang(e.target.value)} disabled={progres != null}>
                {RUANG.map((r) => <option key={r}>{r}</option>)}
              </select>
            </label>
            <label className="f">Video ({DURASI_MIN}–{DURASI_MAKS} detik, MP4/MOV)
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
            <li>Berjalan pelan mengelilingi ruangan, kamera mengarah ke dinding dan sudut.</li>
            <li>Arahkan juga ke plafon dan lantai; hindari gerakan cepat dan memutar di tempat.</li>
            <li>Nyalakan lampu atau rekam di siang hari.</li>
          </ul>
          <div className="row">
            <button type="submit" className="btn" style={{ width: "auto" }} disabled={!file || progres != null}>
              {progres != null ? `Mengunggah ${progres}%` : "Unggah & buat model 3D"}
            </button>
          </div>
          {status && <div className={`status${status.err ? " err" : ""}`} role="status" aria-live="polite">{status.teks}</div>}
        </form>
      ) : (
        <p className="muted">
          Pemindaian 3D belum diaktifkan di server ini. Lihat bagian &quot;Pemindaian 3D&quot; di README untuk mengaktifkannya.
        </p>
      )}
    </div>
  );
}
