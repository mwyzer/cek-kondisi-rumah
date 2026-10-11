import "server-only";
import { generateText, Output, type LanguageModel } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { z } from "zod";
import { KOMPONEN, KOMPONEN_IDS, URGENSI_IDS, type InfoBangunan, type Laporan } from "./penilaian";

const komponenSchema = z.object({
  skor: z.number().int().nullable().describe("1–5, atau null jika komponen tidak terlihat di foto mana pun"),
  temuan: z.array(z.string()).describe("Pengamatan konkret yang terlihat di foto"),
  rekomendasi: z.string(),
  urgensi: z.enum(URGENSI_IDS),
  biaya_min: z.number().describe("Rupiah, bilangan bulat; 0 jika tidak perlu tindakan"),
  biaya_max: z.number().describe("Rupiah, bilangan bulat"),
  foto: z.array(z.number().int()).describe("Nomor foto yang menjadi dasar penilaian, mis. [1, 3]"),
});

const laporanSchema = z.object({
  ringkasan: z.string().describe("2–3 kalimat"),
  komponen: z.object(
    Object.fromEntries(KOMPONEN_IDS.map((id) => [id, komponenSchema])) as Record<
      (typeof KOMPONEN_IDS)[number],
      typeof komponenSchema
    >,
  ),
  risiko_keselamatan: z.array(z.string()),
  kualitas_foto: z.string().describe("1 kalimat"),
  foto_disarankan: z.array(z.string()).describe("Bagian rumah yang perlu difoto tambahan"),
});

// Model lewat Vercel AI Gateway (AI_GATEWAY_API_KEY), atau endpoint kompatibel Anthropic
// bila ANTHROPIC_API_KEY diisi (Anthropic langsung, atau DeepSeek dengan ANTHROPIC_BASE_URL).
function model(): { model: LanguageModel; nama: string } {
  if (!process.env.AI_GATEWAY_API_KEY && process.env.ANTHROPIC_API_KEY) {
    const id = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5-5";
    const provider = createAnthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
      baseURL: process.env.ANTHROPIC_BASE_URL || undefined,
    });
    return { model: provider(id), nama: id };
  }
  const id = process.env.AI_MODEL ?? "anthropic/claude-sonnet-5.5";
  return { model: id, nama: id };
}

function buildPrompt(info: InfoBangunan, labels: string[], petunjuk?: string) {
  const data =
    [
      info.tipe && `Tipe/luas: ${info.tipe}`,
      info.umur && `Umur bangunan: ${info.umur} tahun`,
      info.lantai && `Jumlah lantai: ${info.lantai}`,
      info.kota && `Lokasi: ${info.kota}`,
    ]
      .filter(Boolean)
      .join("\n") || "Tidak diisi.";

  return `Anda adalah inspektur bangunan rumah tinggal di Indonesia. Nilai kondisi rumah HANYA dari yang benar-benar terlihat di foto terlampir. Jangan menebak komponen yang tidak tampak.

Data bangunan:
${data}

Urutan foto terlampir (label dari pengguna):
${labels.map((l, i) => `F${i + 1}: ${l}`).join("\n")}
${
  petunjuk
    ? `
Hasil analisis gambar otomatis (heuristik OpenCV, bisa keliru: bayangan, nat, atau tepi benda dapat terbaca sebagai retak/noda). Gunakan hanya sebagai petunjuk di mana harus melihat; putuskan berdasarkan apa yang benar-benar terlihat di foto. Bila foto ditandai buram atau gelap, sebutkan keterbatasannya di "kualitas_foto".
${petunjuk}
`
    : ""
}
Komponen yang dinilai: ${KOMPONEN.map((k) => `${k.id} = ${k.nama}`).join("; ")}.

Skala skor per komponen:
5 = sangat baik, tanpa cacat
4 = baik, hanya cacat kosmetik kecil
3 = rusak ringan (retak rambut, cat mengelupas, noda air kecil, genteng bergeser)
2 = rusak sedang (rembesan aktif, plafon melendut, retak lebar >1 mm, kayu lapuk)
1 = rusak berat / membahayakan (retak struktural diagonal, kolom/balok rusak, atap runtuh sebagian)
null = komponen tidak terlihat di foto mana pun.

Biaya: kisaran biaya perbaikan dalam Rupiah dengan harga material dan upah wajar di Indonesia tahun 2026${info.kota ? ` untuk ${info.kota}` : ""}. 0 jika tidak perlu tindakan.
Urgensi: "segera" (berbahaya / merusak cepat), "3_bulan", "12_bulan", atau "pemantauan".

Tulis semua teks dalam Bahasa Indonesia. Jika foto tidak menampilkan rumah sama sekali, isi semua skor null dan jelaskan di "ringkasan".`;
}

export async function nilaiRumah(
  foto: { data: Uint8Array; label: string }[],
  info: InfoBangunan,
  petunjuk?: string,
) {
  const m = model();
  const { output } = await generateText({
    model: m.model,
    maxOutputTokens: 8000,
    output: Output.object({ schema: laporanSchema }),
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: buildPrompt(info, foto.map((f) => f.label), petunjuk) },
          ...foto.flatMap((f, i) => [
            { type: "text" as const, text: `Foto F${i + 1} (${f.label}):` },
            { type: "file" as const, mediaType: "image/jpeg", data: f.data },
          ]),
        ],
      },
    ],
  });
  return { laporan: output as Laporan, model: m.nama };
}
