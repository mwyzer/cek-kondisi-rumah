// Aturan penilaian: dipakai bersama oleh API (server) dan halaman laporan.
// AI hanya memberi skor 1–5 per komponen; semua angka turunan dihitung di sini.

export const KOMPONEN = [
  { id: "struktur", kode: "K-01", nama: "Struktur (pondasi, kolom, balok)", bobot: 25 },
  { id: "atap", kode: "K-02", nama: "Atap & talang", bobot: 20 },
  { id: "dinding", kode: "K-03", nama: "Dinding", bobot: 15 },
  { id: "lantai", kode: "K-04", nama: "Lantai", bobot: 10 },
  { id: "plafon", kode: "K-05", nama: "Plafon", bobot: 10 },
  { id: "kusen", kode: "K-06", nama: "Pintu, jendela & kusen", bobot: 8 },
  { id: "utilitas", kode: "K-07", nama: "Utilitas (listrik, air, sanitasi)", bobot: 7 },
  { id: "finishing", kode: "K-08", nama: "Finishing & cat", bobot: 5 },
] as const;

export type KomponenId = (typeof KOMPONEN)[number]["id"];
export const KOMPONEN_IDS = KOMPONEN.map((k) => k.id) as [KomponenId, ...KomponenId[]];

export const URGENSI = {
  segera: { label: "Segera", urut: 0 },
  "3_bulan": { label: "≤ 3 bulan", urut: 1 },
  "12_bulan": { label: "≤ 12 bulan", urut: 2 },
  pemantauan: { label: "Pantau saja", urut: 3 },
} as const;
export type Urgensi = keyof typeof URGENSI;
export const URGENSI_IDS = Object.keys(URGENSI) as [Urgensi, ...Urgensi[]];

export const RUANG = [
  "Fasad depan", "Atap", "Ruang tamu", "Kamar tidur", "Dapur", "Kamar mandi",
  "Plafon", "Lantai", "Teras / carport", "Halaman / pagar", "Detail kerusakan", "Lainnya",
];

export const MAX_FOTO = 10;

// Skor 1–5 → persentase kerusakan komponen
const RUSAK: Record<number, number> = { 5: 0, 4: 10, 3: 30, 2: 55, 1: 85 };

export type HasilKomponen = {
  skor: number | null; // null = tidak terlihat di foto
  temuan: string[];
  rekomendasi: string;
  urgensi: Urgensi;
  biaya_min: number;
  biaya_max: number;
  foto: number[]; // nomor foto (1-based)
};

export type Laporan = {
  ringkasan: string;
  komponen: Record<KomponenId, HasilKomponen>;
  risiko_keselamatan: string[];
  kualitas_foto: string;
  foto_disarankan: string[];
};

export type InfoBangunan = { tipe?: string; umur?: string; lantai?: string; kota?: string };

export type Tingkat = "ok" | "mild" | "mid" | "severe" | "na";

export function kategori(rusakPct: number | null): { label: string; tingkat: Tingkat } {
  if (rusakPct == null) return { label: "Belum dapat dinilai", tingkat: "na" };
  if (rusakPct < 10) return { label: "Baik", tingkat: "ok" };
  if (rusakPct <= 30) return { label: "Rusak Ringan", tingkat: "mild" };
  if (rusakPct <= 45) return { label: "Rusak Sedang", tingkat: "mid" };
  return { label: "Rusak Berat", tingkat: "severe" };
}

export function statusSkor(s: number | null): { label: string; tingkat: Tingkat } {
  if (s == null) return { label: "Tidak terlihat", tingkat: "na" };
  if (s >= 5) return { label: "Sangat baik", tingkat: "ok" };
  if (s === 4) return { label: "Baik", tingkat: "ok" };
  if (s === 3) return { label: "Rusak ringan", tingkat: "mild" };
  if (s === 2) return { label: "Rusak sedang", tingkat: "mid" };
  return { label: "Rusak berat", tingkat: "severe" };
}

// Rata-rata berbobot; komponen tak terlihat dikeluarkan dan bobotnya dinormalkan ulang
export function hitung(lap: Laporan) {
  let w = 0, d = 0, min = 0, max = 0;
  for (const k of KOMPONEN) {
    const c = lap.komponen[k.id];
    min += c.biaya_min;
    max += c.biaya_max;
    if (c.skor == null) continue;
    w += k.bobot;
    d += k.bobot * RUSAK[c.skor];
  }
  const rusak = w ? d / w : null;
  return {
    rusak,
    indeks: rusak == null ? null : Math.round(100 - rusak),
    cakupan: w,
    biayaMin: min,
    biayaMax: max,
    kategori: kategori(rusak),
  };
}

// Membersihkan jawaban AI: skor di luar 1–5 jadi null, biaya tidak negatif, nomor foto valid
export function normalisasi(raw: Laporan, jumlahFoto: number): Laporan {
  const komponen = {} as Laporan["komponen"];
  for (const k of KOMPONEN) {
    const c = raw.komponen[k.id];
    let skor = c?.skor == null ? null : Math.round(c.skor);
    if (skor != null && !(skor >= 1 && skor <= 5)) skor = null;
    const a = Math.max(0, Math.round(c?.biaya_min ?? 0));
    const b = Math.max(a, Math.round(c?.biaya_max ?? 0));
    komponen[k.id] = {
      skor,
      temuan: (c?.temuan ?? []).slice(0, 6),
      rekomendasi: c?.rekomendasi ?? "",
      urgensi: c?.urgensi in URGENSI ? c.urgensi : "pemantauan",
      biaya_min: a,
      biaya_max: b,
      foto: [...new Set(c?.foto ?? [])].filter((n) => Number.isInteger(n) && n >= 1 && n <= jumlahFoto),
    };
  }
  return {
    ringkasan: raw.ringkasan,
    komponen,
    risiko_keselamatan: raw.risiko_keselamatan ?? [],
    kualitas_foto: raw.kualitas_foto ?? "",
    foto_disarankan: raw.foto_disarankan ?? [],
  };
}

const fmt = new Intl.NumberFormat("id-ID");
export const rp = (n: number) => "Rp" + fmt.format(Math.round(n));
export const rpRange = (a: number, b: number) => (!a && !b ? "—" : a === b ? rp(a) : `${rp(a)} – ${rp(b)}`);
export const persen = (n: number) => n.toFixed(1).replace(".", ",") + "%";
