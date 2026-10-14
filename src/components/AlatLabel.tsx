"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { KELAS, kelasById, type KelasId, type KotakLabel } from "@/lib/kelas-kerusakan";

type Props = {
  id: string;
  lebar: number;
  tinggi: number;
  awal: KotakLabel[];
  saran: KotakLabel[];
  status: "belum" | "selesai" | "dilewati";
  posisi: string; // "3 of 40"
  sebelumnya: string | null;
  berikutnya: string | null;
};

type Sudut = "kiri-atas" | "kanan-atas" | "kiri-bawah" | "kanan-bawah";
type Seret =
  | { mode: "baru"; x0: number; y0: number }
  | { mode: "geser"; idx: number; x0: number; y0: number; asli: KotakLabel }
  | { mode: "ubah"; idx: number; sudut: Sudut; asli: KotakLabel };

const bulat = <T extends { x: number; y: number; w: number; h: number }>(k: T): T => ({
  ...k, x: Math.round(k.x), y: Math.round(k.y), w: Math.round(k.w), h: Math.round(k.h),
});

const normal = (x0: number, y0: number, x1: number, y1: number) => ({
  x: Math.min(x0, x1), y: Math.min(y0, y1), w: Math.abs(x1 - x0), h: Math.abs(y1 - y0),
});

export default function AlatLabel(p: Props) {
  const router = useRouter();
  const svg = useRef<SVGSVGElement>(null);
  const [kotak, setKotak] = useState<KotakLabel[]>(p.awal);
  const [saran, setSaran] = useState<KotakLabel[]>(p.status === "belum" ? p.saran : []);
  const [kelas, setKelas] = useState<KelasId>(KELAS[0].id);
  const [pilih, setPilih] = useState<number | null>(null);
  const [draf, setDraf] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [riwayat, setRiwayat] = useState<KotakLabel[][]>([]);
  const [berubah, setBerubah] = useState(false);
  const [status, setStatus] = useState<{ teks: string; err?: boolean } | null>(null);
  const [konfirmasiHapus, setKonfirmasiHapus] = useState(false);
  const seret = useRef<Seret | null>(null);
  // Keep the latest draft in a ref: pointerup can arrive before the render after the last pointermove.
  const drafRef = useRef<{ x: number; y: number; w: number; h: number } | null>(null);

  const W = p.lebar, H = p.tinggi;
  const MIN = Math.max(W, H) * 0.008; // Smaller boxes are treated as clicks.
  const ukuranPegangan = Math.max(W, H) * 0.014;
  const ukuranTeks = Math.max(W, H) * 0.02;

  // Record each change in the undo history (maximum 50 steps).
  function ubahKotak(ubah: (k: KotakLabel[]) => KotakLabel[]) {
    setRiwayat((r) => [...r.slice(-49), kotak]);
    setKotak(ubah(kotak));
    setBerubah(true);
  }

  function undo() {
    if (!riwayat.length) return;
    setKotak(riwayat[riwayat.length - 1]);
    setRiwayat((r) => r.slice(0, -1));
    setPilih(null);
    setBerubah(true);
  }

  function titik(e: React.PointerEvent) {
    const r = svg.current!.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(W, ((e.clientX - r.left) / r.width) * W)),
      y: Math.max(0, Math.min(H, ((e.clientY - r.top) / r.height) * H)),
    };
  }

  function mulai(e: React.PointerEvent<SVGSVGElement>) {
    if (e.button !== 0) return;
    const t = titik(e);
    const el = e.target as Element;
    const idx = el.getAttribute("data-idx");
    const sudut = el.getAttribute("data-sudut") as Sudut | null;
    if (idx != null && sudut) {
      seret.current = { mode: "ubah", idx: Number(idx), sudut, asli: kotak[Number(idx)] };
    } else if (idx != null) {
      setPilih(Number(idx));
      setKelas(kotak[Number(idx)].kelas);
      seret.current = { mode: "geser", idx: Number(idx), x0: t.x, y0: t.y, asli: kotak[Number(idx)] };
    } else {
      setPilih(null);
      seret.current = { mode: "baru", x0: t.x, y0: t.y };
    }
    svg.current!.setPointerCapture(e.pointerId);
    if (seret.current.mode !== "baru") setRiwayat((r) => [...r.slice(-49), kotak]);
  }

  function gerak(e: React.PointerEvent<SVGSVGElement>) {
    const s = seret.current;
    if (!s) return;
    const t = titik(e);
    if (s.mode === "baru") {
      drafRef.current = normal(s.x0, s.y0, t.x, t.y);
      setDraf(drafRef.current);
    } else if (s.mode === "geser") {
      const dx = t.x - s.x0, dy = t.y - s.y0;
      const k = s.asli;
      setKotak((ks) => ks.map((x, i) => (i === s.idx
        ? { ...k, x: Math.max(0, Math.min(W - k.w, k.x + dx)), y: Math.max(0, Math.min(H - k.h, k.y + dy)) }
        : x)));
      setBerubah(true);
    } else {
      const k = s.asli;
      const kiri = s.sudut.startsWith("kiri"), atas = s.sudut.endsWith("atas");
      const x0 = kiri ? k.x + k.w : k.x, y0 = atas ? k.y + k.h : k.y;
      setKotak((ks) => ks.map((x, i) => (i === s.idx ? { ...k, ...normal(x0, y0, t.x, t.y) } : x)));
      setBerubah(true);
    }
  }

  function selesai() {
    const s = seret.current;
    const d = drafRef.current;
    seret.current = null;
    drafRef.current = null;
    if (s?.mode === "baru") {
      if (d && d.w >= MIN && d.h >= MIN) {
        ubahKotak((ks) => [...ks, { kelas, ...bulat(d) }]);
        setPilih(kotak.length);
      }
      setDraf(null);
    } else if (s) {
      setKotak((ks) => ks.map((k) => bulat(k)).filter((k) => k.w >= MIN && k.h >= MIN));
    }
  }

  function terimaSaran(idx?: number) {
    const diambil = idx == null ? saran : [saran[idx]];
    ubahKotak((ks) => [...ks, ...diambil]);
    setSaran((s) => (idx == null ? [] : s.filter((_, i) => i !== idx)));
  }

  const simpan = useCallback(
    async (st: "selesai" | "dilewati", lanjut: boolean) => {
      setStatus({ teks: "Saving…" });
      const res = await fetch(`/api/dataset/gambar/${p.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kotak, status: st }),
      });
      if (!res.ok) {
        setStatus({ teks: "Failed to save. Please try again.", err: true });
        return;
      }
      setBerubah(false);
      if (lanjut) router.push(p.berikutnya ? `/dataset/${p.berikutnya}` : "/dataset");
      else setStatus({ teks: st === "selesai" ? `Saved (${kotak.length} box(es)).` : "Marked as skipped." });
    },
    [kotak, p.id, p.berikutnya, router],
  );

  async function hapus() {
    const res = await fetch(`/api/dataset/gambar/${p.id}`, { method: "DELETE" });
    if (res.ok) router.push(p.berikutnya ? `/dataset/${p.berikutnya}` : "/dataset");
    else setStatus({ teks: "Failed to delete photo.", err: true });
  }

  // Keyboard shortcuts.
  useEffect(() => {
    function tombol(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        undo();
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const n = Number(e.key);
      if (n >= 1 && n <= KELAS.length) {
        const k = KELAS[n - 1].id;
        setKelas(k);
        if (pilih != null) ubahKotak((ks) => ks.map((x, i) => (i === pilih ? { ...x, kelas: k } : x)));
      } else if ((e.key === "Delete" || e.key === "Backspace") && pilih != null) {
        e.preventDefault();
        ubahKotak((ks) => ks.filter((_, i) => i !== pilih));
        setPilih(null);
      } else if (e.key === "Escape") {
        setPilih(null);
      } else if (e.key === "Enter") {
        e.preventDefault();
        simpan("selesai", true);
      } else if (e.key.toLowerCase() === "a" && saran.length) {
        terimaSaran();
      }
    }
    window.addEventListener("keydown", tombol);
    return () => window.removeEventListener("keydown", tombol);
  });

  // Warn before leaving with unsaved changes.
  useEffect(() => {
    if (!berubah) return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [berubah]);

  const terpilih = pilih != null ? kotak[pilih] : null;

  return (
    <div className="label-tool">
      <div className="label-canvas">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`/api/dataset/gambar/${p.id}`} alt="Photo being labeled" draggable={false} />
        <svg
          ref={svg}
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          onPointerDown={mulai}
          onPointerMove={gerak}
          onPointerUp={selesai}
          onPointerCancel={selesai}
          role="application"
          aria-label="Labeling area: drag to draw a damage bounding box"
        >
          {saran.map((k, i) => (
            <rect key={`s${i}`} x={k.x} y={k.y} width={k.w} height={k.h} className="kotak-saran"
              stroke={kelasById(k.kelas)?.warna} vectorEffect="non-scaling-stroke"
              onPointerDown={(e) => { e.stopPropagation(); terimaSaran(i); }}>
              <title>{`Suggestion: ${kelasById(k.kelas)?.nama}. Click to accept.`}</title>
            </rect>
          ))}
          {kotak.map((k, i) => {
            const warna = kelasById(k.kelas)?.warna ?? "#fff";
            const aktif = i === pilih;
            return (
              <g key={i}>
                <rect data-idx={i} x={k.x} y={k.y} width={k.w} height={k.h} className={`kotak${aktif ? " aktif" : ""}`}
                  stroke={warna} fill={warna} vectorEffect="non-scaling-stroke" />
                <text x={k.x} y={Math.max(ukuranTeks, k.y - ukuranTeks * 0.3)} fontSize={ukuranTeks} fill={warna} className="kotak-teks">
                  {kelasById(k.kelas)?.nama}
                </text>
                {aktif && (["kiri-atas", "kanan-atas", "kiri-bawah", "kanan-bawah"] as Sudut[]).map((s) => (
                  <rect key={s} data-idx={i} data-sudut={s} className={`pegangan ${s}`}
                    x={(s.startsWith("kiri") ? k.x : k.x + k.w) - ukuranPegangan / 2}
                    y={(s.endsWith("atas") ? k.y : k.y + k.h) - ukuranPegangan / 2}
                    width={ukuranPegangan} height={ukuranPegangan} />
                ))}
              </g>
            );
          })}
          {draf && (
            <rect x={draf.x} y={draf.y} width={draf.w} height={draf.h} className="kotak draf"
              stroke={kelasById(kelas)?.warna} fill={kelasById(kelas)?.warna} vectorEffect="non-scaling-stroke" />
          )}
        </svg>
      </div>

      <aside className="panel label-side">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <span className="eyebrow">Foto {p.posisi}</span>
          <span className="row" style={{ gap: 6 }}>
            {p.sebelumnya && <Link className="btn ghost" href={`/dataset/${p.sebelumnya}`} aria-label="Previous photo">←</Link>}
            {p.berikutnya && <Link className="btn ghost" href={`/dataset/${p.berikutnya}`} aria-label="Next photo">→</Link>}
          </span>
        </div>

        <div>
          <h3>Class {terpilih ? "for selected box" : "for new box"}</h3>
          <div className="kelas-list" role="radiogroup" aria-label="Damage class">
            {KELAS.map((k, i) => (
              <button key={k.id} type="button" role="radio" aria-checked={kelas === k.id}
                className={`kelas-btn${kelas === k.id ? " aktif" : ""}`} title={k.petunjuk}
                onClick={() => {
                  setKelas(k.id);
                  if (pilih != null) ubahKotak((ks) => ks.map((x, j) => (j === pilih ? { ...x, kelas: k.id } : x)));
                }}>
                <span className="swatch" style={{ background: k.warna }} aria-hidden="true" />
                <span className="mono">{i + 1}</span> {k.nama}
              </button>
            ))}
          </div>
        </div>

        {saran.length > 0 && (
          <div className="saran-box">
            <p><strong>{saran.length} automatic suggestion(s)</strong> (dashed outlines). Click a suggestion to accept it, or:</p>
            <div className="row">
              <button type="button" className="btn ghost" onClick={() => terimaSaran()}>Accept all (A)</button>
              <button type="button" className="btn ghost" onClick={() => setSaran([])}>Dismiss</button>
            </div>
          </div>
        )}

        <div className="row">
          {terpilih && (
            <button type="button" className="btn ghost" onClick={() => { ubahKotak((ks) => ks.filter((_, i) => i !== pilih)); setPilih(null); }}>
              Delete box (Del)
            </button>
          )}
          <button type="button" className="btn ghost" disabled={!riwayat.length} onClick={undo}>
            Undo (Ctrl+Z)
          </button>
        </div>

        <button type="button" className="btn" onClick={() => simpan("selesai", true)}>
          {kotak.length ? `Save ${kotak.length} box(es) & continue (Enter)` : "Save as no damage & continue (Enter)"}
        </button>
        <div className="row">
          <button type="button" className="btn ghost" onClick={() => simpan("dilewati", true)}>Skip photo</button>
          {konfirmasiHapus ? (
            <>
              <button type="button" className="btn ghost t-severe" onClick={hapus}>Yes, delete photo</button>
              <button type="button" className="btn ghost" onClick={() => setKonfirmasiHapus(false)}>Cancel</button>
            </>
          ) : (
            <button type="button" className="btn ghost" onClick={() => setKonfirmasiHapus(true)}>Delete photo…</button>
          )}
        </div>
        {status && <div className={`status${status.err ? " err" : ""}`} role="status" aria-live="polite">{status.teks}</div>}
        {berubah && !status && <div className="status">You have unsaved changes.</div>}

        <details className="foot">
          <summary>How to label</summary>
          <ul className="list">
            <li>Drag on the photo to draw a box using the selected class.</li>
            <li>Click a box to select it; drag to move it or drag a corner to resize it.</li>
            <li>Keys 1–{KELAS.length} select a class (and change the selected box's class).</li>
            <li>Draw boxes tightly around damage. Long cracks may be split into several boxes.</li>
            <li>Save photos without damage (no boxes) so the model can learn what is not damage.</li>
          </ul>
        </details>
      </aside>
    </div>
  );
}
