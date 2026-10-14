import "server-only";

// Python photo-analysis service client (analyzer/). Optional: if ANALYZER_URL is empty
// or the service is unavailable, assessment continues without automated image analysis.

import { LABEL_KUALITAS, ringkasDeteksi, type AnalisisFoto } from "./analisis-tipe";
import { kelasById } from "./kelas-kerusakan";

export type { AnalisisFoto };
export type KotakSaran = { kelas: string; x: number; y: number; w: number; h: number };
export type HasilAnalisis = {
  versi: string;
  foto: (AnalisisFoto & { overlay: string; kotak?: KotakSaran[] })[];
};

export async function analisisFoto(foto: Uint8Array[]): Promise<HasilAnalisis | null> {
  const url = process.env.ANALYZER_URL;
  if (!url) return null;
  const form = new FormData();
  foto.forEach((f, i) => form.append("foto", new Blob([f as BlobPart], { type: "image/jpeg" }), `F${i + 1}.jpg`));
  try {
    const res = await fetch(`${url.replace(/\/$/, "")}/analisis`, {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
    const data = (await res.json()) as HasilAnalisis;
    if (!Array.isArray(data.foto) || data.foto.length !== foto.length) throw new Error("Result count does not match photo count.");
    return data;
  } catch (e) {
    console.warn("Python photo analysis skipped:", e instanceof Error ? e.message : e);
    return null;
  }
}

// Per-photo summary for the AI prompt.
export function petunjukUntukAI(a: AnalisisFoto[]): string {
  return a
    .map((f) => {
      const bagian = [`photo quality: ${LABEL_KUALITAS[f.kualitas.status].toLowerCase()}`];
      const model = ringkasDeteksi(f.deteksi);
      if (model.length) {
        bagian.push(
          "trained detection model: " +
            model.map((d) => `${d.jumlah}× ${kelasById(d.kelas)?.nama.toLowerCase() ?? d.kelas} (max confidence ${d.skorMaks.toFixed(2)})`).join(", "),
        );
      }
      if (f.retak.jumlah) bagian.push(`${f.retak.jumlah} possible crack line(s) (total length ${(f.retak.panjang_relatif * 100).toFixed(0)}% of photo diagonal)`);
      if (f.noda.jumlah) bagian.push(`${f.noda.jumlah} possible dark stain/leak mark(s) (${f.noda.area_persen.toFixed(1)}% of area)`);
      return `F${f.indeks}: ${bagian.join("; ")}`;
    })
    .join("\n");
}
