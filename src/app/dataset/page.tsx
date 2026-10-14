import Link from "next/link";
import { notFound } from "next/navigation";
import DatasetUnggah from "@/components/DatasetUnggah";
import EksporDataset from "@/components/EksporDataset";
import { datasetAktif, daftarGambar } from "@/lib/dataset";
import { KELAS } from "@/lib/kelas-kerusakan";

export const dynamic = "force-dynamic";
export const metadata = { title: "Damage Dataset" };

const TARGET_PER_KELAS = 100;

const STATUS = {
  belum: { teks: "Unlabeled", t: "na" },
  selesai: { teks: "Labeled", t: "ok" },
  dilewati: { teks: "Skipped", t: "mild" },
} as const;

export default async function HalamanDataset() {
  if (!datasetAktif()) notFound();
  const gambar = await daftarGambar();
  const selesai = gambar.filter((g) => g.status === "selesai");
  const jumlah = Object.fromEntries(KELAS.map((k) => [k.id, 0]));
  for (const g of selesai) for (const k of g.kotak) jumlah[k.kelas]++;
  const belum = gambar.filter((g) => g.status === "belum");

  return (
    <>
      <header className="hero">
        <Link href="/" className="eyebrow" style={{ textDecoration: "none" }}>← Assessment</Link>
        <h1>Damage dataset</h1>
        <p>
          Collect home photos and mark damage with bounding boxes. This dataset is used to train the RF-DETR detection
          model. Photos are stored locally in <span className="mono">data/dataset</span>.
        </p>
      </header>

      <div className="grid">
        <aside className="panel">
          <h2>Add photos</h2>
          <DatasetUnggah />
          <p className="foot">
            Suggested boxes for cracks and leaks are generated automatically when the Python analyzer is running.
            Review suggestions: remove incorrect boxes and adjust inaccurate ones.
          </p>
          {belum.length > 0 && (
            <Link className="btn" href={`/dataset/${belum[0].id}`}>Continue labeling ({belum.length} remaining)</Link>
          )}
          <h2>Export</h2>
          <EksporDataset siap={selesai.length} />
        </aside>

        <section style={{ display: "grid", gap: 16, minWidth: 0 }}>
          <div className="report section">
            <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
              <h2>Labels per class</h2>
              <span className="foot">
                {gambar.length} photos · {selesai.length} labeled · {belum.length} unlabeled
              </span>
            </div>
            <div className="tablewrap">
              <table>
                <thead><tr><th>Class</th><th>Boxes</th><th>Target: {TARGET_PER_KELAS}</th></tr></thead>
                <tbody>
                  {KELAS.map((k, i) => (
                    <tr key={k.id}>
                      <td>
                        <span className="swatch" style={{ background: k.warna }} aria-hidden="true" /> <span className="mono">{i + 1}</span> {k.nama}
                      </td>
                      <td className="num">{jumlah[k.id]}</td>
                      <td style={{ width: "40%" }}>
                        <div className="bar" role="img" aria-label={`${jumlah[k.id]} of ${TARGET_PER_KELAS}`}>
                          <i style={{ width: `${Math.min(100, (jumlah[k.id] / TARGET_PER_KELAS) * 100)}%`, background: k.warna }} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="foot">
              As a starting point, collect about {TARGET_PER_KELAS} boxes per class from a diverse range of homes.
              Undamaged photos are useful too: save them without boxes so the model can learn what is not damage.
            </p>
          </div>

          {gambar.length ? (
            <div className="ds-grid">
              {gambar.map((g) => (
                <Link key={g.id} href={`/dataset/${g.id}`} className="ds-item">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/api/dataset/gambar/${g.id}`} alt={g.namaAsal} loading="lazy" />
                  <span className="row" style={{ justifyContent: "space-between", gap: 6 }}>
                    <span className={`chip t-${STATUS[g.status].t}`}>{STATUS[g.status].teks}</span>
                    <span className="foot">{g.status === "belum" ? `${g.saran.length} suggestions` : `${g.kotak.length} boxes`}</span>
                  </span>
                </Link>
              ))}
            </div>
          ) : (
            <div className="empty">
              <h3>No photos yet</h3>
              <p className="muted">
                Add photos of home interiors and exteriors, including walls, ceilings, floors, bathrooms, and frames.
                Include both damaged and undamaged areas from different homes and lighting conditions.
              </p>
            </div>
          )}
        </section>
      </div>
    </>
  );
}
