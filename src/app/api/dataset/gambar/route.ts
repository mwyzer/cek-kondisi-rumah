import { NextResponse } from "next/server";
import { analisisFoto } from "@/lib/analisis";
import { bersihkanKotak, datasetAktif, simpanGambar } from "@/lib/dataset";

const MAKS_FOTO = 20;
const MAKS_BYTES = 8 * 1024 * 1024;

// Tambah foto ke dataset. Foto sudah diperkecil di browser (JPEG, sisi terpanjang ≤ 2048 px).
export async function POST(req: Request) {
  if (!datasetAktif()) return NextResponse.json({ error: "Alat dataset tidak aktif." }, { status: 403 });

  const form = await req.formData().catch(() => null);
  const files = (form?.getAll("foto") ?? []).filter((f): f is File => f instanceof File);
  const lebar = (form?.getAll("lebar") ?? []).map(Number);
  const tinggi = (form?.getAll("tinggi") ?? []).map(Number);
  if (!files.length || files.length > MAKS_FOTO) {
    return NextResponse.json({ error: `Kirim 1–${MAKS_FOTO} foto per unggahan.` }, { status: 400 });
  }
  if (files.some((f) => f.type !== "image/jpeg" || f.size > MAKS_BYTES)) {
    return NextResponse.json({ error: "Foto harus JPEG dan maks. 8 MB." }, { status: 400 });
  }

  const data = await Promise.all(files.map(async (f) => new Uint8Array(await f.arrayBuffer())));
  // Saran kotak awal dari analisis Python (retak, rembesan); opsional
  const cv = await analisisFoto(data);

  const ids = [];
  for (const [i, f] of files.entries()) {
    const a = cv?.foto[i];
    const w = a?.lebar ?? lebar[i];
    const h = a?.tinggi ?? tinggi[i];
    if (!(w > 0 && h > 0)) return NextResponse.json({ error: "Ukuran foto tidak diketahui." }, { status: 400 });
    ids.push(
      await simpanGambar({
        data: data[i],
        lebar: w,
        tinggi: h,
        namaAsal: f.name,
        saran: bersihkanKotak(a?.kotak ?? [], w, h),
      }),
    );
  }
  return NextResponse.json({ ids, saran: !!cv });
}
