"use client";

import { useState } from "react";

type Hasil = { folder: string; ringkasan: Record<string, { gambar: number; kotak: number }> };

export default function EksporDataset({ siap }: { siap: number }) {
  const [hasil, setHasil] = useState<Hasil | null>(null);
  const [status, setStatus] = useState<{ teks: string; err?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  async function ekspor() {
    setBusy(true);
    setStatus({ teks: "Menulis dataset COCO…" });
    try {
      const res = await fetch("/api/dataset/ekspor", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Ekspor gagal.");
      setHasil(data);
      setStatus(null);
    } catch (e) {
      setStatus({ teks: e instanceof Error ? e.message : "Ekspor gagal.", err: true });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div className="row">
        <button type="button" className="btn" style={{ width: "auto" }} onClick={ekspor} disabled={busy || siap === 0}>
          Ekspor untuk pelatihan ({siap} foto berlabel)
        </button>
      </div>
      {status && <div className={`status${status.err ? " err" : ""}`} role="status">{status.teks}</div>}
      {hasil && (
        <div className="tablewrap">
          <table>
            <thead><tr><th>Bagian</th><th>Foto</th><th>Kotak</th></tr></thead>
            <tbody>
              {Object.entries(hasil.ringkasan).map(([b, r]) => (
                <tr key={b}><td>{b}</td><td className="num">{r.gambar}</td><td className="num">{r.kotak}</td></tr>
              ))}
            </tbody>
          </table>
          <p className="foot" style={{ marginTop: 8 }}>Tersimpan di <span className="mono">{hasil.folder}</span></p>
        </div>
      )}
    </div>
  );
}
