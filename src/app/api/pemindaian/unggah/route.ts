import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import { adaPenilaian } from "@/lib/db";
import { fitur3dAktif } from "@/lib/splat";

// Generate a temporary token so the browser can upload a video directly to Vercel Blob.
export async function POST(req: Request) {
  if (!fitur3dAktif()) return NextResponse.json({ error: "3D scanning is not enabled." }, { status: 503 });

  const body = (await req.json()) as HandleUploadBody;
  try {
    const hasil = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        const penilaianId = (() => {
          try {
            return String(JSON.parse(clientPayload ?? "{}").penilaianId ?? "");
          } catch {
            return "";
          }
        })();
        if (!pathname.startsWith("pemindaian/") || !(await adaPenilaian(penilaianId))) {
          throw new Error("Assessment report not found.");
        }
        return {
          allowedContentTypes: ["video/mp4", "video/quicktime"],
          maximumSizeInBytes: 200 * 1024 * 1024,
          addRandomSuffix: true,
        };
      },
    });
    return NextResponse.json(hasil);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Upload rejected." }, { status: 400 });
  }
}
