"use client";

import { useState } from "react";

export default function SalinRingkasan({ teks }: { teks: string }) {
  const [label, setLabel] = useState("Salin ringkasan");
  async function salin() {
    try {
      await navigator.clipboard.writeText(teks);
      setLabel("Tersalin");
    } catch {
      setLabel("Gagal menyalin");
    }
    setTimeout(() => setLabel("Salin ringkasan"), 1800);
  }
  return <button type="button" className="btn ghost" onClick={salin}>{label}</button>;
}
