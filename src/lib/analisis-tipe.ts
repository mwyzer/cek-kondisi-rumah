// Tipe & label hasil analisis foto Python; dipakai server dan komponen tampilan.

export type StatusKualitas = "baik" | "agak_buram" | "buram" | "gelap" | "terlalu_terang" | "resolusi_rendah";

export type AnalisisFoto = {
  indeks: number;
  lebar: number;
  tinggi: number;
  kualitas: { ketajaman: number; kecerahan: number; status: StatusKualitas; layak: boolean; catatan: string[] };
  retak: { jumlah: number; area_persen: number; panjang_relatif: number };
  noda: { jumlah: number; area_persen: number };
};

export const LABEL_KUALITAS: Record<StatusKualitas, string> = {
  baik: "Foto jelas",
  agak_buram: "Agak buram",
  buram: "Buram",
  gelap: "Terlalu gelap",
  terlalu_terang: "Terlalu terang",
  resolusi_rendah: "Resolusi rendah",
};
