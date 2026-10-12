import { NextResponse } from "next/server";
import { ambilGambar, bacaBerkas, bersihkanKotak, datasetAktif, hapusGambar, simpanLabel, type StatusGambar } from "@/lib/dataset";

const STATUS: StatusGambar[] = ["belum", "selesai", "dilewati"];

// File gambar
export async function GET(_req: Request, ctx: RouteContext<"/api/dataset/gambar/[id]">) {
  if (!datasetAktif()) return NextResponse.json({ error: "Alat dataset tidak aktif." }, { status: 403 });
  const g = await ambilGambar((await ctx.params).id);
  if (!g) return NextResponse.json({ error: "Gambar tidak ditemukan." }, { status: 404 });
  const buf = await bacaBerkas(g);
  return new Response(new Uint8Array(buf), {
    headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=3600" },
  });
}

// Simpan label
export async function PUT(req: Request, ctx: RouteContext<"/api/dataset/gambar/[id]">) {
  if (!datasetAktif()) return NextResponse.json({ error: "Alat dataset tidak aktif." }, { status: 403 });
  const g = await ambilGambar((await ctx.params).id);
  if (!g) return NextResponse.json({ error: "Gambar tidak ditemukan." }, { status: 404 });
  const body = (await req.json().catch(() => ({}))) as { kotak?: unknown; status?: string };
  const status = STATUS.includes(body.status as StatusGambar) ? (body.status as StatusGambar) : "selesai";
  const kotak = bersihkanKotak(body.kotak, g.lebar, g.tinggi);
  await simpanLabel(g.id, kotak, status);
  return NextResponse.json({ ok: true, jumlah: kotak.length });
}

export async function DELETE(_req: Request, ctx: RouteContext<"/api/dataset/gambar/[id]">) {
  if (!datasetAktif()) return NextResponse.json({ error: "Alat dataset tidak aktif." }, { status: 403 });
  const g = await ambilGambar((await ctx.params).id);
  if (!g) return NextResponse.json({ error: "Gambar tidak ditemukan." }, { status: 404 });
  await hapusGambar(g);
  return NextResponse.json({ ok: true });
}
