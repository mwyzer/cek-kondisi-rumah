"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { MAX_FOTO, RUANG } from "@/lib/penilaian";

type Foto = { id: string; file: File; url: string; label: string };

const TIPE_DITERIMA = ["image/jpeg", "image/png", "image/webp"];

// Perkecil di browser: JPEG sisi terpanjang 1568 px untuk AI, 360 px untuk thumbnail laporan
async function siapkan(file: File) {
  const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
  const ubah = (maks: number) => {
    const s = Math.min(1, maks / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * s);
    c.height = Math.round(bmp.height * s);
    c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
    return c;
  };
  const besar = await new Promise<Blob>((ok, gagal) =>
    ubah(1568).toBlob((b) => (b ? ok(b) : gagal(new Error("toBlob"))), "image/jpeg", 0.85),
  );
  const thumb = ubah(360).toDataURL("image/jpeg", 0.7);
  bmp.close();
  return { besar, thumb };
}

export default function FormPenilaian() {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [foto, setFoto] = useState<Foto[]>([]);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ teks: string; err?: boolean }>({ teks: "Tambahkan minimal 1 foto." });

  // Lepas object URL pratinjau saat halaman ditinggalkan
  const fotoRef = useRef(foto);
  useEffect(() => { fotoRef.current = foto; }, [foto]);
  useEffect(() => () => fotoRef.current.forEach((f) => URL.revokeObjectURL(f.url)), []);

  function tambah(list: FileList | null) {
    if (!list) return;
    let dilewati = 0;
    const baru: Foto[] = [];
    for (const file of Array.from(list)) {
      if (!TIPE_DITERIMA.includes(file.type) || foto.length + baru.length >= MAX_FOTO) {
        dilewati++;
        continue;
      }
      const n = foto.length + baru.length;
      baru.push({ id: crypto.randomUUID(), file, url: URL.createObjectURL(file), label: RUANG[Math.min(n, RUANG.length - 1)] });
    }
    const total = foto.length + baru.length;
    setFoto((f) => [...f, ...baru]);
    setStatus(
      dilewati
        ? { teks: `${dilewati} file dilewati (hanya JPG/PNG/WebP, maks. ${MAX_FOTO} foto).`, err: true }
        : { teks: `${total} dari maks. ${MAX_FOTO} foto siap dinilai.` },
    );
  }

  function hapus(id: string) {
    setFoto((f) => {
      const x = f.find((p) => p.id === id);
      if (x) URL.revokeObjectURL(x.url);
      return f.filter((p) => p.id !== id);
    });
  }

  async function kirim(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!foto.length || busy) return;
    setBusy(true);
    const form = new FormData(e.currentTarget);
    try {
      setStatus({ teks: "Menyiapkan foto…" });
      const siap = await Promise.all(foto.map((f) => siapkan(f.file)));
      foto.forEach((f, i) => {
        form.append("foto", siap[i].besar, `F${i + 1}.jpg`);
        form.append("label", f.label);
        form.append("thumb", siap[i].thumb);
      });
      setStatus({ teks: "AI sedang memeriksa foto… biasanya 20–60 detik." });
      const res = await fetch("/api/penilaian", { method: "POST", body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.id) throw new Error(data.error ?? "Penilaian gagal. Coba lagi.");
      setStatus({ teks: "Selesai. Membuka laporan…" });
      router.push(`/penilaian/${data.id}`);
    } catch (err) {
      setStatus({ teks: err instanceof Error && err.message !== "toBlob" ? err.message : "Foto tidak dapat diproses.", err: true });
      setBusy(false);
    }
  }

  return (
    <form className="panel" onSubmit={kirim} aria-busy={busy}>
      <div>
        <h2>1. Foto rumah</h2>
        <p className="muted" style={{ marginTop: 4, fontSize: "0.88rem" }}>
          Fasad, atap, dinding, lantai, plafon, kamar mandi, dan titik yang dicurigai rusak (retak, rembes, lapuk).
        </p>
      </div>

      <button
        type="button"
        className={`drop${over ? " over" : ""}`}
        onClick={() => input.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); tambah(e.dataTransfer.files); }}
        disabled={busy}
      >
        <strong>Pilih atau seret foto ke sini</strong>
        <span className="muted" style={{ fontSize: "0.82rem" }}>JPG, PNG, atau WebP · maks. {MAX_FOTO} foto</span>
      </button>
      <input
        ref={input}
        type="file"
        accept={TIPE_DITERIMA.join(",")}
        multiple
        hidden
        onChange={(e) => { tambah(e.target.files); e.target.value = ""; }}
      />

      {foto.length > 0 && (
        <div className="photos">
          {foto.map((p, i) => (
            <div className="photo" key={p.id}>
              <div className="img">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.url} alt={`Foto ${i + 1}: ${p.label}`} />
                <span className="num">F{i + 1}</span>
                <button type="button" className="rm" onClick={() => hapus(p.id)} aria-label={`Hapus foto ${i + 1}`} disabled={busy}>×</button>
              </div>
              <select
                id={`label-${p.id}`}
                aria-label={`Bagian rumah pada foto ${i + 1}`}
                value={p.label}
                disabled={busy}
                onChange={(e) => setFoto((f) => f.map((x) => (x.id === p.id ? { ...x, label: e.target.value } : x)))}
              >
                {RUANG.map((r) => <option key={r}>{r}</option>)}
              </select>
            </div>
          ))}
        </div>
      )}

      <h2>
        2. Data bangunan <span className="muted" style={{ font: "400 0.8rem var(--f-body)" }}>(opsional)</span>
      </h2>
      <div className="fields">
        <label className="f">Tipe / luas bangunan<input type="text" id="tipe" name="tipe" placeholder="mis. Tipe 45" maxLength={80} /></label>
        <label className="f">Umur bangunan (tahun)<input type="number" id="umur" name="umur" min={0} max={150} placeholder="mis. 12" /></label>
        <label className="f">Jumlah lantai
          <select id="lantai" name="lantai" defaultValue="">
            <option value="">—</option><option>1</option><option>2</option><option>3+</option>
          </select>
        </label>
        <label className="f">Lokasi (kota)<input type="text" id="kota" name="kota" placeholder="mis. Bekasi" maxLength={80} /></label>
      </div>

      <button type="submit" className="btn" disabled={!foto.length || busy}>
        {busy ? "Menilai…" : "Nilai kondisi rumah"}
      </button>
      {busy && <div className="progress" aria-hidden="true"><i /></div>}
      <div className={`status${status.err ? " err" : ""}`} role="status" aria-live="polite">{status.teks}</div>
    </form>
  );
}
