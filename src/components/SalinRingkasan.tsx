"use client";

import { useState } from "react";

export default function SalinRingkasan({ teks }: { teks: string }) {
  const [label, setLabel] = useState("Copy summary");
  async function salin() {
    try {
      await navigator.clipboard.writeText(teks);
      setLabel("Copied");
    } catch {
      setLabel("Failed to copy");
    }
    setTimeout(() => setLabel("Copy summary"), 1800);
  }
  return <button type="button" className="btn ghost" onClick={salin}>{label}</button>;
}
