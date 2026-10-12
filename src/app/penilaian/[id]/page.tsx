import Link from "next/link";
import { notFound } from "next/navigation";
import Laporan from "@/components/Laporan";
import Pemindaian3D from "@/components/Pemindaian3D";
import { ambilPenilaian, daftarPemindaian } from "@/lib/db";
import { fitur3dAktif } from "@/lib/splat";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/penilaian/[id]">) {
  const p = await ambilPenilaian((await params).id);
  return { title: p ? `Laporan ${p.kategori}` : "Laporan tidak ditemukan" };
}

export default async function HalamanLaporan({ params }: PageProps<"/penilaian/[id]">) {
  const { id } = await params;
  const [p, pemindaian] = await Promise.all([ambilPenilaian(id), daftarPemindaian(id)]);
  if (!p) notFound();

  return (
    <>
      <header className="hero">
        <Link href="/" className="eyebrow" style={{ textDecoration: "none" }}>← Penilaian baru</Link>
        <h1>Laporan kondisi rumah</h1>
      </header>
      <Laporan p={p} />
      <section className="report" style={{ marginTop: 24 }} aria-label="Pemindaian 3D">
        <Pemindaian3D
          penilaianId={p.id}
          aktif={fitur3dAktif()}
          awal={pemindaian.map((s) => ({ id: s.id, ruang: s.ruang, status: s.status, splatUrl: s.splatUrl, pesan: s.pesan }))}
        />
      </section>
    </>
  );
}
