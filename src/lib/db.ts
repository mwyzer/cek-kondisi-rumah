import "server-only";
import { createClient, type Client } from "@libsql/client";
import { mkdirSync } from "node:fs";
import type { InfoBangunan, Laporan } from "./penilaian";
import type { AnalisisFoto } from "./analisis-tipe";

// Lokal: file SQLite di ./data. Produksi: isi DATABASE_URL (+ DATABASE_AUTH_TOKEN) dengan URL libSQL/Turso.
const url = process.env.DATABASE_URL ?? "file:data/penilaian.db";

let client: Client | undefined;
let siap: Promise<void> | undefined;

function db() {
  if (!client) {
    if (url.startsWith("file:")) mkdirSync("data", { recursive: true });
    client = createClient({ url, authToken: process.env.DATABASE_AUTH_TOKEN });
  }
  siap ??= client
    .batch(
      [
        `CREATE TABLE IF NOT EXISTS penilaian (
          id TEXT PRIMARY KEY,
          dibuat TEXT NOT NULL,
          info TEXT NOT NULL,
          laporan TEXT NOT NULL,
          indeks INTEGER,
          kategori TEXT NOT NULL,
          model TEXT NOT NULL
        )`,
        `CREATE TABLE IF NOT EXISTS foto (
          penilaian_id TEXT NOT NULL REFERENCES penilaian(id) ON DELETE CASCADE,
          urutan INTEGER NOT NULL,
          label TEXT NOT NULL,
          thumb TEXT NOT NULL,
          PRIMARY KEY (penilaian_id, urutan)
        )`,
        `CREATE INDEX IF NOT EXISTS penilaian_dibuat ON penilaian(dibuat DESC)`,
      ],
      "write",
    )
    .then(() => migrasi(client!));
  return { c: client, siap };
}

// Kolom yang ditambahkan setelah versi pertama
async function migrasi(c: Client) {
  const kolom = new Set((await c.execute("PRAGMA table_info(foto)")).rows.map((r) => String(r.name)));
  const tambah = [
    !kolom.has("analisis") && "ALTER TABLE foto ADD COLUMN analisis TEXT",
    !kolom.has("overlay") && "ALTER TABLE foto ADD COLUMN overlay TEXT",
  ].filter((s): s is string => !!s);
  if (tambah.length) await c.batch(tambah, "write");
}

export type FotoTersimpan = {
  urutan: number;
  label: string;
  thumb: string;
  analisis: AnalisisFoto | null;
  overlay: string | null;
};

export type Penilaian = {
  id: string;
  dibuat: string;
  info: InfoBangunan;
  laporan: Laporan;
  indeks: number | null;
  kategori: string;
  model: string;
  foto: FotoTersimpan[];
};

export async function simpanPenilaian(p: Omit<Penilaian, "dibuat">) {
  const { c, siap } = db();
  await siap;
  await c.batch(
    [
      {
        sql: "INSERT INTO penilaian (id, dibuat, info, laporan, indeks, kategori, model) VALUES (?, ?, ?, ?, ?, ?, ?)",
        args: [p.id, new Date().toISOString(), JSON.stringify(p.info), JSON.stringify(p.laporan), p.indeks, p.kategori, p.model],
      },
      ...p.foto.map((f) => ({
        sql: "INSERT INTO foto (penilaian_id, urutan, label, thumb, analisis, overlay) VALUES (?, ?, ?, ?, ?, ?)",
        args: [p.id, f.urutan, f.label, f.thumb, f.analisis ? JSON.stringify(f.analisis) : null, f.overlay],
      })),
    ],
    "write",
  );
}

export async function ambilPenilaian(id: string): Promise<Penilaian | null> {
  const { c, siap } = db();
  await siap;
  const [r, f] = await c.batch(
    [
      { sql: "SELECT * FROM penilaian WHERE id = ?", args: [id] },
      { sql: "SELECT urutan, label, thumb, analisis, overlay FROM foto WHERE penilaian_id = ? ORDER BY urutan", args: [id] },
    ],
    "read",
  );
  const row = r.rows[0];
  if (!row) return null;
  return {
    id: String(row.id),
    dibuat: String(row.dibuat),
    info: JSON.parse(String(row.info)),
    laporan: JSON.parse(String(row.laporan)),
    indeks: row.indeks == null ? null : Number(row.indeks),
    kategori: String(row.kategori),
    model: String(row.model),
    foto: f.rows.map((x) => ({
      urutan: Number(x.urutan),
      label: String(x.label),
      thumb: String(x.thumb),
      analisis: x.analisis == null ? null : JSON.parse(String(x.analisis)),
      overlay: x.overlay == null ? null : String(x.overlay),
    })),
  };
}

export async function daftarPenilaian(limit = 12) {
  const { c, siap } = db();
  await siap;
  const r = await c.execute({
    sql: `SELECT p.id, p.dibuat, p.info, p.indeks, p.kategori,
            (SELECT thumb FROM foto WHERE penilaian_id = p.id ORDER BY urutan LIMIT 1) AS thumb
          FROM penilaian p ORDER BY p.dibuat DESC LIMIT ?`,
    args: [limit],
  });
  return r.rows.map((x) => ({
    id: String(x.id),
    dibuat: String(x.dibuat),
    info: JSON.parse(String(x.info)) as InfoBangunan,
    indeks: x.indeks == null ? null : Number(x.indeks),
    kategori: String(x.kategori),
    thumb: x.thumb == null ? null : String(x.thumb),
  }));
}
