import "server-only";

// Klien worker pemindaian 3D di Modal (folder splat/). Fitur aktif bila MODAL_SPLAT_URL,
// SPLAT_TOKEN, dan BLOB_READ_WRITE_TOKEN terisi.

export const HOST_VIDEO = ".public.blob.vercel-storage.com";
export const MAKS_HARIAN = Number(process.env.MAKS_PEMINDAIAN_HARIAN ?? 5);

export function fitur3dAktif() {
  return !!(process.env.MODAL_SPLAT_URL && process.env.SPLAT_TOKEN && process.env.BLOB_READ_WRITE_TOKEN);
}

// Modal memberi tiap endpoint URL sendiri: ...--mulai.modal.run dan ...--status.modal.run.
// MODAL_SPLAT_URL diisi URL endpoint "mulai"; URL "status" diturunkan darinya.
function url(endpoint: "mulai" | "status") {
  const dasar = process.env.MODAL_SPLAT_URL!.replace(/\/$/, "");
  return endpoint === "mulai" ? dasar : dasar.replace(/-mulai(\.modal\.run)/, "-status$1");
}

const header = () => ({ Authorization: `Bearer ${process.env.SPLAT_TOKEN}` });

export function urlVideoValid(u: string) {
  try {
    const x = new URL(u);
    return x.protocol === "https:" && x.hostname.endsWith(HOST_VIDEO);
  } catch {
    return false;
  }
}

export async function mulaiJob(videoUrl: string): Promise<string> {
  const res = await fetch(url("mulai"), {
    method: "POST",
    headers: { ...header(), "Content-Type": "application/json" },
    body: JSON.stringify({ video_url: videoUrl }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`Modal mulai HTTP ${res.status}: ${await res.text()}`);
  const { call_id } = (await res.json()) as { call_id?: string };
  if (!call_id) throw new Error("Modal tidak mengembalikan call_id");
  return call_id;
}

export type StatusJob =
  | { status: "memproses" }
  | { status: "gagal"; pesan: string }
  | { status: "selesai"; ply: ArrayBuffer };

export async function cekJob(callId: string): Promise<StatusJob> {
  const res = await fetch(`${url("status")}?call_id=${encodeURIComponent(callId)}`, {
    headers: header(),
    signal: AbortSignal.timeout(120_000), // hasil PLY bisa puluhan MB
  });
  if (!res.ok) throw new Error(`Modal status HTTP ${res.status}: ${await res.text()}`);
  if (res.headers.get("x-status") === "selesai") return { status: "selesai", ply: await res.arrayBuffer() };
  const j = (await res.json()) as { status: string; pesan?: string };
  return j.status === "gagal" ? { status: "gagal", pesan: j.pesan ?? "Pemrosesan 3D gagal." } : { status: "memproses" };
}
