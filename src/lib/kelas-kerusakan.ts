// Damage classes for the RF-DETR detection dataset. Order defines COCO category IDs (starting at 1)
// and the 1–9 keyboard shortcuts in the labeling tool. Do not change the order after training a model.

export const KELAS = [
  { id: "retak", nama: "Crack", petunjuk: "Cracks in walls, plaster, concrete, or columns", warna: "#e5484d" },
  { id: "rembesan", nama: "Water stain / leak", petunjuk: "Wet patches, brown stains, or signs of leakage", warna: "#f76b15" },
  { id: "jamur", nama: "Mold / mildew", petunjuk: "Black or green spots, or mildew on walls", warna: "#30a46c" },
  { id: "cat_mengelupas", nama: "Peeling paint", petunjuk: "Blistering, peeling, or flaking paint", warna: "#ffc53d" },
  { id: "plester_rusak", nama: "Damaged plaster", petunjuk: "Render or plaster missing down to the brickwork", warna: "#8e4ec6" },
  { id: "karat", nama: "Rust", petunjuk: "Rust on metal, gutters, framing, or reinforcement", warna: "#a35829" },
  { id: "kayu_lapuk", nama: "Wood rot / termites", petunjuk: "Rot or termite damage to frames, doors, or timber framing", warna: "#6e56cf" },
  { id: "keramik_rusak", nama: "Damaged tile", petunjuk: "Cracked, broken, or lifted tile", warna: "#0090ff" },
  { id: "plafon_rusak", nama: "Damaged ceiling", petunjuk: "Collapsed, sagging, or perforated ceiling", warna: "#d6409f" },
] as const;

export type KelasId = (typeof KELAS)[number]["id"];
export const KELAS_IDS = KELAS.map((k) => k.id) as KelasId[];
export const kelasById = (id: string) => KELAS.find((k) => k.id === id);

// Bounding box in the stored image's pixels (top-left, width, height).
export type KotakLabel = { kelas: KelasId; x: number; y: number; w: number; h: number };
