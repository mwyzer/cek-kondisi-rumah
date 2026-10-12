import {
  CAKUPAN_MIN, hitung, KOMPONEN, persen, rpRange, statusSkor, URGENSI,
  type Laporan as LaporanData, type Tingkat,
} from "@/lib/penilaian";
import type { Penilaian } from "@/lib/db";
import SalinRingkasan from "./SalinRingkasan";
import FotoAnalisis from "./FotoAnalisis";

function Meter({ skor, tingkat }: { skor: number | null; tingkat: Tingkat }) {
  return (
    <span className={`meter t-${tingkat}`} aria-label={`Skor ${skor ?? "tidak ada"} dari 5`}>
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
      <div className="val"><b>{nilai ?? "–"}</b><span>DARI 100</span></div>
    </div>
  );
}

function teksRingkasan(lap: LaporanData, h: ReturnType<typeof hitung>) {
  return [
    "PENILAIAN KONDISI RUMAH",
    `Indeks kondisi: ${h.indeks ?? "-"}/100 — ${h.kategori.label}`,
    `Tingkat kerusakan: ${h.rusak == null ? "-" : persen(h.rusak)}`,
    `Estimasi biaya: ${rpRange(h.biayaMin, h.biayaMax)}`,
    "",
    lap.ringkasan,
    "",
    ...KOMPONEN.map((k) => {
      const c = lap.komponen[k.id];
      return `- ${k.nama}: ${c.skor ?? "tidak terlihat"}/5 (${statusSkor(c.skor).label})${c.rekomendasi ? " — " + c.rekomendasi : ""}`;
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
    deteksi > 0 && `${deteksi} kerusakan terdeteksi model`,
    retak ? `${retak} foto dengan indikasi retak` : "tidak ada indikasi retak",
    noda ? `${noda} foto dengan indikasi noda` : "tidak ada indikasi noda",
    kurang && `${kurang} foto kurang layak (buram/gelap)`,
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
            <span className="eyebrow">Hasil penilaian</span>
            <span className={`chip t-${h.kategori.tingkat}`}>{h.kategori.label}</span>
          </div>
          <p className="summary">{lap.ringkasan}</p>
          {!h.cukup && (
            <p className="summary risk" style={{ padding: "10px 12px", marginTop: 12 }}>
              Baru {h.cakupan}% bobot komponen yang terlihat; indeks butuh minimal {CAKUPAN_MIN}%. Tambahkan foto
              {" "}atap, lantai, plafon, struktur, atau utilitas, lalu nilai ulang.
            </p>
          )}
          <div className="kpis">
            <div className="kpi"><span className="eyebrow">Tingkat kerusakan</span><b>{h.rusak == null ? "—" : persen(h.rusak)}</b></div>
            <div className="kpi"><span className="eyebrow">Estimasi biaya</span><b>{rpRange(h.biayaMin, h.biayaMax)}</b></div>
            <div className="kpi"><span className="eyebrow">Cakupan penilaian</span><b>{h.cakupan}% bobot</b></div>
          </div>
        </div>
      </div>

      <div className="section">
        <div className="meta-line">
          <span>Dinilai {new Date(p.dibuat).toLocaleString("id-ID", { dateStyle: "long", timeStyle: "short", timeZone: "Asia/Jakarta" })} WIB</span>
          {info && <span>{info}</span>}
          <span className="mono">{p.model}</span>
        </div>
        {cv.ada && (
          <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
            <h2>Analisis foto otomatis</h2>
            <span className="foot">{cv.ringkasan}</span>
          </div>
        )}
        <div className="photos" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))" }}>
          {p.foto.map((f) => <FotoAnalisis key={f.urutan} f={f} />)}
        </div>
        {cv.model && (
          <p className="foot">
            Kotak berlabel pada foto bertanda berasal dari model deteksi kerusakan (RF-DETR) yang dilatih dari dataset
            berlabel; angka di kotak adalah skor keyakinan model. Deteksi bisa keliru, dan penilaian akhir tetap dibuat AI
            dengan melihat fotonya langsung.
          </p>
        )}
        {cv.ada && !cv.model && (
          <p className="foot">
            Penanda <span className="t-severe">merah</span> = garis kandidat retak, garis tepi{" "}
            <span className="t-mid">oranye</span> = bercak kandidat noda/rembesan. Dideteksi dengan pengolahan citra
            (OpenCV), bukan diagnosis: bayangan, nat, atau tepi benda bisa ikut tertandai. Penilaian akhir di atas
            dibuat AI dengan melihat fotonya langsung.
          </p>
        )}
      </div>

      {lap.risiko_keselamatan.length > 0 && (
        <div className="section">
          <div className="risk">
            <strong>Perhatian keselamatan</strong>
            <ul className="list">{lap.risiko_keselamatan.map((r, i) => <li key={i}>{r}</li>)}</ul>
          </div>
        </div>
      )}

      <div className="section">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h2>Prioritas perbaikan</h2>
          <SalinRingkasan teks={teksRingkasan(lap, h)} />
        </div>
        {aksi.length ? (
          <div className="tablewrap">
            <table>
              <thead><tr><th>Urgensi</th><th>Komponen</th><th>Tindakan</th><th>Biaya</th></tr></thead>
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
          <p className="muted">Tidak ada perbaikan yang perlu diprioritaskan dari foto ini.</p>
        )}
      </div>

      <div className="section">
        <h2>Rincian per komponen</h2>
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
                  {c.rekomendasi && <div className="rec"><strong>Rekomendasi:</strong> {c.rekomendasi}</div>}
                  <div className="meta">
                    <span>Urgensi: <b>{URGENSI[c.urgensi].label}</b></span>
                    <span className="mono">{rpRange(c.biaya_min, c.biaya_max)}</span>
                    {c.foto.length > 0 && <span>Foto: {c.foto.map((n) => "F" + n).join(", ")}</span>}
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
            <h3>Skala skor</h3>
            <div className="scale">
              <div><span className="mono">5</span> Sangat baik, tanpa cacat</div>
              <div><span className="mono">4</span> Baik, cacat kosmetik</div>
              <div><span className="mono">3</span> Rusak ringan</div>
              <div><span className="mono">2</span> Rusak sedang</div>
              <div><span className="mono">1</span> Rusak berat / berbahaya</div>
            </div>
            <p className="foot" style={{ marginTop: 8 }}>
              Kategori bangunan: &lt;10% Baik · ≤30% Rusak Ringan · ≤45% Rusak Sedang · &gt;45% Rusak Berat (mengacu batas tingkat kerusakan bangunan gedung PUPR).
            </p>
          </div>
          <div>
            <h3>Kualitas foto</h3>
            <p style={{ marginTop: 8 }}>{lap.kualitas_foto || "—"}</p>
            {tidakTerlihat.length > 0 && (
              <p className="foot" style={{ marginTop: 8 }}>Tidak terlihat, dikeluarkan dari indeks: {tidakTerlihat.join(", ")}.</p>
            )}
          </div>
          <div>
            <h3>Foto tambahan yang disarankan</h3>
            {lap.foto_disarankan.length ? (
              <ul className="list" style={{ marginTop: 8 }}>{lap.foto_disarankan.map((f, i) => <li key={i}>{f}</li>)}</ul>
            ) : (
              <p className="muted" style={{ marginTop: 8 }}>Tidak ada.</p>
            )}
          </div>
        </div>
        <p className="foot">
          Kerusakan tersembunyi (rayap, pipa dalam dinding, pondasi) tidak dapat dideteksi dari foto. Biaya adalah perkiraan kasar AI.
        </p>
      </div>
    </article>
  );
}
