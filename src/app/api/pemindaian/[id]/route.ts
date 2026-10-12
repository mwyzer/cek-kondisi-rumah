import { put } from "@vercel/blob";
import { NextResponse } from "next/server";
import { ambilPemindaian, perbaruiPemindaian, type Pemindaian } from "@/lib/db";
import { cekJob, fitur3dAktif } from "@/lib/splat";

export const maxDuration = 300;

const publik = (p: Pemindaian) => ({ id: p.id, ruang: p.ruang, status: p.status, splatUrl: p.splatUrl, pesan: p.pesan });

// Status pemindaian. Saat masih memproses, tanyakan ke Modal; bila selesai, simpan hasilnya ke Blob.
export async function GET(_req: Request, ctx: RouteContext<"/api/pemindaian/[id]">) {
  const { id } = await ctx.params;
  const p = await ambilPemindaian(id);
  if (!p) return NextResponse.json({ error: "Pemindaian tidak ditemukan." }, { status: 404 });
  if (p.status !== "memproses" || !p.callId || !fitur3dAktif()) return NextResponse.json(publik(p));

  try {
    const job = await cekJob(p.callId);
    if (job.status === "gagal") {
      await perbaruiPemindaian(id, { status: "gagal", pesan: job.pesan });
    } else if (job.status === "selesai") {
      const blob = await put(`pemindaian/${id}.ply`, job.ply, {
        access: "public",
        contentType: "application/octet-stream",
        addRandomSuffix: true,
      });
      await perbaruiPemindaian(id, { status: "selesai", splatUrl: blob.url });
    }
  } catch (e) {
    // Gangguan sementara: biarkan status "memproses", browser akan bertanya lagi
    console.warn("Cek status Modal gagal:", e instanceof Error ? e.message : e);
  }
  return NextResponse.json(publik((await ambilPemindaian(id))!));
}
