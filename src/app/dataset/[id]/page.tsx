import Link from "next/link";
import { notFound } from "next/navigation";
import AlatLabel from "@/components/AlatLabel";
import { datasetAktif, daftarGambar } from "@/lib/dataset";

export const dynamic = "force-dynamic";
export const metadata = { title: "Label kerusakan" };

export default async function HalamanLabel({ params }: PageProps<"/dataset/[id]">) {
  if (!datasetAktif()) notFound();
  const { id } = await params;
  const semua = await daftarGambar();
  const i = semua.findIndex((g) => g.id === id);
  if (i < 0) notFound();
  const g = semua[i];
  // "Berikutnya" mengutamakan foto yang belum dilabel
  const berikutnyaBelum = [...semua.slice(i + 1), ...semua.slice(0, i)].find((x) => x.status === "belum");
  const berikutnya = berikutnyaBelum?.id ?? semua[i + 1]?.id ?? null;

  return (
    <>
      <header className="hero" style={{ marginBottom: 16, paddingBottom: 12 }}>
        <Link href="/dataset" className="eyebrow" style={{ textDecoration: "none" }}>← Dataset</Link>
        <h1 style={{ fontSize: "1.6rem" }}>Label kerusakan</h1>
      </header>
      <AlatLabel
        key={g.id}
        id={g.id}
        lebar={g.lebar}
        tinggi={g.tinggi}
        awal={g.kotak}
        saran={g.saran}
        status={g.status}
        posisi={`${i + 1} dari ${semua.length}`}
        sebelumnya={semua[i - 1]?.id ?? null}
        berikutnya={berikutnya}
      />
    </>
  );
}
