import Link from "next/link";
import FormPenilaian from "@/components/FormPenilaian";
import { daftarPenilaian } from "@/lib/db";
import { kategori } from "@/lib/penilaian";

export const dynamic = "force-dynamic";

const TINGKAT_LABEL: Record<string, ReturnType<typeof kategori>["tingkat"]> = {
  Good: "ok", "Minor damage": "mild", "Moderate damage": "mid", "Severe damage": "severe",
  Baik: "ok", "Rusak Ringan": "mild", "Rusak Sedang": "mid", "Rusak Berat": "severe",
};

export default async function Home() {
  const riwayat = await daftarPenilaian();
  const categoryLabel: Record<string, string> = {
    Baik: "Good", "Rusak Ringan": "Minor damage", "Rusak Sedang": "Moderate damage", "Rusak Berat": "Severe damage",
  };

  return (
    <>
      <header className="hero">
        <h1>Photo-based home condition assessment</h1>
        <p>
          Upload photos of the home. AI assesses eight building components, assigns scores from 1 to 5, calculates a
          condition index and damage category, and provides repair priorities with estimated cost ranges.
        </p>
      </header>

      <div className="grid">
        <FormPenilaian />

        <section style={{ display: "grid", gap: 12, minWidth: 0 }} aria-labelledby="history">
          <h2 id="history">Assessment history</h2>
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
                      <span className={`chip t-${t}`}>{categoryLabel[r.kategori] ?? r.kategori}</span>
                      <span className="muted" style={{ display: "block", fontSize: "0.85rem", marginTop: 6 }}>
                        {new Date(r.dibuat).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" })}
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
              <h3>No assessments yet</h3>
              <p className="muted">
                Your reports, condition indices, and categories will appear here. Start by uploading photos of the
                exterior and any areas where you suspect damage.
              </p>
            </div>
          )}
        </section>
      </div>
    </>
  );
}
