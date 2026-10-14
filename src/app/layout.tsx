import type { Metadata } from "next";
import Link from "next/link";
import { Archivo, IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import "./globals.css";

const display = Archivo({ variable: "--f-display", subsets: ["latin"], axes: ["wdth"] });
const body = IBM_Plex_Sans({ variable: "--f-body", subsets: ["latin"], weight: ["400", "500", "600"] });
const mono = IBM_Plex_Mono({ variable: "--f-mono", subsets: ["latin"], weight: ["400", "500"] });

export const metadata: Metadata = {
  title: { default: "Home Condition Assessment", template: "%s · Home Condition Assessment" },
  description: "AI-assisted home condition assessment from photos.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <body>
        <div className="wrap">
          <nav className="nav">
            <Link href="/" className="brand">Home Condition Assessment</Link>
            <span className="tape">Visual inspection · AI</span>
          </nav>
          {children}
          <footer className="foot site-foot">
            AI-assisted visual assessment from photos. This is not a substitute for an in-person inspection by a qualified building professional.
          </footer>
        </div>
      </body>
    </html>
  );
}
