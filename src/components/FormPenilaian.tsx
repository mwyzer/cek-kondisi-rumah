"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { MAX_FOTO, RUANG } from "@/lib/penilaian";
import { kanvasDari, keJpeg, TIPE_GAMBAR as TIPE_DITERIMA } from "@/lib/gambar-klien";

type Foto = { id: string; file: File; url: string; label: string };

// Resize in the browser: JPEG with a 1568 px longest edge for AI and 360 px for report thumbnails.
async function siapkan(file: File) {
  const [besar, kecil] = await kanvasDari(file, 1568, 360);
  return { besar: await keJpeg(besar, 0.85), thumb: kecil.toDataURL("image/jpeg", 0.7) };
}

export default function FormPenilaian() {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [foto, setFoto] = useState<Foto[]>([]);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ teks: string; err?: boolean }>({ teks: "Add at least one photo." });

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
        ? { teks: `${dilewati} file(s) skipped (JPG/PNG/WebP only; maximum ${MAX_FOTO} photos).`, err: true }
        : { teks: `${total} of ${MAX_FOTO} maximum photos ready for assessment.` },
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
      setStatus({ teks: "Preparing photos…" });
      const siap = await Promise.all(foto.map((f) => siapkan(f.file)));
      foto.forEach((f, i) => {
        form.append("foto", siap[i].besar, `F${i + 1}.jpg`);
        form.append("label", f.label);
        form.append("thumb", siap[i].thumb);
      });
      setStatus({ teks: "AI is assessing the photos… this usually takes 20–60 seconds." });
      const res = await fetch("/api/penilaian", { method: "POST", body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.id) throw new Error(data.error ?? "Assessment failed. Please try again.");
      setStatus({ teks: "Complete. Opening the report…" });
      router.push(`/penilaian/${data.id}`);
    } catch (err) {
      setStatus({ teks: err instanceof Error && err.message !== "toBlob" ? err.message : "The photos could not be processed.", err: true });
      setBusy(false);
    }
  }

  return (
    <form className="panel" onSubmit={kirim} aria-busy={busy}>
      <div>
        <h2>1. Home photos</h2>
        <p className="muted" style={{ marginTop: 4, fontSize: "0.88rem" }}>
          Exterior, roof, walls, floors, ceilings, bathrooms, and any areas with suspected damage (cracks, leaks, or rot).
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
        <strong>Choose or drag photos here</strong>
        <span className="muted" style={{ fontSize: "0.82rem" }}>JPG, PNG, or WebP · up to {MAX_FOTO} photos</span>
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
                <img src={p.url} alt={`Photo ${i + 1}: ${p.label}`} />
                <span className="num">F{i + 1}</span>
                <button type="button" className="rm" onClick={() => hapus(p.id)} aria-label={`Remove photo ${i + 1}`} disabled={busy}>×</button>
              </div>
              <select
                id={`label-${p.id}`}
                aria-label={`Area of the home shown in photo ${i + 1}`}
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
        2. Building details <span className="muted" style={{ font: "400 0.8rem var(--f-body)" }}>(optional)</span>
      </h2>
      <div className="fields">
        <label className="f">Building type / floor area<input type="text" id="tipe" name="tipe" placeholder="e.g. 45 m²" maxLength={80} /></label>
        <label className="f">Building age (years)<input type="number" id="umur" name="umur" min={0} max={150} placeholder="e.g. 12" /></label>
        <label className="f">Number of floors
          <select id="lantai" name="lantai" defaultValue="">
            <option value="">—</option><option>1</option><option>2</option><option>3+</option>
          </select>
        </label>
        <label className="f">City<input type="text" id="kota" name="kota" placeholder="e.g. Jakarta" maxLength={80} /></label>
      </div>

      <button type="submit" className="btn" disabled={!foto.length || busy}>
        {busy ? "Assessing…" : "Assess home condition"}
      </button>
      {busy && <div className="progress" aria-hidden="true"><i /></div>}
      <div className={`status${status.err ? " err" : ""}`} role="status" aria-live="polite">{status.teks}</div>
    </form>
  );
}
