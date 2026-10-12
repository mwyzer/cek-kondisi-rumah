// Kelas kerusakan untuk dataset deteksi (RF-DETR). Urutan = id kategori COCO (mulai 1)
// dan tombol pintas 1–9 di alat label. Jangan ubah urutan setelah ada model terlatih.

export const KELAS = [
  { id: "retak", nama: "Retak", petunjuk: "Retak dinding, plester, beton, atau kolom", warna: "#e5484d" },
  { id: "rembesan", nama: "Rembesan / noda air", petunjuk: "Bercak basah, noda kecokelatan, bekas bocor", warna: "#f76b15" },
  { id: "jamur", nama: "Jamur / lumut", petunjuk: "Bintik hitam/hijau, lumut di dinding", warna: "#30a46c" },
  { id: "cat_mengelupas", nama: "Cat mengelupas", petunjuk: "Cat menggelembung, mengelupas, atau rontok", warna: "#ffc53d" },
  { id: "plester_rusak", nama: "Plester terkelupas", petunjuk: "Acian/plester lepas sampai bata terlihat", warna: "#8e4ec6" },
  { id: "karat", nama: "Karat", petunjuk: "Karat pada besi, talang, rangka, atau tulangan", warna: "#a35829" },
  { id: "kayu_lapuk", nama: "Kayu lapuk / rayap", petunjuk: "Kusen, pintu, atau rangka kayu lapuk", warna: "#6e56cf" },
  { id: "keramik_rusak", nama: "Keramik rusak", petunjuk: "Keramik retak, pecah, atau terangkat", warna: "#0090ff" },
  { id: "plafon_rusak", nama: "Plafon rusak", petunjuk: "Plafon jebol, melendut, atau berlubang", warna: "#d6409f" },
] as const;

export type KelasId = (typeof KELAS)[number]["id"];
export const KELAS_IDS = KELAS.map((k) => k.id) as KelasId[];
export const kelasById = (id: string) => KELAS.find((k) => k.id === id);

// Kotak dalam piksel gambar yang disimpan (kiri-atas, lebar, tinggi)
export type KotakLabel = { kelas: KelasId; x: number; y: number; w: number; h: number };
