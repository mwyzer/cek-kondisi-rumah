import { NextResponse } from "next/server";
import { datasetAktif, eksporCoco } from "@/lib/dataset";

// Write the labeled dataset to data/dataset/ekspor in COCO format for RF-DETR.
export async function POST() {
  if (!datasetAktif()) return NextResponse.json({ error: "The dataset tool is not enabled." }, { status: 403 });
  return NextResponse.json(await eksporCoco());
}
