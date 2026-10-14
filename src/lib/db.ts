import "server-only";
import { createClient, type Client } from "@libsql/client";
import { mkdirSync } from "node:fs";
import type { InfoBangunan, Laporan } from "./penilaian";
import type { AnalisisFoto } from "./analisis-tipe";

// Local: SQLite file in ./data. Production: set DATABASE_URL (+ DATABASE_AUTH_TOKEN) to a libSQL/Turso URL.
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
        `CREATE TABLE IF NOT EXISTS pemindaian (
          id TEXT PRIMARY KEY,
          penilaian_id TEXT NOT NULL REFERENCES penilaian(id) ON DELETE CASCADE,
          ruang TEXT NOT NULL,
          status TEXT NOT NULL,
          video_url TEXT NOT NULL,
          splat_url TEXT,
          call_id TEXT,
          pesan TEXT,
          dibuat TEXT NOT NULL,
          diperbarui TEXT NOT NULL
        )`,
        `CREATE INDEX IF NOT EXISTS pemindaian_penilaian ON pemindaian(penilaian_id, dibuat)`,
        `CREATE TABLE IF NOT EXISTS dataset_gambar (
          id TEXT PRIMARY KEY,
          berkas TEXT NOT NULL,
          lebar INTEGER NOT NULL,
          tinggi INTEGER NOT NULL,
          nama_asal TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'belum',
          kotak TEXT NOT NULL DEFAULT '[]',
          saran TEXT NOT NULL DEFAULT '[]',
          dibuat TEXT NOT NULL,
          diperbarui TEXT NOT NULL
        )`,
      ],
      "write",
    )
    .then(() => migrasi(client!));
  return { c: client, siap };
}

// Ready-to-use connection for other modules (e.g. dataset.ts).
export async function koneksi() {
  const { c, siap } = db();
  await siap;
  return c;
}

// Columns added after the initial version.
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

// ---------- Pemindaian 3D ----------

export type StatusPemindaian = "antre" | "memproses" | "selesai" | "gagal";

export type Pemindaian = {
  id: string;
  penilaianId: string;
  ruang: string;
  status: StatusPemindaian;
  videoUrl: string;
  splatUrl: string | null;
  callId: string | null;
  pesan: string | null;
  dibuat: string;
  diperbarui: string;
};

function kePemindaian(x: Record<string, unknown>): Pemindaian {
  const s = (v: unknown) => (v == null ? null : String(v));
  return {
    id: String(x.id),
    penilaianId: String(x.penilaian_id),
    ruang: String(x.ruang),
    status: String(x.status) as StatusPemindaian,
    videoUrl: String(x.video_url),
    splatUrl: s(x.splat_url),
    callId: s(x.call_id),
    pesan: s(x.pesan),
    dibuat: String(x.dibuat),
    diperbarui: String(x.diperbarui),
  };
}

export async function buatPemindaian(p: { id: string; penilaianId: string; ruang: string; videoUrl: string }) {
  const { c, siap } = db();
  await siap;
  const now = new Date().toISOString();
  await c.execute({
    sql: `INSERT INTO pemindaian (id, penilaian_id, ruang, status, video_url, dibuat, diperbarui)
          VALUES (?, ?, ?, 'antre', ?, ?, ?)`,
    args: [p.id, p.penilaianId, p.ruang, p.videoUrl, now, now],
  });
}

export async function perbaruiPemindaian(
  id: string,
  ubah: Partial<Pick<Pemindaian, "status" | "splatUrl" | "callId" | "pesan">>,
) {
  const { c, siap } = db();
  await siap;
  const kolom = { status: "status", splatUrl: "splat_url", callId: "call_id", pesan: "pesan" } as const;
  const set = Object.entries(ubah).filter(([, v]) => v !== undefined);
  if (!set.length) return;
  await c.execute({
    sql: `UPDATE pemindaian SET ${set.map(([k]) => `${kolom[k as keyof typeof kolom]} = ?`).join(", ")}, diperbarui = ? WHERE id = ?`,
    args: [...set.map(([, v]) => v as string | null), new Date().toISOString(), id],
  });
}

export async function ambilPemindaian(id: string): Promise<Pemindaian | null> {
  const { c, siap } = db();
  await siap;
  const r = await c.execute({ sql: "SELECT * FROM pemindaian WHERE id = ?", args: [id] });
  return r.rows[0] ? kePemindaian(r.rows[0]) : null;
}

export async function daftarPemindaian(penilaianId: string): Promise<Pemindaian[]> {
  const { c, siap } = db();
  await siap;
  const r = await c.execute({
    sql: "SELECT * FROM pemindaian WHERE penilaian_id = ? ORDER BY dibuat",
    args: [penilaianId],
  });
  return r.rows.map(kePemindaian);
}

// Number of scans started in the last 24 hours (for the daily GPU cost limit).
export async function jumlahPemindaian24Jam(): Promise<number> {
  const { c, siap } = db();
  await siap;
  const sejak = new Date(Date.now() - 86_400_000).toISOString();
  const r = await c.execute({ sql: "SELECT COUNT(*) AS n FROM pemindaian WHERE dibuat >= ?", args: [sejak] });
  return Number(r.rows[0].n);
}

export async function adaPenilaian(id: string): Promise<boolean> {
  const { c, siap } = db();
  await siap;
  const r = await c.execute({ sql: "SELECT 1 FROM penilaian WHERE id = ?", args: [id] });
  return r.rows.length > 0;
}
