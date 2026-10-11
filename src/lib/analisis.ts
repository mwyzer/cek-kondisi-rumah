import "server-only";

// Klien layanan analisis foto Python (folder analyzer/). Opsional: bila ANALYZER_URL kosong
// atau layanan tidak menjawab, penilaian tetap berjalan tanpa hasil analisis otomatis.

import { LABEL_KUALITAS, type AnalisisFoto } from "./analisis-tipe";

export type { AnalisisFoto };
export type HasilAnalisis = { versi: string; foto: (AnalisisFoto & { overlay: string })[] };

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
    if (!Array.isArray(data.foto) || data.foto.length !== foto.length) throw new Error("Jumlah hasil tidak cocok");
    return data;
  } catch (e) {
    console.warn("Analisis foto Python dilewati:", e instanceof Error ? e.message : e);
    return null;
  }
}

// Ringkasan per foto untuk prompt AI
export function petunjukUntukAI(a: AnalisisFoto[]): string {
  return a
    .map((f) => {
      const bagian = [`kualitas: ${LABEL_KUALITAS[f.kualitas.status].toLowerCase()}`];
      if (f.retak.jumlah) bagian.push(`${f.retak.jumlah} garis kandidat retak (total panjang ${(f.retak.panjang_relatif * 100).toFixed(0)}% diagonal foto)`);
      if (f.noda.jumlah) bagian.push(`${f.noda.jumlah} bercak gelap kandidat noda/rembesan (${f.noda.area_persen.toFixed(1)}% area)`);
      return `F${f.indeks}: ${bagian.join("; ")}`;
    })
    .join("\n");
}
