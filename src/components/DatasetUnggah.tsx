"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { kanvasDari, keJpeg, TIPE_GAMBAR } from "@/lib/gambar-klien";

const PER_KIRIM = 5;

// Unggah banyak foto ke dataset; diperkecil ke sisi terpanjang 2048 px (cukup untuk melatih model)
export default function DatasetUnggah() {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [status, setStatus] = useState<{ teks: string; err?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  async function unggah(list: FileList | null) {
    const files = Array.from(list ?? []).filter((f) => TIPE_GAMBAR.includes(f.type));
    if (!files.length || busy) return;
    setBusy(true);
    let selesai = 0;
    let tanpaSaran = false;
    try {
      for (let i = 0; i < files.length; i += PER_KIRIM) {
        const form = new FormData();
        for (const f of files.slice(i, i + PER_KIRIM)) {
          const [c] = await kanvasDari(f, 2048);
          form.append("foto", await keJpeg(c, 0.9), f.name);
          form.append("lebar", String(c.width));
          form.append("tinggi", String(c.height));
        }
        setStatus({ teks: `Mengunggah dan membuat saran label… ${selesai}/${files.length}` });
        const res = await fetch("/api/dataset/gambar", { method: "POST", body: form });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error ?? "Unggahan gagal.");
        if (!data.saran) tanpaSaran = true;
        selesai += data.ids.length;
      }
      setStatus({
        teks:
          `${selesai} foto ditambahkan.` +
          (tanpaSaran ? " Saran label otomatis tidak tersedia karena layanan analisis Python tidak berjalan." : ""),
      });
      router.refresh();
    } catch (e) {
      setStatus({ teks: `${selesai} foto tersimpan, lalu gagal: ${e instanceof Error ? e.message : "kesalahan"}`, err: true });
      router.refresh();
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div style={{ display: "grid", gap: 10 }}>
      <button
        type="button"
        className={`drop${over ? " over" : ""}`}
        disabled={busy}
        onClick={() => input.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); unggah(e.dataTransfer.files); }}
      >
        <strong>{busy ? "Mengunggah…" : "Tambah foto ke dataset"}</strong>
        <span className="muted" style={{ fontSize: "0.82rem" }}>Pilih atau seret banyak foto sekaligus · JPG, PNG, WebP</span>
      </button>
      <input ref={input} id="dataset-foto" type="file" multiple hidden accept={TIPE_GAMBAR.join(",")} onChange={(e) => unggah(e.target.files)} />
      {status && <div className={`status${status.err ? " err" : ""}`} role="status" aria-live="polite">{status.teks}</div>}
    </div>
  );
}
