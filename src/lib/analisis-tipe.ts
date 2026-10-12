// Tipe & label hasil analisis foto Python; dipakai server dan komponen tampilan.

export type StatusKualitas = "baik" | "agak_buram" | "buram" | "gelap" | "terlalu_terang" | "resolusi_rendah";

export type AnalisisFoto = {
  indeks: number;
  lebar: number;
  tinggi: number;
  kualitas: { ketajaman: number; kecerahan: number; status: StatusKualitas; layak: boolean; catatan: string[] };
  retak: { jumlah: number; area_persen: number; panjang_relatif: number };
  noda: { jumlah: number; area_persen: number };
  // Deteksi model RF-DETR terlatih (kosong/tidak ada bila model belum dipasang)
  deteksi?: DeteksiModel[];
};

export type DeteksiModel = { kelas: string; skor: number; x: number; y: number; w: number; h: number };

// Ringkas deteksi per kelas: jumlah dan skor tertinggi
export function ringkasDeteksi(d: DeteksiModel[] = []) {
  const m = new Map<string, { jumlah: number; skorMaks: number }>();
  for (const x of d) {
    const r = m.get(x.kelas) ?? { jumlah: 0, skorMaks: 0 };
    m.set(x.kelas, { jumlah: r.jumlah + 1, skorMaks: Math.max(r.skorMaks, x.skor) });
  }
  return [...m.entries()].map(([kelas, r]) => ({ kelas, ...r }));
}

export const LABEL_KUALITAS: Record<StatusKualitas, string> = {
  baik: "Foto jelas",
  agak_buram: "Agak buram",
  buram: "Buram",
  gelap: "Terlalu gelap",
  terlalu_terang: "Terlalu terang",
  resolusi_rendah: "Resolusi rendah",
};
