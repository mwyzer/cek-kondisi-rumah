import "server-only";
import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, rm, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { koneksi } from "./db";
import { KELAS, KELAS_IDS, type KotakLabel } from "./kelas-kerusakan";

// Alat dataset hanya untuk dipakai lokal (belum ada login). Di produksi harus diaktifkan eksplisit.
export const datasetAktif = () => process.env.NODE_ENV !== "production" || process.env.DATASET_AKTIF === "1";

export const DIR_DATASET = path.join(process.cwd(), "data", "dataset");
const DIR_GAMBAR = path.join(DIR_DATASET, "gambar");
export const DIR_EKSPOR = path.join(DIR_DATASET, "ekspor");

export type StatusGambar = "belum" | "selesai" | "dilewati";

export type GambarDataset = {
  id: string;
  berkas: string;
  lebar: number;
  tinggi: number;
  namaAsal: string;
  status: StatusGambar;
  kotak: KotakLabel[];
  saran: KotakLabel[];
  dibuat: string;
};

function keGambar(x: Record<string, unknown>): GambarDataset {
  return {
    id: String(x.id),
    berkas: String(x.berkas),
    lebar: Number(x.lebar),
    tinggi: Number(x.tinggi),
    namaAsal: String(x.nama_asal),
    status: String(x.status) as StatusGambar,
    kotak: JSON.parse(String(x.kotak)),
    saran: JSON.parse(String(x.saran)),
    dibuat: String(x.dibuat),
  };
}

// Bersihkan kotak dari klien: kelas dikenal, angka bulat, di dalam gambar, tidak terlalu kecil
export function bersihkanKotak(raw: unknown, lebar: number, tinggi: number): KotakLabel[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 200).flatMap((k) => {
    if (!k || typeof k !== "object") return [];
    const o = k as Record<string, unknown>;
    if (!KELAS_IDS.includes(o.kelas as KotakLabel["kelas"])) return [];
    const x = Math.max(0, Math.round(Number(o.x)));
    const y = Math.max(0, Math.round(Number(o.y)));
    const w = Math.min(lebar - x, Math.round(Number(o.w)));
    const h = Math.min(tinggi - y, Math.round(Number(o.h)));
    if (![x, y, w, h].every(Number.isFinite) || w < 4 || h < 4) return [];
    return [{ kelas: o.kelas as KotakLabel["kelas"], x, y, w, h }];
  });
}

export async function simpanGambar(p: {
  data: Uint8Array;
  lebar: number;
  tinggi: number;
  namaAsal: string;
  saran: KotakLabel[];
}) {
  const id = crypto.randomUUID();
  const berkas = `${id}.jpg`;
  const file = path.join(DIR_GAMBAR, berkas);
  await mkdir(DIR_GAMBAR, { recursive: true });
  await writeFile(file, p.data);
  try {
    const c = await koneksi();
    const now = new Date().toISOString();
    await c.execute({
      sql: `INSERT INTO dataset_gambar (id, berkas, lebar, tinggi, nama_asal, saran, dibuat, diperbarui)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [id, berkas, p.lebar, p.tinggi, p.namaAsal.slice(0, 120), JSON.stringify(p.saran), now, now],
    });
  } catch (e) {
    await unlink(file).catch(() => {}); // jangan tinggalkan file tanpa baris database
    throw e;
  }
  return id;
}

export async function daftarGambar(): Promise<GambarDataset[]> {
  const c = await koneksi();
  const r = await c.execute("SELECT * FROM dataset_gambar ORDER BY dibuat");
  return r.rows.map(keGambar);
}

export async function ambilGambar(id: string): Promise<GambarDataset | null> {
  const c = await koneksi();
  const r = await c.execute({ sql: "SELECT * FROM dataset_gambar WHERE id = ?", args: [id] });
  return r.rows[0] ? keGambar(r.rows[0]) : null;
}

export async function bacaBerkas(g: GambarDataset) {
  return readFile(path.join(DIR_GAMBAR, path.basename(g.berkas)));
}

export async function simpanLabel(id: string, kotak: KotakLabel[], status: StatusGambar) {
  const c = await koneksi();
  await c.execute({
    sql: "UPDATE dataset_gambar SET kotak = ?, status = ?, diperbarui = ? WHERE id = ?",
    args: [JSON.stringify(kotak), status, new Date().toISOString(), id],
  });
}

export async function hapusGambar(g: GambarDataset) {
  const c = await koneksi();
  await c.execute({ sql: "DELETE FROM dataset_gambar WHERE id = ?", args: [g.id] });
  await unlink(path.join(DIR_GAMBAR, path.basename(g.berkas))).catch(() => {});
}

// Pembagian train/valid/test yang stabil: gambar yang sama selalu masuk bagian yang sama
export function bagian(id: string): "train" | "valid" | "test" {
  const n = createHash("sha1").update(id).digest()[0] / 256;
  return n < 0.8 ? "train" : n < 0.9 ? "valid" : "test";
}

// Ekspor ke format COCO yang dibaca RF-DETR: ekspor/{train,valid,test}/_annotations.coco.json + gambar
export async function eksporCoco() {
  const gambar = (await daftarGambar()).filter((g) => g.status === "selesai");
  await rm(DIR_EKSPOR, { recursive: true, force: true });

  const categories = KELAS.map((k, i) => ({ id: i + 1, name: k.id, supercategory: "kerusakan" }));
  const idKelas = new Map<string, number>(KELAS.map((k, i) => [k.id, i + 1]));
  const ringkasan: Record<string, { gambar: number; kotak: number }> = {};

  for (const b of ["train", "valid", "test"] as const) {
    const isi = gambar.filter((g) => bagian(g.id) === b);
    const dir = path.join(DIR_EKSPOR, b);
    await mkdir(dir, { recursive: true });
    let annId = 1;
    const images = [];
    const annotations = [];
    for (const [i, g] of isi.entries()) {
      await copyFile(path.join(DIR_GAMBAR, path.basename(g.berkas)), path.join(dir, g.berkas));
      images.push({ id: i + 1, file_name: g.berkas, width: g.lebar, height: g.tinggi });
      for (const k of g.kotak) {
        annotations.push({
          id: annId++,
          image_id: i + 1,
          category_id: idKelas.get(k.kelas)!,
          bbox: [k.x, k.y, k.w, k.h],
          area: k.w * k.h,
          iscrowd: 0,
        });
      }
    }
    await writeFile(path.join(dir, "_annotations.coco.json"), JSON.stringify({ images, annotations, categories }));
    ringkasan[b] = { gambar: images.length, kotak: annotations.length };
  }
  return { folder: DIR_EKSPOR, ringkasan };
}
