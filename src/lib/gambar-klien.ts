// Browser image processing (used by the assessment form and dataset tool).

export const TIPE_GAMBAR = ["image/jpeg", "image/png", "image/webp"];

// Draw a file to canvas with its longest edge <= max (EXIF orientation is applied).
export async function kanvasDari(file: File, ...maks: number[]) {
  const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
  const hasil = maks.map((m) => {
    const s = Math.min(1, m / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * s);
    c.height = Math.round(bmp.height * s);
    c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
    return c;
  });
  bmp.close();
  return hasil;
}

export function keJpeg(c: HTMLCanvasElement, q: number) {
  return new Promise<Blob>((ok, gagal) => c.toBlob((b) => (b ? ok(b) : gagal(new Error("toBlob"))), "image/jpeg", q));
}
