import { NextResponse } from "next/server";
import { datasetAktif, eksporCoco } from "@/lib/dataset";

// Tulis dataset berlabel ke data/dataset/ekspor dalam format COCO untuk RF-DETR
export async function POST() {
  if (!datasetAktif()) return NextResponse.json({ error: "Alat dataset tidak aktif." }, { status: 403 });
  return NextResponse.json(await eksporCoco());
}
