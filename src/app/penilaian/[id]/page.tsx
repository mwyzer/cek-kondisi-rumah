import Link from "next/link";
import { notFound } from "next/navigation";
import Laporan from "@/components/Laporan";
import { ambilPenilaian } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/penilaian/[id]">) {
  const p = await ambilPenilaian((await params).id);
  return { title: p ? `Laporan ${p.kategori}` : "Laporan tidak ditemukan" };
}

export default async function HalamanLaporan({ params }: PageProps<"/penilaian/[id]">) {
  const p = await ambilPenilaian((await params).id);
  if (!p) notFound();

  return (
    <>
      <header className="hero">
        <Link href="/" className="eyebrow" style={{ textDecoration: "none" }}>← Penilaian baru</Link>
        <h1>Laporan kondisi rumah</h1>
      </header>
      <Laporan p={p} />
    </>
  );
}
