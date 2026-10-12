import { NextResponse } from "next/server";
import { adaPenilaian, buatPemindaian, jumlahPemindaian24Jam, perbaruiPemindaian } from "@/lib/db";
import { RUANG } from "@/lib/penilaian";
import { fitur3dAktif, MAKS_HARIAN, mulaiJob, urlVideoValid } from "@/lib/splat";

// Mulai pemindaian 3D untuk video yang sudah diunggah ke Vercel Blob
export async function POST(req: Request) {
  if (!fitur3dAktif()) return NextResponse.json({ error: "Pemindaian 3D belum diaktifkan." }, { status: 503 });

  const body = (await req.json().catch(() => ({}))) as { penilaianId?: string; ruang?: string; videoUrl?: string };
  const penilaianId = String(body.penilaianId ?? "");
  const ruang = RUANG.includes(String(body.ruang)) ? String(body.ruang) : "Lainnya";
  const videoUrl = String(body.videoUrl ?? "");

  if (!urlVideoValid(videoUrl)) return NextResponse.json({ error: "Alamat video tidak valid." }, { status: 400 });
  if (!(await adaPenilaian(penilaianId))) return NextResponse.json({ error: "Laporan tidak ditemukan." }, { status: 404 });
  if ((await jumlahPemindaian24Jam()) >= MAKS_HARIAN) {
    return NextResponse.json(
      { error: `Batas ${MAKS_HARIAN} pemindaian per hari tercapai. Coba lagi besok.` },
      { status: 429 },
    );
  }

  const id = crypto.randomUUID();
  await buatPemindaian({ id, penilaianId, ruang, videoUrl });
  try {
    const callId = await mulaiJob(videoUrl);
    await perbaruiPemindaian(id, { status: "memproses", callId });
  } catch (e) {
    console.error("Gagal memulai job Modal:", e);
    await perbaruiPemindaian(id, { status: "gagal", pesan: "Layanan pemrosesan 3D tidak dapat dihubungi. Coba lagi nanti." });
  }
  return NextResponse.json({ id });
}
