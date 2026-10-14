// Assessment rules shared by the server API and report page.
// AI only assigns a score from 1 to 5 per component; all derived values are calculated here.

export const KOMPONEN = [
  { id: "struktur", kode: "K-01", nama: "Structure (foundation, columns, beams)", bobot: 25 },
  { id: "atap", kode: "K-02", nama: "Roof and gutters", bobot: 20 },
  { id: "dinding", kode: "K-03", nama: "Walls", bobot: 15 },
  { id: "lantai", kode: "K-04", nama: "Flooring", bobot: 10 },
  { id: "plafon", kode: "K-05", nama: "Ceiling", bobot: 10 },
  { id: "kusen", kode: "K-06", nama: "Doors, windows, and frames", bobot: 8 },
  { id: "utilitas", kode: "K-07", nama: "Utilities (electrical, plumbing, sanitation)", bobot: 7 },
  { id: "finishing", kode: "K-08", nama: "Finishes and paint", bobot: 5 },
] as const;

export type KomponenId = (typeof KOMPONEN)[number]["id"];
export const KOMPONEN_IDS = KOMPONEN.map((k) => k.id) as [KomponenId, ...KomponenId[]];

export const URGENSI = {
  segera: { label: "Immediate", urut: 0 },
  "3_bulan": { label: "Within 3 months", urut: 1 },
  "12_bulan": { label: "Within 12 months", urut: 2 },
  pemantauan: { label: "Monitor", urut: 3 },
} as const;
export type Urgensi = keyof typeof URGENSI;
export const URGENSI_IDS = Object.keys(URGENSI) as [Urgensi, ...Urgensi[]];

export const RUANG = [
  "Front exterior", "Roof", "Living room", "Bedroom", "Kitchen", "Bathroom",
  "Ceiling", "Floor", "Porch / carport", "Yard / fence", "Damage detail", "Other",
];

const LEGACY_ROOM_LABELS: Record<string, string> = {
  "Fasad depan": "Front exterior",
  Atap: "Roof",
  "Ruang tamu": "Living room",
  "Kamar tidur": "Bedroom",
  Dapur: "Kitchen",
  "Kamar mandi": "Bathroom",
  Plafon: "Ceiling",
  Lantai: "Floor",
  "Teras / carport": "Porch / carport",
  "Halaman / pagar": "Yard / fence",
  "Detail kerusakan": "Damage detail",
  Lainnya: "Other",
};
export const roomLabel = (room: string) => LEGACY_ROOM_LABELS[room] ?? room;

export const MAX_FOTO = 10;

// Score 1–5 → component damage percentage
const RUSAK: Record<number, number> = { 5: 0, 4: 10, 3: 30, 2: 55, 1: 85 };

export type HasilKomponen = {
  skor: number | null; // null = not visible in the photos
  temuan: string[];
  rekomendasi: string;
  urgensi: Urgensi;
  biaya_min: number;
  biaya_max: number;
  foto: number[]; // 1-based photo numbers
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
  if (rusakPct == null) return { label: "Not assessable", tingkat: "na" };
  if (rusakPct < 10) return { label: "Good", tingkat: "ok" };
  if (rusakPct <= 30) return { label: "Minor damage", tingkat: "mild" };
  if (rusakPct <= 45) return { label: "Moderate damage", tingkat: "mid" };
  return { label: "Severe damage", tingkat: "severe" };
}

export function statusSkor(s: number | null): { label: string; tingkat: Tingkat } {
  if (s == null) return { label: "Not visible", tingkat: "na" };
  if (s >= 5) return { label: "Excellent", tingkat: "ok" };
  if (s === 4) return { label: "Good", tingkat: "ok" };
  if (s === 3) return { label: "Minor damage", tingkat: "mild" };
  if (s === 2) return { label: "Moderate damage", tingkat: "mid" };
  return { label: "Severe damage", tingkat: "severe" };
}

// Do not show the index or category below this visible component-weight coverage threshold.
export const CAKUPAN_MIN = 50;

// Weighted average; exclude invisible components and renormalize the remaining weights.
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
  const cakupan = w;
  const cukup = cakupan >= CAKUPAN_MIN;
  const rusak = w && cukup ? d / w : null;
  return {
    rusak,
    indeks: rusak == null ? null : Math.round(100 - rusak),
    cakupan,
    cukup,
    biayaMin: min,
    biayaMax: max,
    kategori: cukup ? kategori(rusak) : { label: "Insufficient data", tingkat: "na" as const },
  };
}

// Normalize AI output: scores outside 1–5 become null, costs are non-negative, and photo references are valid.
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

const fmt = new Intl.NumberFormat("en-US");
export const rp = (n: number) => "IDR " + fmt.format(Math.round(n));
export const rpRange = (a: number, b: number) => (!a && !b ? "—" : a === b ? rp(a) : `${rp(a)} – ${rp(b)}`);
export const persen = (n: number) => n.toFixed(1) + "%";
