import {
  CAKUPAN_MIN, hitung, KOMPONEN, persen, rpRange, statusSkor, URGENSI,
  type Laporan as LaporanData, type Tingkat,
} from "@/lib/penilaian";
import type { Penilaian } from "@/lib/db";
import SalinRingkasan from "./SalinRingkasan";
import FotoAnalisis from "./FotoAnalisis";

function Meter({ skor, tingkat }: { skor: number | null; tingkat: Tingkat }) {
  return (
    <span className={`meter t-${tingkat}`} aria-label={`Score ${skor ?? "none"} out of 5`}>
      {[1, 2, 3, 4, 5].map((i) => <i key={i} className={skor != null && i <= skor ? "on" : ""} />)}
    </span>
  );
}

function Dial({ nilai, tingkat }: { nilai: number | null; tingkat: Tingkat }) {
  const r = 62, c = 2 * Math.PI * r, off = nilai == null ? c : c * (1 - nilai / 100);
  return (
    <div className={`dial t-${tingkat}`}>
      <svg viewBox="0 0 148 148" aria-hidden="true">
        <circle cx="74" cy="74" r={r} fill="none" stroke="var(--rule)" strokeWidth="10" />
        <circle className="arc" cx="74" cy="74" r={r} fill="none" stroke="currentColor" strokeWidth="10"
          strokeDasharray={c.toFixed(1)} strokeDashoffset={off.toFixed(1)} transform="rotate(-90 74 74)" />
      </svg>
      <div className="val"><b>{nilai ?? "–"}</b><span>OUT OF 100</span></div>
    </div>
  );
}

function teksRingkasan(lap: LaporanData, h: ReturnType<typeof hitung>) {
  return [
    "HOME CONDITION ASSESSMENT",
    `Condition index: ${h.indeks ?? "-"}/100 — ${h.kategori.label}`,
    `Damage level: ${h.rusak == null ? "-" : persen(h.rusak)}`,
    `Estimated cost: ${rpRange(h.biayaMin, h.biayaMax)}`,
    "",
    lap.ringkasan,
    "",
    ...KOMPONEN.map((k) => {
      const c = lap.komponen[k.id];
      return `- ${k.nama}: ${c.skor ?? "not visible"}/5 (${statusSkor(c.skor).label})${c.rekomendasi ? " — " + c.rekomendasi : ""}`;
    }),
  ].join("\n");
}

function ringkasAnalisis(p: Penilaian) {
  const a = p.foto.map((f) => f.analisis).filter((x) => x != null);
  if (!a.length) return { ada: false, ringkasan: "", model: false };
  const retak = a.filter((x) => x.retak.jumlah > 0).length;
  const noda = a.filter((x) => x.noda.jumlah > 0).length;
  const kurang = a.filter((x) => !x.kualitas.layak).length;
  const deteksi = a.reduce((n, x) => n + (x.deteksi?.length ?? 0), 0);
  const bagian = [
    deteksi > 0 && `${deteksi} model-detected issue(s)`,
    retak ? `${retak} photo(s) with crack indications` : "no crack indications",
    noda ? `${noda} photo(s) with stain indications` : "no stain indications",
    kurang && `${kurang} photo(s) may be unsuitable (blurry/dark)`,
  ].filter(Boolean);
  return { ada: true, ringkasan: bagian.join(" · "), model: deteksi > 0 };
}

export default function Laporan({ p }: { p: Penilaian }) {
  const lap = p.laporan;
  const h = hitung(lap);
  const aksi = KOMPONEN.map((k) => ({ k, c: lap.komponen[k.id] }))
    .filter(({ c }) => (c.skor != null && c.skor <= 3) || c.biaya_max > 0)
    .sort((a, b) => URGENSI[a.c.urgensi].urut - URGENSI[b.c.urgensi].urut || (a.c.skor ?? 9) - (b.c.skor ?? 9));
  const tidakTerlihat = KOMPONEN.filter((k) => lap.komponen[k.id].skor == null).map((k) => k.nama);
  const cv = ringkasAnalisis(p);
  const info = [p.info.tipe, p.info.umur && `${p.info.umur} tahun`, p.info.lantai && `${p.info.lantai} lantai`, p.info.kota]
    .filter(Boolean).join(" · ");

  return (
    <article className="report">
      <div className="rep-head">
        <Dial nilai={h.indeks} tingkat={h.kategori.tingkat} />
        <div style={{ minWidth: 0 }}>
          <div className="row">
            <span className="eyebrow">Assessment result</span>
            <span className={`chip t-${h.kategori.tingkat}`}>{h.kategori.label}</span>
          </div>
          <p className="summary">{lap.ringkasan}</p>
          {!h.cukup && (
            <p className="summary risk" style={{ padding: "10px 12px", marginTop: 12 }}>
              Only {h.cakupan}% of component weight is visible; the index requires at least {CAKUPAN_MIN}% coverage.
              Add photos of the roof, floors, ceilings, structure, or utilities, then reassess.
            </p>
          )}
          <div className="kpis">
            <div className="kpi"><span className="eyebrow">Damage level</span><b>{h.rusak == null ? "—" : persen(h.rusak)}</b></div>
            <div className="kpi"><span className="eyebrow">Estimated cost</span><b>{rpRange(h.biayaMin, h.biayaMax)}</b></div>
            <div className="kpi"><span className="eyebrow">Assessment coverage</span><b>{h.cakupan}% of weight</b></div>
          </div>
        </div>
      </div>

      <div className="section">
        <div className="meta-line">
          <span>Assessed {new Date(p.dibuat).toLocaleString("en-US", { dateStyle: "long", timeStyle: "short", timeZone: "Asia/Jakarta" })} Western Indonesia Time</span>
          {info && <span>{info}</span>}
          <span className="mono">{p.model}</span>
        </div>
        {cv.ada && (
          <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
            <h2>Automated photo analysis</h2>
            <span className="foot">{cv.ringkasan}</span>
          </div>
        )}
        <div className="photos" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))" }}>
          {p.foto.map((f) => <FotoAnalisis key={f.urutan} f={f} />)}
        </div>
        {cv.model && (
          <p className="foot">
            Labeled boxes on marked photos come from the RF-DETR damage-detection model trained on an annotated dataset;
            numbers in the boxes are model confidence scores. Detections can be wrong. The final assessment is made by AI
            from the photos themselves.
          </p>
        )}
        {cv.ada && !cv.model && (
          <p className="foot">
            <span className="t-severe">Red</span> markers = possible crack lines;{" "}
            <span className="t-mid">orange</span> outlines = possible stains or leaks. These are image-processing
            indicators (OpenCV), not diagnoses: shadows, grout, or object edges may also be marked. The final assessment
            above is made by AI from the photos themselves.
          </p>
        )}
      </div>

      {lap.risiko_keselamatan.length > 0 && (
        <div className="section">
          <div className="risk">
            <strong>Safety considerations</strong>
            <ul className="list">{lap.risiko_keselamatan.map((r, i) => <li key={i}>{r}</li>)}</ul>
          </div>
        </div>
      )}

      <div className="section">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h2>Repair priorities</h2>
          <SalinRingkasan teks={teksRingkasan(lap, h)} />
        </div>
        {aksi.length ? (
          <div className="tablewrap">
            <table>
              <thead><tr><th>Urgency</th><th>Component</th><th>Action</th><th>Cost</th></tr></thead>
              <tbody>
                {aksi.map(({ k, c }) => (
                  <tr key={k.id}>
                    <td><span className={`chip t-${statusSkor(c.skor).tingkat}`}>{URGENSI[c.urgensi].label}</span></td>
                    <td>{k.nama}</td>
                    <td>{c.rekomendasi}</td>
                    <td className="num">{rpRange(c.biaya_min, c.biaya_max)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="muted">No repairs need to be prioritized based on these photos.</p>
        )}
      </div>

      <div className="section">
        <h2>Component details</h2>
        <div>
          {KOMPONEN.map((k) => {
            const c = lap.komponen[k.id];
            const st = statusSkor(c.skor);
            return (
              <div className="comp" key={k.id}>
                <div className="code">{k.kode}<br />{k.bobot}%</div>
                <div style={{ minWidth: 0 }}>
                  <div className="comp-top">
                    <h3>{k.nama}</h3>
                    <span className="row"><Meter skor={c.skor} tingkat={st.tingkat} /><span className={`chip t-${st.tingkat}`}>{st.label}</span></span>
                  </div>
                  {c.temuan.length > 0 && <ul>{c.temuan.map((t, i) => <li key={i}>{t}</li>)}</ul>}
                  {c.rekomendasi && <div className="rec"><strong>Recommendation:</strong> {c.rekomendasi}</div>}
                  <div className="meta">
                    <span>Urgency: <b>{URGENSI[c.urgensi].label}</b></span>
                    <span className="mono">{rpRange(c.biaya_min, c.biaya_max)}</span>
                    {c.foto.length > 0 && <span>Photos: {c.foto.map((n) => "F" + n).join(", ")}</span>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="section">
        <div className="cols">
          <div>
            <h3>Score scale</h3>
            <div className="scale">
              <div><span className="mono">5</span> Excellent, no defects</div>
              <div><span className="mono">4</span> Good, cosmetic defects</div>
              <div><span className="mono">3</span> Minor damage</div>
              <div><span className="mono">2</span> Moderate damage</div>
              <div><span className="mono">1</span> Severe / hazardous damage</div>
            </div>
            <p className="foot" style={{ marginTop: 8 }}>
              Building category: &lt;10% Good · ≤30% Minor damage · ≤45% Moderate damage · &gt;45% Severe damage (based on PUPR building-damage thresholds).
            </p>
          </div>
          <div>
            <h3>Photo quality</h3>
            <p style={{ marginTop: 8 }}>{lap.kualitas_foto || "—"}</p>
            {tidakTerlihat.length > 0 && (
              <p className="foot" style={{ marginTop: 8 }}>Not visible and excluded from the index: {tidakTerlihat.join(", ")}.</p>
            )}
          </div>
          <div>
            <h3>Additional photos recommended</h3>
            {lap.foto_disarankan.length ? (
              <ul className="list" style={{ marginTop: 8 }}>{lap.foto_disarankan.map((f, i) => <li key={i}>{f}</li>)}</ul>
            ) : (
              <p className="muted" style={{ marginTop: 8 }}>None.</p>
            )}
          </div>
        </div>
        <p className="foot">
          Hidden damage (termites, pipes inside walls, or foundations) cannot be detected from photos. Costs are rough AI-generated estimates.
        </p>
      </div>
    </article>
  );
}
