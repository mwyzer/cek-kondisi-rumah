import type { Metadata } from "next";
import Link from "next/link";
import { Archivo, IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import "./globals.css";

const display = Archivo({ variable: "--f-display", subsets: ["latin"], axes: ["wdth"] });
const body = IBM_Plex_Sans({ variable: "--f-body", subsets: ["latin"], weight: ["400", "500", "600"] });
const mono = IBM_Plex_Mono({ variable: "--f-mono", subsets: ["latin"], weight: ["400", "500"] });

export const metadata: Metadata = {
  title: { default: "Cek Kondisi Rumah", template: "%s · Cek Kondisi Rumah" },
  description: "Penilaian kondisi rumah otomatis dari foto, berbasis AI.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="id" className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <body>
        <div className="wrap">
          <nav className="nav">
            <Link href="/" className="brand">Cek Kondisi Rumah</Link>
            <span className="tape">Inspeksi visual · AI</span>
          </nav>
          {children}
          <footer className="foot site-foot">
            Penilaian visual AI dari foto, bukan pengganti inspeksi langsung oleh ahli bangunan bersertifikat.
          </footer>
        </div>
      </body>
    </html>
  );
}
