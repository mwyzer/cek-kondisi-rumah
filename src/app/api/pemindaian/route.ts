import { NextResponse } from "next/server";
import { adaPenilaian, buatPemindaian, jumlahPemindaian24Jam, perbaruiPemindaian } from "@/lib/db";
import { RUANG } from "@/lib/penilaian";
import { fitur3dAktif, MAKS_HARIAN, mulaiJob, urlVideoValid } from "@/lib/splat";

// Start a 3D scan for a video already uploaded to Vercel Blob.
export async function POST(req: Request) {
  if (!fitur3dAktif()) return NextResponse.json({ error: "3D scanning is not enabled." }, { status: 503 });

  const body = (await req.json().catch(() => ({}))) as { penilaianId?: string; ruang?: string; videoUrl?: string };
  const penilaianId = String(body.penilaianId ?? "");
  const ruang = RUANG.includes(String(body.ruang)) ? String(body.ruang) : "Other";
  const videoUrl = String(body.videoUrl ?? "");

  if (!urlVideoValid(videoUrl)) return NextResponse.json({ error: "Invalid video URL." }, { status: 400 });
  if (!(await adaPenilaian(penilaianId))) return NextResponse.json({ error: "Assessment report not found." }, { status: 404 });
  if ((await jumlahPemindaian24Jam()) >= MAKS_HARIAN) {
    return NextResponse.json(
      { error: `The daily limit of ${MAKS_HARIAN} scans has been reached. Please try again tomorrow.` },
      { status: 429 },
    );
  }

  const id = crypto.randomUUID();
  await buatPemindaian({ id, penilaianId, ruang, videoUrl });
  try {
    const callId = await mulaiJob(videoUrl);
    await perbaruiPemindaian(id, { status: "memproses", callId });
  } catch (e) {
    console.error("Failed to start Modal job:", e);
    await perbaruiPemindaian(id, { status: "gagal", pesan: "The 3D processing service could not be reached. Please try again later." });
  }
  return NextResponse.json({ id });
}
