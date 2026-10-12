import Link from "next/link";
import { notFound } from "next/navigation";
import DatasetUnggah from "@/components/DatasetUnggah";
import EksporDataset from "@/components/EksporDataset";
import { datasetAktif, daftarGambar } from "@/lib/dataset";
import { KELAS } from "@/lib/kelas-kerusakan";

export const dynamic = "force-dynamic";
export const metadata = { title: "Dataset Kerusakan" };

const TARGET_PER_KELAS = 100;

const STATUS = {
  belum: { teks: "Belum dilabel", t: "na" },
  selesai: { teks: "Selesai", t: "ok" },
  dilewati: { teks: "Dilewati", t: "mild" },
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
        <Link href="/" className="eyebrow" style={{ textDecoration: "none" }}>← Penilaian</Link>
        <h1>Dataset kerusakan</h1>
        <p>
          Kumpulkan foto rumah dan tandai kerusakannya dengan kotak. Dataset ini dipakai untuk melatih model deteksi
          RF-DETR. Alat ini berjalan lokal; foto disimpan di folder <span className="mono">data/dataset</span>.
        </p>
      </header>

      <div className="grid">
        <aside className="panel">
          <h2>Tambah foto</h2>
          <DatasetUnggah />
          <p className="foot">
            Saran kotak untuk retak dan rembesan dibuat otomatis oleh analisis Python bila layanannya berjalan. Saran perlu
            diperiksa: hapus yang salah, rapikan yang kurang pas.
          </p>
          {belum.length > 0 && (
            <Link className="btn" href={`/dataset/${belum[0].id}`}>Lanjut melabel ({belum.length} tersisa)</Link>
          )}
          <h2>Ekspor</h2>
          <EksporDataset siap={selesai.length} />
        </aside>

        <section style={{ display: "grid", gap: 16, minWidth: 0 }}>
          <div className="report section">
            <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
              <h2>Label per kelas</h2>
              <span className="foot">
                {gambar.length} foto · {selesai.length} selesai · {belum.length} belum
              </span>
            </div>
            <div className="tablewrap">
              <table>
                <thead><tr><th>Kelas</th><th>Kotak</th><th>Menuju {TARGET_PER_KELAS}</th></tr></thead>
                <tbody>
                  {KELAS.map((k, i) => (
                    <tr key={k.id}>
                      <td>
                        <span className="swatch" style={{ background: k.warna }} aria-hidden="true" /> <span className="mono">{i + 1}</span> {k.nama}
                      </td>
                      <td className="num">{jumlah[k.id]}</td>
                      <td style={{ width: "40%" }}>
                        <div className="bar" role="img" aria-label={`${jumlah[k.id]} dari ${TARGET_PER_KELAS}`}>
                          <i style={{ width: `${Math.min(100, (jumlah[k.id] / TARGET_PER_KELAS) * 100)}%`, background: k.warna }} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="foot">
              Sebagai patokan awal, kumpulkan sekitar {TARGET_PER_KELAS} kotak per kelas dari foto rumah yang beragam. Foto
              tanpa kerusakan juga berguna: simpan tanpa kotak supaya model belajar apa yang bukan kerusakan.
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
                    <span className="foot">{g.status === "belum" ? `${g.saran.length} saran` : `${g.kotak.length} kotak`}</span>
                  </span>
                </Link>
              ))}
            </div>
          ) : (
            <div className="empty">
              <h3>Belum ada foto</h3>
              <p className="muted">
                Tambahkan foto rumah: dinding, plafon, lantai, kamar mandi, kusen, dan bagian luar. Sertakan yang rusak
                maupun yang baik, dari berbagai rumah dan kondisi cahaya.
              </p>
            </div>
          )}
        </section>
      </div>
    </>
  );
}
