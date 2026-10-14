import "server-only";
import { generateText, Output, type LanguageModel } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { z } from "zod";
import { KOMPONEN, KOMPONEN_IDS, URGENSI_IDS, type InfoBangunan, type Laporan } from "./penilaian";

const komponenSchema = z.object({
  skor: z.number().int().nullable().describe("1–5, or null if the component is not visible in any photo"),
  temuan: z.array(z.string()).describe("Concrete observations visible in the photos"),
  rekomendasi: z.string(),
  urgensi: z.enum(URGENSI_IDS),
  biaya_min: z.number().describe("Indonesian rupiah, whole number; 0 if no action is needed"),
  biaya_max: z.number().describe("Indonesian rupiah, whole number"),
  foto: z.array(z.number().int()).describe("Photo numbers supporting the assessment, e.g. [1, 3]"),
});

const laporanSchema = z.object({
  ringkasan: z.string().describe("2–3 sentences"),
  komponen: z.object(
    Object.fromEntries(KOMPONEN_IDS.map((id) => [id, komponenSchema])) as Record<
      (typeof KOMPONEN_IDS)[number],
      typeof komponenSchema
    >,
  ),
  risiko_keselamatan: z.array(z.string()),
  kualitas_foto: z.string().describe("One sentence"),
  foto_disarankan: z.array(z.string()).describe("Areas of the home that should be photographed"),
});

// Use Vercel AI Gateway (AI_GATEWAY_API_KEY), or an Anthropic-compatible endpoint
// when ANTHROPIC_API_KEY is set (direct Anthropic, or DeepSeek with ANTHROPIC_BASE_URL).
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
      info.tipe && `Building type / floor area: ${info.tipe}`,
      info.umur && `Building age: ${info.umur} years`,
      info.lantai && `Number of floors: ${info.lantai}`,
      info.kota && `Location: ${info.kota}`,
    ]
      .filter(Boolean)
      .join("\n") || "Not provided.";

  return `You are a residential building inspector in Indonesia. Assess the home's condition ONLY from details that are actually visible in the attached photos. Do not guess about components that cannot be seen.

Building information:
${data}

Attached photo order (user-provided labels):
${labels.map((l, i) => `Photo ${i + 1}: ${l}`).join("\n")}
${
  petunjuk
    ? `
Automated image-analysis results (OpenCV heuristics can be wrong: shadows, grout, or object edges may be detected as cracks or stains). Use these only as hints about where to look; make your decision based on what is actually visible in the photos. If a photo is marked blurry or dark, mention this limitation in "kualitas_foto".
${petunjuk}
`
    : ""
}
Components to assess: ${KOMPONEN.map((k) => `${k.id} = ${k.nama}`).join("; ")}.

Score each component from 1 to 5:
5 = excellent, no defects
4 = good, minor cosmetic defects only
3 = minor damage (hairline cracks, peeling paint, small water stains, displaced roof tiles)
2 = moderate damage (active leaks, sagging ceiling, cracks wider than 1 mm, rotten wood)
1 = severe or hazardous damage (structural diagonal cracks, damaged columns or beams, partial roof collapse)
null = component is not visible in any photo.

Costs: estimate repair costs in Indonesian rupiah using reasonable local material and labor prices for 2026${info.kota ? ` in ${info.kota}` : ""}. Use 0 if no action is needed.
Urgency: "segera" (hazardous or rapidly worsening), "3_bulan", "12_bulan", or "pemantauan".

Write all text values in English. If the photos do not show a home, set all scores to null and explain this in "ringkasan". Do not present this photo-based estimate as a professional structural diagnosis.`;
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
            { type: "text" as const, text: `Photo F${i + 1} (${f.label}):` },
            { type: "file" as const, mediaType: "image/jpeg", data: f.data },
          ]),
        ],
      },
    ],
  });
  return { laporan: output as Laporan, model: m.nama };
}
