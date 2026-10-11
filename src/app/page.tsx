import Link from "next/link";
import FormPenilaian from "@/components/FormPenilaian";
import { daftarPenilaian } from "@/lib/db";
import { kategori } from "@/lib/penilaian";

export const dynamic = "force-dynamic";

const TINGKAT_LABEL: Record<string, ReturnType<typeof kategori>["tingkat"]> = {
  Baik: "ok", "Rusak Ringan": "mild", "Rusak Sedang": "mid", "Rusak Berat": "severe",
};

export default async function Home() {
  const riwayat = await daftarPenilaian();

  return (
    <>
      <header className="hero">
        <h1>Penilaian kondisi rumah dari foto</h1>
        <p>
          Unggah foto bagian rumah. AI memeriksa 8 komponen bangunan, memberi skor 1–5, menghitung indeks kondisi dan
          tingkat kerusakan, lalu menyusun prioritas perbaikan beserta kisaran biaya.
        </p>
      </header>

      <div className="grid">
        <FormPenilaian />

        <section style={{ display: "grid", gap: 12, minWidth: 0 }} aria-labelledby="riwayat">
          <h2 id="riwayat">Riwayat penilaian</h2>
          {riwayat.length ? (
            <div className="history">
              {riwayat.map((r) => {
                const t = TINGKAT_LABEL[r.kategori] ?? "na";
                const info = [r.info.tipe, r.info.kota].filter(Boolean).join(" · ");
                return (
                  <Link key={r.id} href={`/penilaian/${r.id}`}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {r.thumb ? <img className="t" src={r.thumb} alt="" /> : <span className="t" />}
                    <span style={{ minWidth: 0 }}>
                      <span className={`chip t-${t}`}>{r.kategori}</span>
                      <span className="muted" style={{ display: "block", fontSize: "0.85rem", marginTop: 6 }}>
                        {new Date(r.dibuat).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" })}
                        {info && ` · ${info}`}
                      </span>
                    </span>
                    <span className={`score t-${t}`}>{r.indeks ?? "–"}</span>
                  </Link>
                );
              })}
            </div>
          ) : (
            <div className="empty">
              <h3>Belum ada penilaian</h3>
              <p className="muted">
                Laporan yang Anda buat akan muncul di sini, lengkap dengan indeks kondisi dan kategorinya. Mulai dengan
                mengunggah foto fasad dan bagian yang dicurigai rusak.
              </p>
            </div>
          )}
        </section>
      </div>
    </>
  );
}
