// Types and labels for Python photo-analysis results, used by server and UI components.

export type StatusKualitas = "baik" | "agak_buram" | "buram" | "gelap" | "terlalu_terang" | "resolusi_rendah";

export type AnalisisFoto = {
  indeks: number;
  lebar: number;
  tinggi: number;
  kualitas: { ketajaman: number; kecerahan: number; status: StatusKualitas; layak: boolean; catatan: string[] };
  retak: { jumlah: number; area_persen: number; panjang_relatif: number };
  noda: { jumlah: number; area_persen: number };
  // Trained RF-DETR detections (empty or absent if the model is not installed).
  deteksi?: DeteksiModel[];
};

export type DeteksiModel = { kelas: string; skor: number; x: number; y: number; w: number; h: number };

// Summarize detections per class: count and highest confidence score.
export function ringkasDeteksi(d: DeteksiModel[] = []) {
  const m = new Map<string, { jumlah: number; skorMaks: number }>();
  for (const x of d) {
    const r = m.get(x.kelas) ?? { jumlah: 0, skorMaks: 0 };
    m.set(x.kelas, { jumlah: r.jumlah + 1, skorMaks: Math.max(r.skorMaks, x.skor) });
  }
  return [...m.entries()].map(([kelas, r]) => ({ kelas, ...r }));
}

export const LABEL_KUALITAS: Record<StatusKualitas, string> = {
  baik: "Clear photo",
  agak_buram: "Slightly blurry",
  buram: "Blurry",
  gelap: "Too dark",
  terlalu_terang: "Overexposed",
  resolusi_rendah: "Low resolution",
};
