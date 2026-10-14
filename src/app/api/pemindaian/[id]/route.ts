import { put } from "@vercel/blob";
import { NextResponse } from "next/server";
import { ambilPemindaian, perbaruiPemindaian, type Pemindaian } from "@/lib/db";
import { roomLabel } from "@/lib/penilaian";
import { cekJob, fitur3dAktif } from "@/lib/splat";

export const maxDuration = 300;

const publik = (p: Pemindaian) => ({
  id: p.id,
  ruang: roomLabel(p.ruang),
  status: p.status,
  splatUrl: p.splatUrl,
  pesan: p.pesan,
});

// Check scan status in Modal while processing; save completed results to Blob.
export async function GET(_req: Request, ctx: RouteContext<"/api/pemindaian/[id]">) {
  const { id } = await ctx.params;
  const p = await ambilPemindaian(id);
  if (!p) return NextResponse.json({ error: "Scan not found." }, { status: 404 });
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
    // Leave the status as "memproses" during a temporary failure; the browser will poll again.
    console.warn("Failed to check Modal status:", e instanceof Error ? e.message : e);
  }
  return NextResponse.json(publik((await ambilPemindaian(id))!));
}
