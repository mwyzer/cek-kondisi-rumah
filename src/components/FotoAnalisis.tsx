"use client";

import { useState } from "react";
import { LABEL_KUALITAS } from "@/lib/analisis-tipe";
import type { FotoTersimpan } from "@/lib/db";

// Kartu satu foto: bisa beralih antara foto asli dan foto bertanda hasil analisis Python
export default function FotoAnalisis({ f }: { f: FotoTersimpan }) {
  const a = f.analisis;
  const [tanda, setTanda] = useState(!!f.overlay);
  const src = tanda && f.overlay ? f.overlay : f.thumb;
  const kualitasTingkat = !a ? "na" : a.kualitas.status === "baik" ? "ok" : a.kualitas.layak ? "mild" : "mid";

  return (
    <figure className="photo">
      <div className="img">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={`Foto ${f.urutan}: ${f.label}${tanda ? ", dengan penanda analisis" : ""}`} />
        <span className="num">F{f.urutan}</span>
      </div>
      <figcaption style={{ display: "grid", gap: 6 }}>
        <span className="row" style={{ justifyContent: "space-between" }}>
          <span>{f.label}</span>
          {f.overlay && (
            <button type="button" className="linkbtn" aria-pressed={tanda} onClick={() => setTanda((t) => !t)}>
              {tanda ? "Foto asli" : "Tampilkan penanda"}
            </button>
          )}
        </span>
        {a && (
          <span className="row" style={{ gap: 6 }}>
            <span className={`chip t-${kualitasTingkat}`} title={a.kualitas.catatan.join(" ")}>{LABEL_KUALITAS[a.kualitas.status]}</span>
            {a.retak.jumlah > 0 && <span className="chip t-severe">{a.retak.jumlah} indikasi retak</span>}
            {a.noda.jumlah > 0 && <span className="chip t-mid">Noda {a.noda.area_persen.toFixed(1).replace(".", ",")}% area</span>}
          </span>
        )}
      </figcaption>
    </figure>
  );
}
