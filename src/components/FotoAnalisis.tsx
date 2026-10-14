"use client";

import { useState } from "react";
import { LABEL_KUALITAS, ringkasDeteksi } from "@/lib/analisis-tipe";
import { kelasById } from "@/lib/kelas-kerusakan";
import type { FotoTersimpan } from "@/lib/db";
import { roomLabel } from "@/lib/penilaian";

// A photo card that can switch between the original and the Python-analyzed image.
export default function FotoAnalisis({ f }: { f: FotoTersimpan }) {
  const a = f.analisis;
  const [tanda, setTanda] = useState(!!f.overlay);
  const src = tanda && f.overlay ? f.overlay : f.thumb;
  const label = roomLabel(f.label);
  const kualitasTingkat = !a ? "na" : a.kualitas.status === "baik" ? "ok" : a.kualitas.layak ? "mild" : "mid";

  return (
    <figure className="photo">
      <div className="img">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={`Photo ${f.urutan}: ${label}${tanda ? ", with analysis markers" : ""}`} />
        <span className="num">F{f.urutan}</span>
      </div>
      <figcaption style={{ display: "grid", gap: 6 }}>
        <span className="row" style={{ justifyContent: "space-between" }}>
          <span>{label}</span>
          {f.overlay && (
            <button type="button" className="linkbtn" aria-pressed={tanda} onClick={() => setTanda((t) => !t)}>
              {tanda ? "Original photo" : "Show analysis markers"}
            </button>
          )}
        </span>
        {a && (
          <span className="row" style={{ gap: 6 }}>
            <span className={`chip t-${kualitasTingkat}`} title={a.kualitas.catatan.join(" ")}>{LABEL_KUALITAS[a.kualitas.status]}</span>
            {ringkasDeteksi(a.deteksi).map((d) => (
              <span key={d.kelas} className="chip t-na" title={`Model detection, highest confidence ${d.skorMaks.toFixed(2)}`}>
                <span className="swatch" style={{ background: kelasById(d.kelas)?.warna }} aria-hidden="true" />
                {d.jumlah} {kelasById(d.kelas)?.nama.toLowerCase() ?? d.kelas}
              </span>
            ))}
            {a.retak.jumlah > 0 && <span className="chip t-severe">{a.retak.jumlah} crack indication(s)</span>}
            {a.noda.jumlah > 0 && <span className="chip t-mid">Stains: {a.noda.area_persen.toFixed(1)}% area</span>}
          </span>
        )}
      </figcaption>
    </figure>
  );
}
