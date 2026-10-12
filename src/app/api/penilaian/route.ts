import { NextResponse } from "next/server";
import { nilaiRumah } from "@/lib/ai";
import { analisisFoto, petunjukUntukAI } from "@/lib/analisis";
import { simpanPenilaian } from "@/lib/db";
import { hitung, MAX_FOTO, normalisasi, type InfoBangunan } from "@/lib/penilaian";

export const maxDuration = 300;

const MAX_BYTES = 5 * 1024 * 1024; // per foto, setelah diperkecil di browser
const MAX_THUMB = 200_000; // panjang data URL thumbnail

const teks = (v: FormDataEntryValue | null, max = 80) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export async function POST(req: Request) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Format permintaan tidak valid." }, { status: 400 });
  }

  const files = form.getAll("foto").filter((f): f is File => f instanceof File);
  const labels = form.getAll("label").map((l) => teks(l) || "Lainnya");
  const thumbs = form.getAll("thumb").map((t) => (typeof t === "string" ? t : ""));

  if (files.length === 0) return NextResponse.json({ error: "Unggah minimal 1 foto." }, { status: 400 });
  if (files.length > MAX_FOTO) return NextResponse.json({ error: `Maksimal ${MAX_FOTO} foto.` }, { status: 400 });
  for (const f of files) {
    if (f.type !== "image/jpeg") return NextResponse.json({ error: "Foto harus dikirim sebagai JPEG." }, { status: 400 });
    if (f.size > MAX_BYTES) return NextResponse.json({ error: "Ukuran foto terlalu besar." }, { status: 413 });
  }
  if (thumbs.some((t) => !t.startsWith("data:image/jpeg;base64,") || t.length > MAX_THUMB)) {
    return NextResponse.json({ error: "Thumbnail foto tidak valid." }, { status: 400 });
  }

  const info: InfoBangunan = {
    tipe: teks(form.get("tipe")) || undefined,
    umur: teks(form.get("umur"), 4).replace(/\D/g, "") || undefined,
    lantai: teks(form.get("lantai"), 4) || undefined,
    kota: teks(form.get("kota")) || undefined,
  };

  const foto = await Promise.all(
    files.map(async (f, i) => ({ data: new Uint8Array(await f.arrayBuffer()), label: labels[i] ?? "Lainnya" })),
  );

  // 1) Analisis gambar otomatis (Python/OpenCV), opsional
  const cv = await analisisFoto(foto.map((f) => f.data));

  // 2) Penilaian AI, dengan hasil analisis sebagai petunjuk
  let hasil;
  try {
    hasil = await nilaiRumah(foto, info, cv ? petunjukUntukAI(cv.foto) : undefined);
  } catch (e) {
    console.error("Penilaian AI gagal:", e);
    return NextResponse.json(
      { error: "AI gagal menilai foto. Coba lagi, atau kurangi jumlah foto." },
      { status: 502 },
    );
  }

  const laporan = normalisasi(hasil.laporan, foto.length);
  const h = hitung(laporan);
  const id = crypto.randomUUID();

  await simpanPenilaian({
    id,
    info,
    laporan,
    indeks: h.indeks,
    kategori: h.kategori.label,
    model: hasil.model,
    foto: foto.map((f, i) => {
      const a = cv?.foto[i];
      const overlay = a?.overlay.startsWith("data:image/jpeg;base64,") ? a.overlay : null;
      return {
        urutan: i + 1,
        label: f.label,
        thumb: thumbs[i],
        analisis: a
          ? { indeks: a.indeks, lebar: a.lebar, tinggi: a.tinggi, kualitas: a.kualitas, retak: a.retak, noda: a.noda, deteksi: a.deteksi ?? [] }
          : null,
        overlay,
      };
    }),
  });

  return NextResponse.json({ id });
}
